#!/usr/bin/env python3
"""前沿守护回归：历史 resume/重放重建的时间线不得写时序观测，真实前沿才写。

resume 的最终 step 仍可能是历史边界的重放（jump<len），重放循环也会在旧步上重建
终门时间线键——这些都不是真实事件。本文件直接驱动 adapter 的 main_step/worker_step
入口（冻结 Pilot 机以同契约替身代跑），证明三类时序副作用只在 boundary==len(messages)
的真实前沿发生，且 main 终门只盖最终 step 新产出的键、带新消费的 call 身份。
"""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.dont_write_bytecode = True
DOMAIN = Path(__file__).resolve().parents[1]
from cca_scripts_path import cca_scripts

sys.path[:0] = [str(DOMAIN), str(cca_scripts())]

import adapter.main_step as main_step
import adapter.worker_step as worker_step
from cca_bench.scenarios import Step
from cca_bench.suites.mock_worker import BOOTSTRAP, PRODUCT_TAIL

ROOT = 'ses-frontier-root'
WORKER_SESSION = 'ses-frontier-w1'
GATE_CAPTURED_NS = 1_795_200_000_000_000_000
SPEC = json.loads((Path(__file__).resolve().parent / 'fixtures' / 'input-spec.json').read_text(encoding='utf-8'))


class FakeMainScript:
    """冻结 MainScript.step 同契约替身：先消费上一步回执（终门键在此刻点 timeline），再签发下一步。"""

    def __init__(self, plan, gate_on_issue=False):
        self.stats = {"timeline": {}, "gate_verdicts": [], "reserves": []}
        self.consumed = []
        self.entry_context = {"replay": False}
        self.root_session = ROOT
        self.plan = list(plan)
        self.pending = None
        self.gate_on_issue = gate_on_issue

    def step(self, payload):
        if self.pending is not None:
            call_id, gate = self.pending
            self.consumed.append(call_id)
            if gate and not self.gate_on_issue:
                self.stats["timeline"].setdefault(gate, GATE_CAPTURED_NS)
            self.pending = None
        if not self.plan:
            raise AssertionError("fake main script plan exhausted")
        call_id, gate = self.plan.pop(0)
        self.pending = (call_id, gate)
        if self.gate_on_issue and gate:
            self.stats["timeline"].setdefault(gate, GATE_CAPTURED_NS)
        return {"action": "tool", "id": call_id, "name": "bash",
                "arguments": {"command": "state probe %s" % call_id}}

    def gate_verdict(self):
        return {"action": "continue_work", "reason": "fake"}

    def compacted(self):
        pass


def run_main(script, decision_ids, pointer):
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / 'records').mkdir()
        messages = [{"role": "user",
                     "content": "BENCH-TAG role=main phase=analysis task=main kind=main"}]
        for call_id in decision_ids:
            messages.append({"role": "assistant", "content": [
                {"type": "toolCall", "id": call_id, "name": "bash",
                 "arguments": {"command": "state probe %s" % call_id}}]})
            messages.append({"role": "toolResult", "toolCallId": call_id, "toolName": "bash",
                             "content": [{"type": "text", "text": "ok %s" % call_id}]})
        transcript = root / 'transcript.json'
        transcript.write_text(json.dumps({"request": {"context": {"messages": messages},
                                                      "options": {"sessionId": ROOT}}}),
                              encoding='utf-8')
        envelope = json.dumps({"transcript": str(transcript), "pointer": pointer})
        env = {"root": root, "spec": {"mock": {}}, "entries": {}, "workspace": root / 'w',
               "root_session": ROOT, "tape": None, "records": root / 'records'}
        with patch.object(main_step, 'lane_env', lambda: env), \
                patch.object(main_step, 'build_script', lambda env, ledger: script), \
                patch('sys.stdin', io.StringIO(envelope)), redirect_stdout(io.StringIO()):
            main_step.main()
        return {path.name: json.loads(path.read_text(encoding='utf-8'))
                for path in (root / 'records').glob('timing-main-gate-*.json')}


