#!/usr/bin/env python3
"""随机/等待语义契约回归（合并语义缺口的钉子；断言语义值而非仅终态）。

spec.mock 逐字段治理随机参数：r128c 实跑 spec（.pi/npr/r128c/input-spec.json，
终图 130=128+2 节点、27 次等待实测非确定）即本文件的 checked fixture，逐字段
等于旧 pilot 恒参 0.5/1/1/0/(0.5,3.0)。等待抽样＝(seed,label,attempt) 纯函数
的黄金值（旧 pilot.sleep_for 公式）；recover 新会话绑定同标签递增 attempt 并
重抽；同会话重放不重抽；choice-tape 命中优先且不泄漏到未命中会话；剧本无写稿
步即 MockFault("no_write_step") 不静默回退；draw 触发/请求量按 (seed,label)
序列断言且受每任务上限与全 run 预算（r128c 证据 2/4）约束；确定性组合压平
0/0/0/0/(0.5,0.5) 且任意键抽样恒 0.5s。

旧冻结基准源不可默认 import：提供 MOC18A_OLD_PILOT（gate-latency-mock-148
根，含 pilot/ 包）时另与旧 pilot.case_body/pilot.worker_wait 实测对拍（等级
字段、sleep_for、双会话编译计划等待/attempt/wait_at_index）；缺省只用黄金值，
不依赖任何私有路径。
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
DOMAIN = HERE.parent
sys.path[:0] = [str(HERE), str(DOMAIN), str(DOMAIN / "adapter")]
from cca_scripts_path import cca_scripts

sys.path.insert(0, str(cca_scripts()))

from adapter.case_body import pilot_budgets, pilot_level
from adapter.worker_step import TapedDeltaBook
from adapter.worker_wait import WaitDeltaBook, WaitWorkerBook
from lane_context import DETERMINISTIC_MOCK, fixed_default_level, TapeLedger
from cca_bench.suites import mock_worker
from cca_bench.suites.mock_delta import DeltaBook
from cca_bench.suites.mock_faults import Injection
from cca_bench.suites.mock_results import MockFault
from cca_bench.scenarios import Step, StepScript

R128C_MOCK = {"delta_probability": 0.5, "max_new_nodes_per_task": 1, "max_new_edges_per_task": 1,
              "max_external_marks_per_task": 0, "max_new_nodes": 2, "max_new_facts": 4,
              "wait_seconds": [0.5, 3.0]}
SEEDS = [1, 7, 7535556152676563147]
PKG_A = {"phase": "analysis", "analysis_type": "normal", "targets": [{"id": "f0"}, {"id": "f1"}]}
PKG_B = {"phase": "analysis", "analysis_type": "normal", "targets": [{"id": "g0"}]}
LABEL_A = "analysis:normal:plain:5814a3dafe8224d0"
LABEL_B = "analysis:normal:plain:88835211d193acf8"
GOLDEN_SLEEP = {  # (seed, label) -> [a1, a2, a3]（旧公式 uniform(0.5, 3.0) 黄金值）
    (1, LABEL_A): [2.615669816194853, 2.780861065058268, 1.7645671909895417],
    (1, LABEL_B): [2.411892836704142, 1.95443592792661, 0.7226392339741612],
    (7, LABEL_A): [2.2605500774396923, 1.6482611873357418, 2.7929804070455146],
    (7, LABEL_B): [2.5848607076344687, 2.285548160929465, 2.859865303952611],
    (7535556152676563147, LABEL_A): [0.6092629414495316, 2.0064664501268057, 1.7112161534957686],
    (7535556152676563147, LABEL_B): [1.4817435283858766, 0.5775404001885429, 1.5540636585212602],
}
GOLDEN_DELTA = {  # (seed, label) -> (triggered, requested(nodes, facts))（旧 (seed,label) 序列）
    (1, LABEL_A): (False, None), (1, LABEL_B): (True, (0, 1)),
    (7, LABEL_A): (True, (1, 0)), (7, LABEL_B): (True, (1, 0)),
    (7535556152676563147, LABEL_A): (False, None), (7535556152676563147, LABEL_B): (True, (1, 1)),
}
ROOT = "root-parity"


def fresh_package(target_ws, task, targets):
    task_dir = target_ws / "tasks" / task
    task_dir.mkdir(parents=True, exist_ok=True)
    package = {"task_id": task, "phase": "analysis", "analysis_type": "normal",
               "task_dir": str(task_dir), "config": {"workspace": str(target_ws), "session": "any"},
               "targets": [{"id": name, "draft_file": "draft/%s.md" % name} for name in targets]}
    path = target_ws / ("%s.json" % task)
    path.write_text(json.dumps(package), encoding="utf-8")
    return path


def drive(workers, task, session, context_path):
    """两会话引导（核身份→读包→首写稿签发）：触发 _compile 并 armed pending_wait_ns。"""
    workers.expect(task, "analysis")
    tag = {"task": task, "phase": "analysis"}
    first = workers.step({"session_id": session}, tag)
    consts = json.dumps({"const_vars": {"session_id": ROOT, "context_file": str(context_path),
                                        "agent_id": "ag-" + session, "task_id": task}})
    second = workers.step({"session_id": session,
                           "last_tool_result": {"toolCallId": first["id"], "text": consts}}, tag)
    workers.step({"session_id": session,
                  "last_tool_result": {"toolCallId": second["id"],
                                       "text": context_path.read_text(encoding="utf-8")}}, tag)
    return workers.by_session[session]


def install_intent(workspace):
    (workspace / "_cca_analysis").mkdir(exist_ok=True)
    (workspace / "_cca_analysis" / "intent.md").write_text("# Intent (fixture)\n", encoding="utf-8")


class RandomMockSemanticsTest(unittest.TestCase):
    def level(self, mock=None):
        return pilot_level(2, 16, mock or R128C_MOCK)

    def budgets(self, level):
        return pilot_budgets(level, 128, 255, 1800, R128C_MOCK["max_new_nodes"], R128C_MOCK["max_new_facts"])

    def test_r128c_spec_governs_level_fields(self):
        level = self.level()
        self.assertEqual((level.delta_p, level.new_node_cap, level.new_edge_cap, level.retract_edge_cap),
                         (0.5, 1, 1, 0))
        self.assertEqual(level.sleep_s_range, (0.5, 3.0))
        self.assertEqual((level.node_budget_frac, level.edge_budget_frac), (1.0, 1.0))
        self.assertIs(fixed_default_level({"mock": R128C_MOCK}, level), level)
        det = fixed_default_level({"mock": DETERMINISTIC_MOCK}, pilot_level(2, 16, DETERMINISTIC_MOCK))
        self.assertEqual((det.delta_p, det.new_node_cap, det.new_edge_cap, det.retract_edge_cap,
                          det.sleep_s_range), (0.0, 0, 0, 0, (0.5, 0.5)))

    def test_run_budgets_match_r128c_evidence(self):
        book = WaitDeltaBook(self.level(), 7, 128, 255, self.budgets(self.level()))
        self.assertEqual((book.usage()["node_budget"], book.usage()["edge_budget"]), (2, 4))

    def test_sleep_sampling_is_seed_label_attempt_keyed(self):
        for (seed, label), values in GOLDEN_SLEEP.items():
            book = WaitDeltaBook(self.level(), seed, 128, 255, self.budgets(self.level()))
            for attempt, expected in enumerate(values, 1):
                self.assertEqual(book.sleep_for(label, attempt), expected)
            self.assertNotEqual(values[0], values[1], "recover 重抽必须改变计划等待")
        det_level = pilot_level(2, 16, DETERMINISTIC_MOCK)
        det_book = WaitDeltaBook(det_level, 99, 6, 3, pilot_budgets(det_level, 6, 3, 60, 0, 0))
        self.assertEqual([det_book.sleep_for(LABEL_A, attempt) for attempt in (1, 2, 3)], [0.5, 0.5, 0.5])

    def test_delta_draw_follows_seed_label_sequence_within_caps(self):
        for seed in SEEDS:
            for package, label in ((PKG_A, LABEL_A), (PKG_B, LABEL_B)):
                book = WaitDeltaBook(self.level(), seed, 128, 255, self.budgets(self.level()))
                record = book.draw(json.loads(json.dumps(package)))["record"]
                triggered, requested = GOLDEN_DELTA[(seed, label)]
                nodes, facts = requested if requested else (0, 0)
                self.assertEqual(record["label"], label)
                self.assertEqual(record["triggered"], triggered)
                self.assertEqual(record["requested"], {"nodes": nodes, "facts": facts, "externs": 0})
                self.assertEqual(record["planned"], {"nodes": nodes, "facts": facts + nodes, "externs": 0})
        book = WaitDeltaBook(self.level(), 7, 128, 255, self.budgets(self.level()))
        record = book.draw({"phase": "eqclass", "is_cycle": True, "targets": [{"id": "g0"}]})["record"]
        self.assertFalse(record["triggered"])
        self.assertEqual(record["requested"], {"nodes": 0, "facts": 0, "externs": 0})

    def test_run_budget_clips_repeated_draws_of_same_label(self):
        book = WaitDeltaBook(self.level(), 7, 128, 255, self.budgets(self.level()))
        draws = [book.draw(json.loads(json.dumps(PKG_B)))["record"] for _ in range(3)]
        self.assertEqual([draw["planned"]["nodes"] for draw in draws], [1, 1, 0])
        self.assertTrue(draws[2]["budget_clipped"])

    def test_recover_reincrements_attempt_and_redraws_planned_wait(self):
        workspace = Path(tempfile.mkdtemp(prefix="parity-recover-"))
        context = fresh_package(workspace, "t0", ("f0", "f1"))
        level = self.level()
        deltas = WaitDeltaBook(level, 7535556152676563147, 128, 255, self.budgets(level))
        workers = WaitWorkerBook(level.name, deltas, TapeLedger(workspace / "records"), workspace,
                                 ROOT, "product", Injection())
        golden = GOLDEN_SLEEP[(7535556152676563147, LABEL_A)]
        first = drive(workers, "t0", "ses-1", context)
        second = drive(workers, "t0", "ses-recover", context)
        self.assertEqual([first.record["attempt"], second.record["attempt"]], [1, 2])
        self.assertEqual(first.record["planned_sleep_ns"], int(golden[0] * 1e9))
        self.assertEqual(second.record["planned_sleep_ns"], int(golden[1] * 1e9))
        for state in (first, second):
            self.assertEqual(state.record["wait_at_index"], 2)
            self.assertEqual(state.record["pending_wait_ns"], state.record["planned_sleep_ns"])
            self.assertEqual(state.record["logical_label"], LABEL_A)

    def test_missing_write_step_fails_loud_not_silent_fallback(self):
        workspace = Path(tempfile.mkdtemp(prefix="parity-nowrite-"))
        context = fresh_package(workspace, "t0", ("f0",))
        level = self.level()
        deltas = WaitDeltaBook(level, 1, 128, 255, self.budgets(level))
        workers = WaitWorkerBook(level.name, deltas, TapeLedger(workspace / "records"), workspace,
                                 ROOT, "product", Injection())
        workers.expect("t0", "analysis")
        tag = {"task": "t0", "phase": "analysis"}
        first = workers.step({"session_id": "ses-nowrite"}, tag)
        consts = json.dumps({"const_vars": {"session_id": ROOT, "context_file": str(context),
                                            "agent_id": "ag", "task_id": "t0"}})
        second = workers.step({"session_id": "ses-nowrite",
                               "last_tool_result": {"toolCallId": first["id"], "text": consts}}, tag)
        original = mock_worker.build_script

        def no_write_script(kind, level_name, meta):
            steps = tuple(Step("read", {"filePath": "{context_file}"}, r'"targets"') for _ in range(8))
            return StepScript(kind, level_name, steps, "task complete: {task_id}")

        mock_worker.build_script = no_write_script
        try:
            with self.assertRaises(MockFault) as caught:
                workers.step({"session_id": "ses-nowrite",
                              "last_tool_result": {"toolCallId": second["id"],
                                                   "text": context.read_text(encoding="utf-8")}}, tag)
            self.assertEqual(caught.exception.kind, "no_write_step")
        finally:
            mock_worker.build_script = original

    def test_tape_hit_overrides_sampling_without_leaking_to_next_session(self):
        workspace = Path(tempfile.mkdtemp(prefix="parity-tape-"))
        install_intent(workspace)
        hit_context = fresh_package(workspace, "t0", ("f0", "f1"))
        miss_context = fresh_package(workspace, "t1", ("g0",))
        tape = {"choices": [{"semantic": {"phase": "analysis", "targets": ["f0", "f1"],
                                          "kind": "analysis_batch", "attempt": 1},
                             "plannedSleepNs": 555_000_000,
                             "record": {"planned": {"nodes": 0, "facts": 0, "externs": 0}},
                             "findings": {"edges": [], "self_check": {}}}]}
        level = self.level()
        deltas = TapedDeltaBook(level, 7535556152676563147, 128, 255, self.budgets(level),
                                tape=tape, notes=[])
        workers = WaitWorkerBook(level.name, deltas, TapeLedger(workspace / "records"), workspace,
                                 ROOT, "product", Injection())
        hit = drive(workers, "t0", "ses-taped", hit_context)
        self.assertEqual(hit.record["attempt"], 1)
        self.assertEqual(hit.record["planned_sleep_ns"], 555_000_000)
        self.assertEqual(hit.record["pending_wait_ns"], 555_000_000)
        miss = drive(workers, "t1", "ses-untaped", miss_context)
        self.assertEqual(miss.record["attempt"], 1)
        self.assertEqual(miss.record["logical_label"], LABEL_B)
        self.assertEqual(miss.record["planned_sleep_ns"],
                         int(GOLDEN_SLEEP[(7535556152676563147, LABEL_B)][0] * 1e9))


OLD_PILOT = os.environ.get("MOC18A_OLD_PILOT")


@unittest.skipUnless(OLD_PILOT, "MOC18A_OLD_PILOT not provided (old/new live parity is optional)")
class OldPilotParityTest(unittest.TestCase):
    """与旧私有 pilot 实测对拍（只读参照；未提供即整类跳过，不影响黄金值断言）。"""

    def test_old_pilot_level_sleep_and_worker_books_match(self):
        sys.path.insert(0, OLD_PILOT)
        from pilot.case_body import pilot_budgets as old_budgets, pilot_level as old_pilot_level
        from pilot.worker_wait import PilotDeltaBook, PilotWorkerBook
        new_level = pilot_level(2, 16, R128C_MOCK)
        old_level = old_pilot_level(2, 16, 2)
        budgets = pilot_budgets(new_level, 128, 255, 1800, R128C_MOCK["max_new_nodes"],
                                R128C_MOCK["max_new_facts"])
        for field in ("delta_p", "new_node_cap", "new_edge_cap", "retract_edge_cap", "sleep_s_range",
                      "node_budget_frac", "edge_budget_frac", "compaction_interval_tasks",
                      "compaction_transcript_bytes", "rate429_main"):
            self.assertEqual(getattr(new_level, field), getattr(old_level, field), field)
        for seed in SEEDS:
            old_book = PilotDeltaBook(old_level, seed, 128, 255, old_budgets(old_level, 128, 255, 1800, 2, 4))
            new_book = WaitDeltaBook(new_level, seed, 128, 255, budgets)
            for label in (LABEL_A, LABEL_B):
                for attempt in (1, 2, 3):
                    self.assertEqual(new_book.sleep_for(label, attempt), old_book.sleep_for(label, attempt))
        workspace = Path(tempfile.mkdtemp(prefix="parity-old-"))
        context = fresh_package(workspace, "t0", ("f0", "f1"))
        old_deltas = PilotDeltaBook(old_level, 7535556152676563147, 128, 255,
                                    old_budgets(old_level, 128, 255, 1800, 2, 4))
        new_deltas = WaitDeltaBook(new_level, 7535556152676563147, 128, 255, budgets)
        old_workers = PilotWorkerBook(old_level.name, old_deltas, TapeLedger(workspace / "rec-old"),
                                      workspace, ROOT, "product", Injection())
        new_workers = WaitWorkerBook(new_level.name, new_deltas, TapeLedger(workspace / "rec-new"),
                                     workspace, ROOT, "product", Injection())
        for session in ("ses-1", "ses-recover"):
            old_state = drive(old_workers, "t0", session, context)
            new_state = drive(new_workers, "t0", session, context)
            for key in ("attempt", "planned_sleep_ns", "wait_at_index", "pending_wait_ns"):
                self.assertEqual(new_state.record[key], old_state.record[key], (session, key))


if __name__ == "__main__":
    unittest.main(verbosity=2)
