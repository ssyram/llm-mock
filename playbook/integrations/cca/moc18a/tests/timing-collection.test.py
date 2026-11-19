#!/usr/bin/env python3
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.dont_write_bytecode = True
DOMAIN = Path(__file__).resolve().parents[1]
PROJECT = Path('/Users/ssyram/workspace/work-fv/c-code-verify/.local/analysis-decouple')
sys.path[:0] = [str(DOMAIN), str(PROJECT / '.local/cca-newtree-sut-20261117/scripts'),
                str(PROJECT / '.pi/research/gate-latency-mock-148')]

from adapter.timing_capture import (apply_worker_timing, capture_wait_window, frontier_submit_issuance,
                                    frontier_wait_issuance, load_gate_timeline, main_gate_path,
                                    persist_main_gate, persist_worker_observation, worker_timing_path)
from cca_bench.scenarios import Step
from cca_bench.suites.mock_worker import BOOTSTRAP, PRODUCT_TAIL


class WaitWindowTest(unittest.TestCase):
    def test_real_sleep_produces_dual_domain_clocks(self):
        window = capture_wait_window(lambda: time.sleep(0.03), 500_000_000)
        self.assertEqual(window["wait_planned_ns"], 500_000_000)
        self.assertGreater(window["wait_actual_mono_ns"], 25_000_000)
        self.assertGreaterEqual(window["wait_end_ns"] - window["wait_start_ns"], 25_000_000)
        self.assertLess(abs(window["wait_actual_mono_ns"]
                            - (window["wait_end_ns"] - window["wait_start_ns"])), 100_000_000)

    def test_window_predicates_only_accept_frontier_issuance(self):
        wait_state = SimpleNamespace(record={"wait_at_index": 2}, index=3, steps=list(BOOTSTRAP))
        tool = {"action": "tool", "id": "w1.s3", "name": "write"}
        self.assertTrue(frontier_wait_issuance(wait_state, tool))
        self.assertFalse(frontier_wait_issuance(SimpleNamespace(record={"wait_at_index": 2}, index=4,
                                                                 steps=list(BOOTSTRAP)), tool))
        self.assertFalse(frontier_wait_issuance(wait_state, {"action": "text", "text": "done"}))
        self.assertFalse(frontier_wait_issuance(SimpleNamespace(record={}, index=3, steps=[]), tool))
        self.assertFalse(frontier_wait_issuance(None, tool))

    def test_submit_predicate_uses_the_frozen_worker_book_rule(self):
        steps = list(BOOTSTRAP) + [PRODUCT_TAIL[0], PRODUCT_TAIL[1]]
        submit_state = SimpleNamespace(record={}, index=len(steps), steps=steps)
        self.assertTrue(frontier_submit_issuance(submit_state, {"action": "tool", "id": "w1.s7"}))
        finish = Step("bash", {"command": "state finish --x"}, r'"ok"')
        self.assertTrue(frontier_submit_issuance(
            SimpleNamespace(record={}, index=2, steps=[BOOTSTRAP[0], finish]),
            {"action": "tool", "id": "w1.s2"}))
        plain = SimpleNamespace(record={}, index=2, steps=[BOOTSTRAP[0], BOOTSTRAP[1]])
        self.assertFalse(frontier_submit_issuance(plain, {"action": "tool", "id": "w1.s2"}))
        self.assertFalse(frontier_submit_issuance(submit_state, {"action": "text", "text": "done"}))
        self.assertFalse(frontier_submit_issuance(None, {"action": "tool"}))


class PersistenceTest(unittest.TestCase):
    def test_first_observation_wins_and_later_requests_only_add_keys(self):
        with tempfile.TemporaryDirectory() as tmp:
            records = Path(tmp)
            persist_worker_observation(records, "w1", "analysis", "ses-a",
                                       {"first_request_ns": 10, "wait_start_ns": 11})
            persist_worker_observation(records, "w1", "analysis", "ses-a",
                                       {"wait_start_ns": 99, "terminal_ns": 12})
            persist_worker_observation(records, "w1", "analysis", "ses-B", {"submit_start_ns": 13})
            document = json.loads(worker_timing_path(records, "w1").read_text(encoding="utf-8"))
            self.assertEqual(document, {"task": "w1", "phase": "analysis", "session_id": "ses-a",
                                        "first_request_ns": 10, "wait_start_ns": 11,
                                        "terminal_ns": 12, "submit_start_ns": 13})

    def test_main_gate_is_created_once_and_divergence_is_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            records = Path(tmp)
            first = persist_main_gate(records, "analysis", 111, "main.s20", "root")
            self.assertEqual(persist_main_gate(records, "analysis", 222, "main.s20", "root"), first)
            self.assertEqual(load_gate_timeline(records), {"analysis_final_gate_ns": 111})
            self.assertEqual(persist_main_gate(records, "eqclass", 333, "main.s41", "root")["at_ns"], 333)
            self.assertEqual(sorted(load_gate_timeline(records)),
                             ["analysis_final_gate_ns", "eqclass_final_gate_ns"])

    def test_loaders_reject_absent_or_mistimed_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            records = Path(tmp)
            self.assertEqual(load_gate_timeline(records), {})
            main_gate_path(records, "analysis").write_text('{"gate": "other", "at_ns": 5}\n',
                                                           encoding="utf-8")
            self.assertEqual(load_gate_timeline(records), {})
            main_gate_path(records, "eqclass").write_text(
                json.dumps({"gate": "eqclass_final_gate_ns", "at_ns": "not-a-clock"}),
                encoding="utf-8")
            self.assertEqual(load_gate_timeline(records), {})
            record = {"logical_task_tag": "w9", "session_id": "ses", "phase": "analysis"}
            self.assertEqual(apply_worker_timing(record, records), record)
            worker_timing_path(records, "w9").write_text(json.dumps(
                {"task": "w9", "phase": "analysis", "session_id": "other", "terminal_ns": 1}),
                encoding="utf-8")
            self.assertEqual(apply_worker_timing(dict(record), records), record)
            worker_timing_path(records, "w9").write_text(json.dumps(
                {"task": "w9", "phase": "analysis", "session_id": "ses", "terminal_ns": 1,
                 "wait_start_ns": "2"}), encoding="utf-8")
            merged = apply_worker_timing(dict(record), records)
            self.assertEqual(merged["terminal_ns"], 1)
            self.assertNotIn("wait_start_ns", merged)


if __name__ == "__main__":
    unittest.main()
