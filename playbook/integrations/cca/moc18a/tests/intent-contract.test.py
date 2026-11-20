#!/usr/bin/env python3
"""意图契约回归（单元行为 + 部署绑定端到端）。

单元：staged 包（携带 intent_head）即使带内命中也先真实读本任务 intent.md
再注入合规拷贝（不回显原文、不声称语义比对）；材料缺失即 MockFault；仅无
intent_head 的真正旧归档包逐字重放；lane 夹具安装缺省文本在 spec.mock 预算
条款内、外部材料经 CCA_NEW_INTENT_MD 显式且不可读即硬错。
部署：固定提交导出（CCA_MOCK18A_SUT）下，真实 `get-task-context` 冻结包
（部署版 build_package 携带 intent_head）经 WaitWorkerBook 两步引导真实
_compile（读盘 inputs/context.json）触发合并后 TapedDeltaBook 生产 draw；
findings 落 findings.json 后用导出 TraceFixture 生成的 finish 命令原样执行
（真子进程；task/operation 三例互异防接受缓存假绿；trace 逐条落盘留证）：
正例诚实 Mock findings 接受，缺 intent_compliance 与 malformed opening
双负例被真实 CLI 拒绝（exit 2 + status error + GateRejection）。
外部输入：CCA_MOCK18A_SUT（部署导出根）；未提供即跳过。pilot 依赖已由
入库 adapter（case_body/worker_wait）替换，无需任何私有包。
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True
DOMAIN = Path(__file__).resolve().parents[1]
SUT = os.environ.get("CCA_MOCK18A_SUT")
TRACE_DIR = Path(os.environ.get("INTENT_DEPLOY_TRACE") or tempfile.mkdtemp(prefix="intent-trace-"))


if SUT:
    sys.path[:0] = [str(DOMAIN), str(Path(SUT) / "scripts"), str(Path(SUT) / "scripts" / "tests")]
    from cca_v2_fixture import Fixture
    from cca_v2_trace_fixture import TraceFixture
    from adapter.intent_material import OPENING
    from adapter.worker_step import TapedDeltaBook
    from lane_context import TapeLedger
    from cca_bench.suites.mock_faults import Injection
    from cca_bench.suites.mock_results import MockFault
    from adapter.case_body import pilot_budgets, pilot_level
    from adapter.worker_wait import WaitWorkerBook
    LEVEL = pilot_level(2, 2, 0)

    def taped(tape=None):
        return TapedDeltaBook(LEVEL, "seed-intent", 4, 3, pilot_budgets(LEVEL, 4, 3, 60, 0, 0), tape=tape, notes=[])

    class SubmitTraceFixture(TraceFixture):
        """负例 finish（预期非零退出）绕开 TraceFixture 的「全部接受」归档断言；
        生成的 CLI 子进程不变，仍真执行。"""

        def cli(self, command, *arguments, **kwargs):
            if command == "finish" and kwargs.get("expected"):
                return Fixture.cli(self, command, *arguments, **kwargs)
            return super().cli(command, *arguments, **kwargs)

    def production_draw(f, task_id, actor):
        """生产编译→draw：真实冻结包经 WorkerBook 两步引导触发 _compile（含 draw）。"""
        context = (Path(f.cli("get-task-context", "--task-id", task_id)["task_dir"]) / "inputs" / "context.json").resolve()
        package = json.loads(context.read_text(encoding="utf-8"))
        assert "intent_head" in package, "deployed package must be staged (carry intent_head)"
        deltas = TapedDeltaBook(LEVEL, "seed-deploy", 2, 0, pilot_budgets(LEVEL, 2, 0, 60, 0, 0), tape=None, notes=[])
        workers = WaitWorkerBook(LEVEL.name, deltas, TapeLedger(Path(tempfile.mkdtemp(prefix="ledger-"))), f.workspace.resolve(), "test-root", "product", Injection())
        workers.expect(task_id, "analysis")
        session, tag = "ses-deploy-child", {"task": task_id, "phase": "analysis"}
        one = workers.step({"session_id": session}, tag)
        consts = json.dumps({"const_vars": {"session_id": "test-root", "context_file": str(context), "agent_id": actor, "task_id": task_id}})
        two = workers.step({"session_id": session, "last_tool_result": {"toolCallId": one["id"], "text": consts}}, tag)
        workers.step({"session_id": session, "last_tool_result": {"toolCallId": two["id"], "text": context.read_text(
            encoding="utf-8")}}, tag)
        return json.loads(workers.by_session[session].meta["findings_json"])


def workspace_with_intent(text="# Intent (fixture)\n\n## 用户意图与需求\n夹具默认用户条款：完成两阶段交付。\n"):
    root = Path(tempfile.mkdtemp(prefix="intent-md-"))
    (root / "_cca_analysis").mkdir()
    (root / "_cca_analysis" / "intent.md").write_text(text, encoding="utf-8")
    return root


def package_for(workspace, task_id="t-intent", staged=False):
    return {"task_id": task_id, "phase": "analysis", "analysis_type": "normal",
            "config": {"workspace": str(workspace)},
            "targets": [{"id": f, "draft_file": "draft/%s.md" % f} for f in ("f0", "f1")],
            **({"intent_head": "（截断提示，不构成已读）"} if staged else {})}


def tape_for(findings):
    return {"choices": [{"semantic": {"phase": "analysis", "targets": ["f0", "f1"], "attempt": 2, "kind": "analysis_batch"},
                         "plannedSleepNs": 555_000_000, "record": {"planned": {"facts": 0}}, "findings": findings}]}


@unittest.skipUnless(SUT, "CCA_MOCK18A_SUT not provided")
class IntentContractUnitTest(unittest.TestCase):
    def test_unit_contract(self):
        workspace = workspace_with_intent()
        findings = {"edges": [{"caller": "f0", "callee": "f1", "reason": "bench delta"}], "self_check": {}}
        book = taped(tape_for(findings))
        outcome = book.draw(package_for(workspace, task_id="t-staged", staged=True))
        self.assertEqual({k: v for k, v in outcome["findings"].items() if k != "intent_compliance"}, findings)
        statement = outcome["findings"]["intent_compliance"]
        self.assertTrue(statement.startswith(OPENING))
        self.assertIn("performed no further analysis", statement)
        self.assertFalse([token for token in ("bench delta", "夹具", "unrelated", "contradict") if token in statement])
        self.assertEqual([n for n in book.notes if "intent_read" in n][0]["intent_read"]["task_id"], "t-staged")
        legacy = {"edges": [], "self_check": {"f0": "edge-adding-check done: edges complete under current context"}}
        replay = taped(tape_for(legacy))
        self.assertIs(replay.draw(package_for(Path(tempfile.mkdtemp(prefix="intent-none-")), task_id="t-replay"))["findings"], legacy)
        self.assertFalse([n for n in replay.notes if "intent_read" in n])
        with self.assertRaises(MockFault) as caught:
            taped().draw(package_for(Path(tempfile.mkdtemp(prefix="intent-none-"))))
        self.assertEqual(caught.exception.kind, "intent_material_missing")

    def test_new_lane_fixture_install_default_and_explicit_external(self):
        import new_lane
        workspace = Path(tempfile.mkdtemp(prefix="lane-intent-"))
        self.assertIn("spec.mock", new_lane.install_intent_md(workspace).read_text(encoding="utf-8"))
        os.environ["CCA_NEW_INTENT_MD"] = str(workspace / "ext.md")
        try:
            (workspace / "ext.md").write_text("# 外部材料\n", encoding="utf-8")
            self.assertEqual(new_lane.install_intent_md(workspace).read_text(encoding="utf-8"), "# 外部材料\n")
            os.environ["CCA_NEW_INTENT_MD"] = str(workspace / "missing.md")
            with self.assertRaises(OSError):
                new_lane.install_intent_md(workspace)
        finally:
            del os.environ["CCA_NEW_INTENT_MD"]




@unittest.skipUnless(SUT, "CCA_MOCK18A_SUT not provided")
class DeployedSubmitTest(unittest.TestCase):
    def setUp(self):
        self.trace = TRACE_DIR / ("trace-%s.jsonl" % self.id().rsplit(".", 1)[-1])
        self.f = SubmitTraceFixture(self.trace, functions=2, capacity=2, cap=16)
        self.f.init(operation="intent-deploy-init")
        self.addCleanup(self.f.close)

    def claim(self, f, operation):
        f.cli("get-next", "--phase", "analysis")
        return f.cli("reserve", "--phase", "analysis", "--para", 1, operation=operation)["batches"][0]

    def test_positive_honest_mock_findings_accepted_via_generated_submit(self):
        task_id = self.claim(self.f, "intent-deploy-reserve-pos")["task_id"]; self.f.consume("intent-child")
        path = self.f.draft(task_id, findings=production_draw(self.f, task_id, "intent-child"))
        result = self.f.cli("finish", "--task-id", task_id, "--input", path, agent="intent-child", operation="intent-deploy-finish-pos")
        self.assertTrue(all(r["status"] == "accepted" for r in result["reports"]))
        self.assertFalse(result["replayed"])
        print("RESOLVED task=%s operation=intent-deploy-finish-pos trace=%s" % (task_id, self.trace), flush=True)

    def test_negatives_rejected_by_generated_submit(self):
        cases = {"missing": '{"edges": []}',
                 "malformed": '{"edges": [], "intent_compliance": "I disobeyed and skipped reading the intent.md file before my analysis"}'}
        for name, payload in cases.items():
            with self.subTest(case=name):
                fixture = SubmitTraceFixture(TRACE_DIR / ("trace-neg-%s.jsonl" % name),
                                             functions=2, capacity=2, cap=16)
                self.addCleanup(fixture.close)
                fixture.init(operation="intent-deploy-init-neg-" + name)
                task_id = self.claim(fixture, "intent-deploy-reserve-neg-" + name)["task_id"]
                fixture.consume("intent-child")
                path = fixture.draft(task_id, findings={"edges": []}); path.write_text(payload, encoding="utf-8")
                result = fixture.cli("finish", "--task-id", task_id, "--input", path, agent="intent-child",
                                     operation="intent-deploy-finish-neg-" + name, expected=2)
                self.assertIn("intent_compliance missing or opening mismatch", result["error"])
                print("RESOLVED task=%s operation=intent-deploy-finish-neg-%s" % (task_id, name), flush=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
