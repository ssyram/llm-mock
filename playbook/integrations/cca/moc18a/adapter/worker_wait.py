"""Pilot 等待语义的入库重建（原 pilot.worker_wait 的等价件）。

cca_bench 的 WorkerBook 把每任务等待编成剧本里的 bash `sleep {sleep_s}` 步；
moc18a 的业务契约（README/worker.md）是：认领并读真实任务包之后、首写稿之前，
由 adapter 进程真实 sleep 一次种子化抽样的等待，并在真实前沿把双域时钟窗口
落盘（timing-worker-*.json）。本模块在 cca_bench WorkerBook/DeltaBook 之上
恢复旧 pilot 语义：

- 编译时剔除剧本内嵌的 draw-sleep bash 步（避免双重等待）；
- 等待抽样＝(seed, 逻辑标签, attempt) 的纯函数（旧 pilot.sleep_for 公式
  random.Random(f"{seed}:sleep:{label}:a{attempt}")）：同会话重放不重抽；
  仅 recover 产生的新执行尝试（新会话绑定同标签）递增 attempt 并重抽；
- wait_at_index 记录 bootstrap（核身份+读包）之后第一个写稿步的位置，剧本
  无写稿步即 MockFault("no_write_step")，不静默回退到 bootstrap 位；
- 签发该步时 armed pending_wait_ns；worker_step 在真实前沿消费它执行真实
  sleep。choice-tape 命中时 planned_sleep_ns 以磁带 plannedSleepNs 为准；
  每次编译前清 taped_sleep_ns，上一会话的命中值不得泄漏成本会话的抽样。
"""
import random
import threading

from cca_bench.suites.mock_results import MockFault
from cca_bench.suites.mock_worker import BOOTSTRAP, WorkerBook
from cca_bench.suites.mock_delta import DeltaBook


class WaitDeltaBook(DeltaBook):
    """DeltaBook + 可选 choice-tape 等待覆盖（TapedDeltaBook 设 taped_sleep_ns）。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.taped_sleep_ns = None

    def sleep_for(self, label, attempt):
        low, high = self.level.sleep_s_range
        return random.Random(f"{self.seed}:sleep:{label}:a{attempt}").uniform(low, high)


class WaitWorkerBook(WorkerBook):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.attempts = {}
        self.attempt_lock = threading.Lock()

    def _compile(self, state):
        self.deltas.taped_sleep_ns = None
        super()._compile(state)
        label = state.record.get("logical_label")
        with self.attempt_lock:
            self.attempts[label] = self.attempts.get(label, 0) + 1
            attempt = self.attempts[label]
        state.record["attempt"] = attempt
        # 原 pilot 记录带 phase；终态采集的 timing 归并按 (task, session, phase)
        # 对身份。基类 _compile 已以 binding_mismatch 校验包 phase == state.phase。
        state.record["phase"] = state.phase
        planned = self.deltas.taped_sleep_ns
        if planned is None:
            planned = int(self.deltas.sleep_for(label, attempt) * 1e9)
        state.record["planned_sleep_ns"] = int(planned)
        state.steps = [step for step in state.steps if step.sleep_s != "draw"]
        wait_at = next((index for index, step in enumerate(state.steps)
                        if index >= len(BOOTSTRAP) and step.tool == "write"), None)
        if wait_at is None:
            raise MockFault("no_write_step", f"{label}: compiled script has no write step to gate the wait on")
        state.record["wait_at_index"] = wait_at

    def step(self, payload, tag):
        decision = super().step(payload, tag)
        state = self.by_session.get(payload.get("session_id"))
        if (state is not None and decision.get("action") == "tool"
                and state.index - 1 == state.record.get("wait_at_index")
                and "pending_wait_ns" not in state.record):
            state.record["pending_wait_ns"] = state.record.get("planned_sleep_ns")
        return decision
