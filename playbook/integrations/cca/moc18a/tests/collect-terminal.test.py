#!/usr/bin/env python3
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import mock_open, patch

sys.dont_write_bytecode = True
DOMAIN = Path(__file__).resolve().parents[1]
from cca_scripts_path import cca_scripts

sys.path[:0] = [str(DOMAIN), str(cca_scripts())]

from adapter.collect_terminal import (DeltaEvidence, actual_worker_records, collect_terminal,
                                      first_tape_fault, terminal_message)
from adapter.aux_step import latest_main_verdict
from adapter.main_step import terminal_reply
from adapter.phase_entry import phase_entry
from adapter.worker_step import assistant_reply
from adapter.case_body import pilot_budgets, pilot_level


class TerminalCollectionTest(unittest.TestCase):
    def test_requires_a_completed_native_assistant_terminal(self):
        terminal = {'info': {'role': 'assistant', 'finish': 'stop', 'time': {'completed': 1}},
                    'parts': [{'type': 'text', 'text': 'campaign complete: done'}]}
        self.assertTrue(terminal_message([terminal]))
        for info in ({'role': 'user', 'finish': 'stop', 'time': {'completed': 1}},
                     {'role': 'assistant', 'finish': 'tool-calls', 'time': {'completed': 1}},
                     {'role': 'assistant', 'finish': 'stop', 'time': {}}):
            self.assertFalse(terminal_message([{**terminal, 'info': info}]))
        self.assertFalse(terminal_message([{'info': terminal['info'], 'parts': []}]))
        self.assertFalse(terminal_message([]))

    def test_mock_protocol_errors_are_terminal_even_when_interpreter_exit_is_zero(self):
        tape = ('{"exit":0,"reply_head":"{}"}\n'
                '{"exit":0,"reply_head":"{\\"error\\":{\\"status\\":422,\\"code\\":\\"drift\\"}}"}\n'
                '{"exit":1,"reply_head":""}\n')
        self.assertEqual(first_tape_fault(tape), {'kind': 'mock_reply_error', 'request': 2,
                                                'status': 422, 'code': 'drift'})
        self.assertIsNone(first_tape_fault('{"exit":0,"reply_head":"{}"}\n{"exit":'))

    def test_reconstructed_timestamps_are_not_real_wait_witnesses(self):
        original = {'logical_label': 'one', 'first_request_ns': 12, 'first_tool_ns': 13,
                    'sleep_start_ns': 14, 'sleep_end_ns': 15, 'submit_start_ns': 16,
                    'terminal_ns': 17, 'planned_sleep_ns': 500000000, 'delta': {'label': 'one'}}
        records = actual_worker_records([{'records': [original]}])
        self.assertEqual(records, [{'logical_label': 'one', 'planned_sleep_ns': 500000000,
                                    'delta': {'label': 'one'}}])
        self.assertEqual(original['terminal_ns'], 17)

    def test_completed_terminal_still_requires_gate_files_for_timeline(self):
        import json
        level = pilot_level(2, 2, 2)
        budgets = pilot_budgets(level, 6, 3, 1800, 2, 4)
        artifact = SimpleNamespace(nodes=range(6), edges=range(3))
        graph = {'mode': 'fullset', 'artifact': artifact}
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'records').mkdir()
            (root / 'records' / 'timing-main-gate-analysis.json').write_text(json.dumps(
                {'phase': 'analysis', 'gate': 'analysis_final_gate_ns', 'at_ns': 7, 'call_id': 'main.s31',
                 'session': 'root-id'}))
            with patch('pathlib.Path.glob', return_value=[]), \
                    patch('pathlib.Path.iterdir', return_value=[Path(str(root / 'collection' / 'result.json'))]), \
                    patch('adapter.collect_terminal.collect') as original, \
                    patch('adapter.collect_terminal.os.link'):
                collect_terminal('/home', root, object(), graph, level, budgets, 1, True, None)
        machine = original.call_args.args[4]
        self.assertTrue(machine.main.done)
        self.assertEqual(machine.main.stats['timeline'], {'analysis_final_gate_ns': 7})

    def test_original_collector_is_used_and_result_is_published_last(self):
        level = pilot_level(2, 2, 2)
        budgets = pilot_budgets(level, 6, 3, 1800, 2, 4)
        artifact = SimpleNamespace(nodes=range(6), edges=range(3))
        graph = {'mode': 'fullset', 'artifact': artifact}
        with patch('pathlib.Path.glob', return_value=[]), patch('pathlib.Path.exists', return_value=False), \
             patch('pathlib.Path.mkdir'), patch('pathlib.Path.iterdir', return_value=[
                 Path('/lane/collection/result.json'), Path('/lane/collection/final-state.json')]), \
             patch('adapter.collect_terminal.collect') as original, \
             patch('adapter.collect_terminal.os.link') as link:
            fault = {'kind': 'mock_reply_error', 'request': 2}
            collect_terminal('/home', '/lane', object(), graph, level, budgets, 1, False, fault)
        machine = original.call_args.args[4]
        self.assertFalse(machine.main.done)
        self.assertEqual(machine.faults, [fault])
        self.assertEqual(machine.main.stats['timeline'], {})
        self.assertIsNone(machine.main.stats['inflight_peak'])
        self.assertEqual([call.args[0].name for call in link.call_args_list],
                         ['final-state.json', 'result.json'])

    def test_eqclass_entry_is_deferred_to_the_real_deployment_command(self):
        import json
        env = {'root': Path('/lane'), 'records': Path('/lane/records'), 'root_session': 'root-id',
               'entries': {'analysis': {'enter_fsm': {'name': 'analysis'}}}}
        setup = {'entry_command': ['launcher', 'entry', 'analysis'],
                 'names': {'CCodeEqClass-decoupled': 'eqclass'}, 'initial_vars': {'cca_workspace': '/lane/w'}}
        record = {'phase': 'eqclass', 'session': 'root-id',
                  'enter_fsm': {'name': 'eqclass', 'vars': setup['initial_vars']}}
        def read(path, **kwargs):
            return json.dumps(setup if path.name == 'setup.json' else record)
        with patch('pathlib.Path.read_text', read), patch('pathlib.Path.open', mock_open()) as opened, \
             patch('adapter.phase_entry.subprocess.run') as run:
            run.return_value = SimpleNamespace(returncode=0, stdout=json.dumps(record), stderr='')
            self.assertEqual(phase_entry(env, 'analysis'), env['entries']['analysis'])
            run.assert_not_called()
            self.assertEqual(phase_entry(env, 'eqclass'), record)
            self.assertEqual(run.call_args.args[0], ['launcher', 'entry', 'eqclass', '--session', 'root-id'])
            opened.assert_called_once()
            run.reset_mock()
            self.assertEqual(phase_entry(env, 'eqclass', replay=True), record)
            run.assert_not_called()
            run.return_value = SimpleNamespace(returncode=2, stdout='{"error":"not ready"}', stderr='')
            with self.assertRaisesRegex(RuntimeError, 'not ready'):
                phase_entry(env, 'eqclass')
            record['session'] = 'wrong-root'
            with self.assertRaisesRegex(RuntimeError, 'identity mismatch'):
                phase_entry(env, 'eqclass', replay=True)
            record['session'] = 'root-id'
            record['phase'] = 'analysis'
            with self.assertRaisesRegex(RuntimeError, 'identity mismatch'):
                phase_entry(env, 'eqclass', replay=True)
            record['phase'] = 'eqclass'
            record['enter_fsm']['name'] = 'wrong-fsm'
            with self.assertRaisesRegex(RuntimeError, 'identity mismatch'):
                phase_entry(env, 'eqclass', replay=True)

    def test_aux_gate_uses_latest_root_main_verdict_not_its_empty_session(self):
        import json
        verdict = {'action': 'wait_for_async_work', 'reason': '2 dispatched workers'}
        rows = [{'session': 'root-id', 'gate_verdict': verdict},
                {'session': 'worker-id', 'gate_verdict': {'action': 'continue_work'}}]
        env = {'records': Path('/lane/records'), 'root_session': 'root-id'}
        script = SimpleNamespace(gate_verdict=lambda: {'action': 'continue_work'})
        with patch('pathlib.Path.exists', return_value=True), \
             patch('pathlib.Path.read_text', return_value='\n'.join(map(json.dumps, rows))):
            self.assertEqual(latest_main_verdict(env, script), verdict)

    def test_worker_resume_returns_the_consumed_message_pointer(self):
        tool = {'action': 'tool', 'id': 'w1.s2', 'name': 'read', 'arguments': {'filePath': '/input'}}
        reply = assistant_reply(tool, 4)
        self.assertEqual(reply['pointer'], 4)
        self.assertEqual(reply['assistant']['content'][0]['name'], 'read')
        self.assertNotIn('pointer', assistant_reply(tool, None))
        self.assertEqual(assistant_reply({'action': 'text', 'text': 'done'}, 8)['pointer'], 8)
        self.assertEqual(terminal_reply('campaign complete', 8)['pointer'], 8)
        self.assertNotIn('pointer', terminal_reply('campaign complete', None))

    def test_per_request_budget_is_not_reported_as_global_usage(self):
        level = pilot_level(2, 2, 2)
        budgets = pilot_budgets(level, 6, 3, 1800, 2, 4)
        book = DeltaEvidence(level, 1, SimpleNamespace(nodes=range(6), edges=range(3)), budgets,
                             [{'delta': {'label': 'observed'}}])
        self.assertEqual(book.records, [{'label': 'observed'}])
        self.assertIsNone(book.usage()['used'])


if __name__ == '__main__':
    unittest.main()
