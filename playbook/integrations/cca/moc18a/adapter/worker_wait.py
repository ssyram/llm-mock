"""Pilot 等待语义的入库重建（原 pilot.worker_wait 的最小等价件）。

cca_bench 的 WorkerBook 把每任务等待编成剧本里的 bash `sleep {sleep_s}` 步；
moc18a 的业务契约（README/worker.md）是：认领并读真实任务包之后、首写稿之前，
由 adapter 进程真实 sleep 一次种子化抽样的等待，并在真实前沿把双域时钟窗口
落盘（timing-worker-*.json）。本模块在 cca_bench WorkerBook/DeltaBook 之上
恢复这一语义：

- 编译时剔除剧本内嵌的 draw-sleep bash 步（避免双重等待）；
- wait_at_index 记录 bootstrap（核身份+读包）之后第一个写稿步的位置；
- 签发该步时 armed pending_wait_ns（计划等待，cca_bench DeltaBook 的种子化
  sleep_seconds 抽样＝(seed, 逻辑标签) 的纯函数，天然满足“同 (label, attempt)
  不重抽”）；worker_step 在真实前沿消费它执行真实 sleep。
"""
from cca_bench.suites.mock_worker import BOOTSTRAP, WorkerBook
from cca_bench.suites.mock_delta import DeltaBook


class WaitDeltaBook(DeltaBook):
    """DeltaBook + 可选 choice-tape 等待覆盖（TapedDeltaBook 设 taped_sleep_ns）。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.taped_sleep_ns = None


class WaitWorkerBook(WorkerBook):
    def _compile(self, state):
        super()._compile(state)
        # 磁带命中时以磁带等待为准（原 pilot sleep_for 语义）：计划值与后续
        # pending_wait_ns 必须同源，否则采集器会误判 planned_wait_out_of_range。
        planned = getattr(self.deltas, "taped_sleep_ns", None)
        if planned is not None:
            state.record["planned_sleep_ns"] = int(planned)
        # 原 pilot 记录带 phase；终态采集的 timing 归并按 (task, session, phase)
        # 对身份，cca_bench 记录缺此字段会被静默跳过。
        state.record["phase"] = state.phase
        state.steps = [step for step in state.steps if step.sleep_s != "draw"]
        first_body = len(BOOTSTRAP)
        wait_at = next((index for index, step in enumerate(state.steps)
                        if index >= first_body and step.tool == "write"), first_body)
        state.record["wait_at_index"] = wait_at

    def step(self, payload, tag):
        decision = super().step(payload, tag)
        state = self.by_session.get(payload.get("session_id"))
        if (state is not None and decision.get("action") == "tool"
                and state.index - 1 == state.record.get("wait_at_index")
                and "pending_wait_ns" not in state.record):
            planned = getattr(self.deltas, "taped_sleep_ns", None)
            if planned is None:
                planned = state.record.get("planned_sleep_ns")
            if planned is not None:
                state.record["pending_wait_ns"] = int(planned)
        return decision
