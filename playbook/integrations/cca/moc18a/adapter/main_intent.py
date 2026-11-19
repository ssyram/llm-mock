"""原 pilot.machine.PilotMainScript 的入库重建：prepare 期 intent 材料。

cca_bench MainScript 的 prepare 阶段直接从 cca_state init 走到 A_LOOP 转移，
不写 <W>/_cca_analysis/intent.md；而产品 Main FSM 的 A_PREPARE 指令要求先写
完整 intent.md（worker 的推理输入），cca_state reserve 起的任务包构建
（task_package.intent_head）对该文件强依赖、缺失即基础设施异常。原私有
PilotMainScript 在此补齐；本模块在 cca_bench MainScript 之上恢复同一语义：
prepare 队列头部插入一次 write 步骤（形状与 _final 的交付物 write 一致），
内容为确定性 mock 战役的如实用途说明，含「用户意图与需求」小节。
"""
from cca_bench.suites.mock_main import MainScript

INTENT_MD = """# intent

## 用户意图与需求
- 对输入 spec 图（见 lane 的 input-spec.json）完成一轮 CCA Analysis 与
  EqClass 两个阶段：函数报告全部 accepted，等价类划分完成。
- 本 lane 是确定性 mock 实跑：模型回复由已入库剧本解释器驱动，worker 按
  冻结步骤表执行，报告材料为固定模板；判定只看真实 FSM/SQL 权威结果。
- 交付物：goal.md、self-check.md、open-questions.md（analysis）与
  eqclass-self-check.md（eqclass）。

## 程序背景
- 图形状完全来自 spec 的 nodes/edges；seed 只影响 mock 选择，不影响图。
- Analysis 阶段按 reserve 回执的真实 batches 派 worker；EqClass 阶段同源。
- worker 失败按 incident 语义如实上报，不静默重试或伪造接受。

## 输入域与入口
- 源码根：<W>/src（由 spec 物化的最小 C 源）。
- 入口：图内各函数即分析对象；无外部输入域约束。

## 验收口径
- Analysis/EqClass 两阶段终门全部通过，最终交付物被接受。
- 无未对账的 worker 会话；等待窗口按真实前沿观测落盘。
"""


class IntentMainScript(MainScript):
    def _advance(self):
        was = self.stage
        super()._advance()
        if was == "prepare":
            self.queue.insert(0, ("write", {"filePath": f"{self.vars['W']}/_cca_analysis/intent.md",
                                            "content": INTENT_MD}, r"\S", None))