class MainGateFrontierTest(unittest.TestCase):
    def test_historical_resume_replay_does_not_stamp_the_gate(self):
        # pointer 落在旧回显 s2：resume 的最终 step 在历史边界 jump=5 重放到“消费终门回执”，
        # 旧判据（非 walk 即写）会把这次重放当真实事件盖 analysis 终门。
        script = FakeMainScript([("main.s1", None), ("main.s2", "analysis_final_gate_ns"),
                                 ("main.s3", None), ("main.s4", None)])
        gates = run_main(script, ["main.s1", "main.s2", "main.s3"], pointer=3)
        self.assertIn("analysis_final_gate_ns", script.stats["timeline"])
        self.assertEqual(gates, {})

    def test_frontier_step_newly_consuming_the_gate_receipt_stamps_only_the_new_gate(self):
        # 指针在前沿：重放循环在旧步上重建 analysis 终门，最终 step 新消费 eqclass 终门回执——
        # 只盖新产出的 eqclass，at_ns 用冻结 handler 的捕获值，身份是新消费的 call。
        script = FakeMainScript([("main.s1", None), ("main.s2", "analysis_final_gate_ns"),
                                 ("main.s3", "eqclass_final_gate_ns"), ("main.s4", None)])
        gates = run_main(script, ["main.s1", "main.s2", "main.s3"], pointer=7)
        self.assertEqual(sorted(script.stats["timeline"]),
                         ["analysis_final_gate_ns", "eqclass_final_gate_ns"])
        self.assertEqual(gates, {"timing-main-gate-eqclass.json":
                                 {"phase": "eqclass", "gate": "eqclass_final_gate_ns",
                                  "at_ns": GATE_CAPTURED_NS, "call_id": "main.s3", "session": ROOT}})

    def test_gate_without_a_newly_consumed_call_keeps_evidence_missing(self):
        # 防御：门键若不是由“新消费回执”触发（替身在签发时点亮 timeline），宁可缺证据也不写。
        script = FakeMainScript([("main.s1", "analysis_final_gate_ns")], gate_on_issue=True)
        gates = run_main(script, [], pointer=1)
        self.assertIn("analysis_final_gate_ns", script.stats["timeline"])
        self.assertEqual(gates, {})


WAIT_STEP = Step("write", {"filePath": "/context/w1.md"}, r"\S")
WORKER_STEPS = list(BOOTSTRAP) + [WAIT_STEP, PRODUCT_TAIL[0], PRODUCT_TAIL[1]]
PLANNED_NS = 2_000_000
WORKER_TAG = {"task": "w1", "phase": "analysis"}


class FakeWorkerBook:
    """冻结 WorkerBook/WaitWorkerBook.step 同契约替身：逐次重放/签发步序列，
    签发首个写步时按等待语义 armed pending_wait_ns，不核对回执内容。"""

    def __init__(self, *args, **kwargs):
        self.by_session = {}
        self.expected = {}

    def expect(self, label, phase):
        self.expected[label] = phase

    def records(self):
        return []

    def step(self, payload, tag):
        from cca_bench.suites.mock_results import MockFault
        session = payload.get("session_id")
        state = self.by_session.get(session)
        if state is None:
            if tag["task"] not in self.expected:
                raise MockFault("unknown_worker", "fake: %s never dispatched" % tag["task"])
            state = SimpleNamespace(label=tag["task"], index=0, steps=list(WORKER_STEPS),
                                    record={"logical_task_tag": tag["task"], "session_id": session,
                                            "phase": self.expected.pop(tag["task"]),
                                            "planned_sleep_ns": PLANNED_NS, "wait_at_index": 2})
            self.by_session[session] = state
        if state.index >= len(state.steps):
            return {"action": "text", "text": "task complete: t-w1", "terminal": True}
        issued = state.steps[state.index]
        state.index += 1
        decision = {"action": "tool", "id": "%s.s%d" % (tag["task"], state.index),
                    "name": issued.tool, "arguments": {"command": "state step"}}
        if state.index - 1 == state.record.get("wait_at_index") \
                and "pending_wait_ns" not in state.record:
            state.record["pending_wait_ns"] = state.record.get("planned_sleep_ns")
        return decision


