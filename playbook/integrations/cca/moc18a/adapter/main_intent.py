"""原 pilot.machine.PilotMainScript 的入库重建：prepare 期 intent 材料。

cca_bench MainScript 的 prepare 阶段直接从 cca_state init 走到 A_LOOP 转移，
不写 <W>/_cca_analysis/intent.md；而产品 Main FSM 的 A_PREPARE 指令要求先写
完整 intent.md（worker 的推理输入），cca_state reserve 起的任务包构建
（task_package.intent_head）对该文件强依赖、缺失即基础设施异常。本模块在
cca_bench MainScript 之上恢复该语义：prepare 队列头部插入一次 write 步骤
（形状与 _final 的交付物 write 一致）。

内容唯一权威＝lane 以预备者身份安装的 <W>/_cca_analysis/intent.md（缺省夹具
文本，外部材料经 CCA_NEW_INTENT_MD 显式指定，见 new_lane.install_intent_md）；
write 步骤逐字重写该权威内容，prepare 期材料缺失＝MockFault（不静默降级到
任何内置模板——两个内容源会让 worker 实读与 prepare 写入不一致）。
"""
from pathlib import Path

from cca_bench.suites.mock_main import MainScript
from cca_bench.suites.mock_results import MockFault


def intent_material(workspace):
    path = Path(workspace) / "_cca_analysis" / "intent.md"
    try:
        return path.read_text(encoding="utf-8")
    except OSError as error:
        raise MockFault("intent_material_missing",
                        "prepare requires lane-installed %s: %s" % (path, error))


class IntentMainScript(MainScript):
    def _advance(self):
        was = self.stage
        super()._advance()
        if was == "prepare":
            content = intent_material(self.vars["W"])
            self.queue.insert(0, ("write", {"filePath": f"{self.vars['W']}/_cca_analysis/intent.md",
                                            "content": content}, r"\S", None))
