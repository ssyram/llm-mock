"""Collect the native terminal state with the checked-in moc18a collector."""
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace

sys.path[:0] = [str(Path(__file__).resolve().parent)]
from collect_run import collect
from cca_bench.suites.mock_delta import DeltaBook
from timing_capture import apply_worker_timing, load_gate_timeline

REPLAY_TIMES = {'first_request_ns', 'first_tool_ns', 'sleep_start_ns', 'sleep_end_ns',
                'submit_start_ns', 'terminal_ns'}


def terminal_message(messages):
    return any(message.get('info', {}).get('role') == 'assistant'
               and message.get('info', {}).get('finish') == 'stop'
               and message.get('info', {}).get('time', {}).get('completed')
               and any(part.get('type') == 'text' and 'campaign complete' in part.get('text', '').lower()
                       for part in message.get('parts', [])) for message in (messages or []))


def first_tape_fault(tape):
    for number, line in enumerate(tape.splitlines(keepends=True), 1):
        if not line.endswith('\n'):
            break
        row = json.loads(line)
        if row.get('exit') != 0 or row.get('slot_fault'):
            return {'kind': 'mock_process_or_slot_error', 'request': number,
                    'exit': row.get('exit'), 'slot_fault': row.get('slot_fault')}
        head = row.get('reply_head', '').lstrip()
        if head.startswith('{"error"'):
            try:
                error = json.loads(head).get('error', {})
            except ValueError:
                error = {}
            return {'kind': 'mock_reply_error', 'request': number,
                    'status': error.get('status'), 'code': error.get('code')}
    return None


def actual_worker_records(documents):
    records = []
    for document in documents:
        for record in document['records']:
            records.append({key: value for key, value in record.items() if key not in REPLAY_TIMES})
    return records


class WorkerEvidence:
    def __init__(self, records):
        self._records = records
        self.attempts = {record['logical_label']: record['attempt'] for record in records
                         if 'logical_label' in record and 'attempt' in record}

    def records(self):
        return self._records


class DeltaEvidence:
    def __init__(self, level, seed, artifact, budgets, records):
        book = DeltaBook(level, seed, len(artifact.nodes), len(artifact.edges), budgets)
        self.node_budget, self.edge_budget = book.node_budget, book.edge_budget
        self.records = [record['delta'] for record in records if 'delta' in record]
        self.bridge_state, self.bridge_records = 'not-configured', []

    def usage(self):
        return {'node_budget': self.node_budget, 'edge_budget': self.edge_budget, 'used': None}


def collect_terminal(home, root, lane, graph, level, budgets, seed, main_done=True, first_fault=None):
    root = Path(root)
    paths = sorted((root / 'records').glob('worker-*.json'), key=lambda path: path.stat().st_mtime_ns)
    documents = [json.loads(path.read_text(encoding='utf-8')) for path in paths]
    records = actual_worker_records(documents)
    for record in records:
        apply_worker_timing(record, root / 'records')
    counts = {}
    for record in records:
        phase = record.get('phase')
        if phase:
            phase_counts = counts.setdefault(phase, {})
            for event, observed in [('dispatched', True), ('submitted', record.get('submitted')),
                                    ('accepted', record.get('terminal_outcome') == 'accepted')]:
                if observed:
                    phase_counts[event] = phase_counts.get(event, 0) + 1
    faults = [first_fault] if first_fault else []
    machine = SimpleNamespace(
        workers=WorkerEvidence(records), ledger=SimpleNamespace(counts=counts), faults=faults,
        main=SimpleNamespace(done=main_done,
                             stats={'timeline': load_gate_timeline(root / 'records'), 'reserves': [],
                                    'inflight_peak': None}),
        fsm_slot_summary=lambda: {'available': False}, fsm_slot_events=[])
    deltas = DeltaEvidence(level, seed, graph['artifact'], budgets, records)
    staging = root / 'collection'
    staging.mkdir()
    collect(home, staging, lane, graph, machine, deltas)
    outputs = sorted(staging.iterdir(), key=lambda path: path.name == 'result.json')
    for path in outputs:
        os.link(path, root / path.name)