def worker_messages(echo_count):
    messages = [{"role": "user",
                 "content": "BENCH-TAG role=worker phase=analysis task=w1 kind=batch\n先完成"}]
    book = FakeWorkerBook()
    book.expect("w1", "analysis")
    for _ in range(echo_count):
        decision = book.step({"session_id": WORKER_SESSION}, WORKER_TAG)
        messages.append({"role": "assistant", "content": [
            {"type": "toolCall", "id": decision["id"], "name": decision["name"],
             "arguments": dict(decision["arguments"])}]})
        messages.append({"role": "toolResult", "toolCallId": decision["id"],
                         "toolName": decision["name"], "content": [{"type": "text", "text": "ok"}]})
    return messages


def run_worker(records, echo_count, pointer):
    root = records.parent
    transcript = root / ('transcript-%d-%d.json' % (echo_count, pointer))
    transcript.write_text(json.dumps({"request": {"context": {"messages": worker_messages(echo_count)},
                                                  "options": {"sessionId": WORKER_SESSION}}}),
                          encoding='utf-8')
    envelope = json.dumps({"transcript": str(transcript), "pointer": pointer})
    env = {"root": root, "spec": SPEC, "entries": {}, "workspace": root / 'w',
           "root_session": ROOT, "tape": None, "records": records}
    with patch.object(worker_step, 'lane_env', lambda: env), \
            patch.object(worker_step, 'WaitWorkerBook', FakeWorkerBook), \
            patch('sys.stdin', io.StringIO(envelope)), redirect_stdout(io.StringIO()):
        worker_step.main()


class WorkerObservationFrontierTest(unittest.TestCase):
    def timing(self, records):
        path = records / 'timing-worker-w1.json'
        return json.loads(path.read_text(encoding='utf-8')) if path.exists() else None

    def test_historical_resume_onto_wait_or_submit_echo_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            records = Path(tmp) / 'records'
            records.mkdir()
            with patch.object(worker_step.time, 'sleep') as sleep:
                run_worker(records, 5, pointer=7)  # 历史 submit 回显
                run_worker(records, 3, pointer=3)  # 历史等待回显
            sleep.assert_not_called()
            self.assertIsNone(self.timing(records))

    def test_frontier_wait_submit_and_terminal_are_written_with_identity(self):
        with tempfile.TemporaryDirectory() as tmp:
            records = Path(tmp) / 'records'
            records.mkdir()
            run_worker(records, 2, pointer=5)
            document = self.timing(records)
            self.assertEqual(sorted(document), ["phase", "session_id", "task", "wait_actual_mono_ns",
                                                "wait_call_id", "wait_end_ns", "wait_planned_ns",
                                                "wait_start_ns"])
            self.assertEqual((document["task"], document["phase"], document["session_id"]),
                             ("w1", "analysis", WORKER_SESSION))
            self.assertEqual(document["wait_call_id"], "w1.s3")
            self.assertEqual(document["wait_planned_ns"], PLANNED_NS)
            self.assertGreaterEqual(document["wait_end_ns"] - document["wait_start_ns"], 1_000_000)
            self.assertGreater(document["wait_actual_mono_ns"], 0)
            with patch.object(worker_step.time, 'sleep') as sleep:
                run_worker(records, 4, pointer=9)
            sleep.assert_not_called()
            document = self.timing(records)
            self.assertEqual(document["submit_call_id"], "w1.s5")
            self.assertIsInstance(document["submit_start_ns"], int)
            self.assertEqual(document["wait_call_id"], "w1.s3")
            run_worker(records, 5, pointer=11)
            document = self.timing(records)
            self.assertIsInstance(document["terminal_ns"], int)
            self.assertTrue((records / 'worker-w1.json').exists())


if __name__ == '__main__':
    unittest.main()
