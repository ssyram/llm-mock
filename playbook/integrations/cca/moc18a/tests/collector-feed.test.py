#!/usr/bin/env python3
"""新产出→采集器直连验证：用 l4b 真实 4 节点原生记录离线喂原采集器。

时间线文件是本测试的合成 fixture（真实原生窗口只能由原生运行产生，a688 负责）：
只用于验证采集器在证据齐备时判 ok、证据缺失/失序时照旧失败——缺失形状与
l4b 实测 result.json 的 problems 逐字对齐。
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.dont_write_bytecode = True
DOMAIN = Path(__file__).resolve().parents[1]
PROJECT = Path('/Users/ssyram/workspace/work-fv/c-code-verify/.local/analysis-decouple')
EVIDENCE = PROJECT / '.pi/npr/l4b'
sys.path[:0] = [str(DOMAIN), str(PROJECT / '.local/cca-newtree-sut-20261117/scripts'),
                str(PROJECT / '.pi/research/gate-latency-mock-148')]

from adapter.collect_terminal import collect_terminal
from adapter.spec_graph import consume_graph_spec
from pilot.case_body import pilot_budgets, pilot_level
import collect_run

BASE_NS = 1_795_100_000_000_000_000
ROOT = 'ses_e1121a51effeQkArPxCxD6IsYd'


def prepare_lane(records, timing="full", gates=("analysis", "eqclass")):
    workers = []
    for stamp, source in enumerate(sorted((EVIDENCE / 'records').glob('worker-*.json'))):
        target = records / source.name
        target.write_text(source.read_text(encoding='utf-8'), encoding='utf-8')
        os.utime(target, ns=(stamp * 1_000_000, stamp * 1_000_000))
        workers.append(json.loads(target.read_text(encoding='utf-8'))['records'][0])
    for index, record in enumerate(workers):
        if timing == "none":
            continue
        record = dict(record)
        task = record['logical_task_tag']
        if timing == "wrong-session" and task == "w3":
            record['session_id'] = "ses-not-this-run"
        write_timing(records, record, BASE_NS + index * 100_000_000,
                     100_000_000 if (timing == "short-plan" and task == "w4") else None,
                     timing == "disordered" and task == "w4")
    for phase in gates:
        (records / ('timing-main-gate-%s.json' % phase)).write_text(json.dumps(
            {"phase": phase, "gate": '%s_final_gate_ns' % phase,
             "at_ns": BASE_NS + 30_000_000_000 if phase == "analysis" else BASE_NS + 60_000_000_000,
             "call_id": "main.s41", "session": ROOT}), encoding='utf-8')


def write_timing(records, record, base_ns, planned_override=None, disordered=False):
    planned = planned_override or record['planned_sleep_ns']
    document = {"task": record['logical_task_tag'], "phase": record['phase'],
                "session_id": record['session_id'], "first_request_ns": base_ns,
                "wait_planned_ns": planned, "wait_start_ns": base_ns + 50_000_000,
                "wait_end_ns": base_ns + 52_000_000 + planned,
                "wait_actual_mono_ns": planned + 2_000_000,
                "submit_start_ns": base_ns + 60_000_000 + planned,
                "terminal_ns": base_ns + 65_000_000 + planned}
    if disordered:
        document["wait_start_ns"], document["wait_end_ns"] = document["wait_end_ns"], document["wait_start_ns"]
    (records / ('timing-worker-%s.json' % record['logical_task_tag'])).write_text(
        json.dumps(document), encoding='utf-8')


def run_collect(lane_root):
    spec = json.loads((EVIDENCE / 'input-spec.json').read_text(encoding='utf-8'))
    artifact = consume_graph_spec(spec)
    level = pilot_level(spec['parallel'], spec['batch'], spec['mock']['max_new_nodes'])
    budgets = pilot_budgets(level, len(spec['nodes']), len(spec['edges']), 1800,
                            spec['mock']['max_new_nodes'], spec['mock']['max_new_facts'])
    graph = {"mode": spec["mode"], "artifact": artifact, "entries": None, "bridge": None,
             "unreachable": []}
    lane = SimpleNamespace(workspace=str(EVIDENCE / 'w'), root_session=ROOT,
                           sessions=lambda: json.loads((EVIDENCE / 'native-sessions.json').read_text()),
                           request=lambda *args: (200, json.loads((EVIDENCE / 'main-messages.json')
                                                                  .read_text())),
                           processes={})
    snapshot = {"state": json.loads((EVIDENCE / 'final-state.json').read_text(encoding='utf-8'))["state"]}
    with patch("collect_run.ProductCLI",
               lambda *args, **kwargs: SimpleNamespace(service_snapshot=lambda: snapshot)):
        collect_terminal(PROJECT / '.local/cca-newtree-sut-20261117', lane_root, lane, graph,
                         level, budgets, spec['seed'], True, None)
    return json.loads((lane_root / 'result.json').read_text(encoding='utf-8'))


class CollectorFeedTest(unittest.TestCase):
    def test_real_native_records_with_full_observations_pass_the_original_collector(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'records').mkdir()
            prepare_lane(Path(tmp) / 'records')
            result = run_collect(Path(tmp))
        self.assertEqual(result['status'], 'ok')
        self.assertEqual(result['problems'], [])
        self.assertEqual(sorted(result['timeline']), ['analysis_final_gate_ns', 'eqclass_final_gate_ns'])
        self.assertEqual(result['counts']['waits']['wait_count'], 4)
        self.assertGreater(result['counts']['waits']['max_pairwise_overlap_ns'], 0)
        self.assertEqual(result['counts']['waits']['overshoots'], [])
        self.assertEqual(result['counts']['dispatch'],
                         {"worker_count": 4, "submitted": 4, "terminal_accepted": 4,
                          "distinct_phase_target_count": 8})

    def test_without_observations_the_native_failure_shape_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'records').mkdir()
            prepare_lane(Path(tmp) / 'records', timing="none", gates=())
            result = run_collect(Path(tmp))
        native = json.loads((EVIDENCE / 'result.json').read_text(encoding='utf-8'))
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['problems'], native['problems'])

    def test_missing_worker_observations_keep_that_attempt_incomplete(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'records').mkdir()
            prepare_lane(Path(tmp) / 'records')
            (Path(tmp) / 'records' / 'timing-worker-w2.json').unlink()
            result = run_collect(Path(tmp))
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['problems'], [{"attempt_incomplete": "w2", "missing": [
            "wait_planned_ns", "wait_start_ns", "wait_end_ns", "wait_actual_mono_ns",
            "submit_start_ns", "terminal_ns"]}])

    def test_missing_gate_observation_keeps_missing_timeline(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'records').mkdir()
            prepare_lane(Path(tmp) / 'records', gates=("analysis",))
            result = run_collect(Path(tmp))
        self.assertEqual(result['status'], 'failed')
        self.assertEqual(result['problems'], [{"missing_timeline": "eqclass_final_gate_ns"}])

    def test_foreign_session_observations_are_not_applied(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / 'records').mkdir()
            prepare_lane(Path(tmp) / 'records', timing="wrong-session")
            result = run_collect(Path(tmp))
        self.assertEqual(result['status'], 'failed')
        self.assertEqual([problem["attempt_incomplete"] for problem in result['problems']], ["w3"])

    def test_incorrect_observations_are_rejected_by_the_collector_checks(self):
        for mode, expected in (("disordered", [{"wait_window_out_of_order": "w4"}]),
                               ("short-plan", [{"planned_wait_out_of_range": "w4",
                                                "planned_ns": 100_000_000}])):
            with tempfile.TemporaryDirectory() as tmp:
                (Path(tmp) / 'records').mkdir()
                prepare_lane(Path(tmp) / 'records', timing=mode)
                result = run_collect(Path(tmp))
            self.assertEqual(result['status'], 'failed', mode)
            self.assertEqual(result['problems'], expected, mode)


if __name__ == '__main__':
    unittest.main()
