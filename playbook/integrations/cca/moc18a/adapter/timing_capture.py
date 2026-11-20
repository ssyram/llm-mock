"""真实时序观测：只在真实事件发生的请求进程内捕获并落盘，先写者胜。

观测点都是新 lane 可真实目击的边界：worker 会话首请求到达、首写步决策的真实
sleep 窗口（仅前沿签发，不含重放重建触发的重复睡眠）、submit 步前沿签发、
终局文本前沿签发；main 的 {phase}_final_gate_ns 在前沿请求（boundary==消息数）
新消费终门回执、新产出该键时记录真实观测时间；恢复侧只能保存绑定回执携带的
原始宿主完成时间，缺失则不写，绝不采用重放时钟。全部持久化按
（task/phase/session/call_id）带身份，重放或传输
重试永不改写首写值；采集器侧只读这些文件，缺文件即缺证据，失败照旧保留。
"""
import json
import os
import time
from pathlib import Path

WORKER_TIMING_FIELDS = ("first_request_ns", "wait_planned_ns", "wait_start_ns", "wait_end_ns",
                        "wait_actual_mono_ns", "submit_start_ns", "terminal_ns")


def worker_timing_path(records_dir, task):
    return Path(records_dir) / ("timing-worker-%s.json" % task)


def main_gate_path(records_dir, phase):
    return Path(records_dir) / ("timing-main-gate-%s.json" % phase)


def capture_wait_window(sleep, planned_ns):
    """围绕真实 sleep 取双域时钟：unix ns 供窗口/排序，monotonic ns 供持续时长。"""
    mono_start, started = time.monotonic_ns(), time.time_ns()
    sleep()
    ended = time.time_ns()
    return {"wait_planned_ns": planned_ns, "wait_start_ns": started, "wait_end_ns": ended,
            "wait_actual_mono_ns": time.monotonic_ns() - mono_start}


def frontier_wait_issuance(state, decision):
    """前沿决策本身即等待步（issued==wait_at_index）才算首签发；重放重建的 pending 不算。"""
    return (state is not None and decision.get("action") == "tool"
            and state.record.get("wait_at_index") is not None
            and state.index - 1 == state.record["wait_at_index"])


def frontier_submit_issuance(state, decision):
    """冻结 WorkerBook 的 submit 判据（PRODUCT_TAIL[1] 或 bash finish）作用于前沿签发步。"""
    if state is None or decision.get("action") != "tool" or state.index < 1:
        return False
    from cca_bench.suites.mock_worker import PRODUCT_TAIL
    issued = state.steps[state.index - 1]
    return issued in PRODUCT_TAIL[1:2] or (issued.tool == "bash"
                                           and " finish " in issued.args_template.get("command", ""))


def persist_worker_observation(records_dir, task, phase, session_id, fields):
    """合并落盘：已存在的键（含身份）永不改写——重放/重试幂等；原子替换防半读。"""
    path = worker_timing_path(records_dir, task)
    document = {}
    if path.exists():
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
        except ValueError:
            document = {}
    merged = dict(document)
    for key, value in (("task", task), ("phase", phase), ("session_id", session_id), *fields.items()):
        merged.setdefault(key, value)
    temporary = path.with_name(path.name + ".%d.tmp" % os.getpid())
    temporary.write_text(json.dumps(merged, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def persist_main_gate(records_dir, phase, at_ns, call_id, session):
    """一次性事件 O_EXCL 落盘（同 phase_entry 纪律）；已存在且身份不符即异常。"""
    path = main_gate_path(records_dir, phase)
    document = {"phase": phase, "gate": "%s_final_gate_ns" % phase, "at_ns": at_ns,
                "call_id": call_id, "session": session}
    try:
        with path.open("x", encoding="utf-8") as stream:
            json.dump(document, stream, ensure_ascii=False, indent=1)
            stream.write("\n")
    except FileExistsError:
        previous = json.loads(path.read_text(encoding="utf-8"))
        if previous.get("gate") != document["gate"]:
            raise RuntimeError("main gate observation for %s diverged from the first one" % phase)
    return json.loads(path.read_text(encoding="utf-8"))


def load_gate_timeline(records_dir):
    timeline = {}
    for phase in ("analysis", "eqclass"):
        path = main_gate_path(records_dir, phase)
        if not path.exists():
            continue
        document = json.loads(path.read_text(encoding="utf-8"))
        at_ns = document.get("at_ns")
        if document.get("gate") == "%s_final_gate_ns" % phase and isinstance(at_ns, int) and at_ns > 0:
            timeline[document["gate"]] = at_ns
    return timeline


def apply_worker_timing(record, records_dir):
    """把已落盘的真实观测按（task, session, phase）身份对上后覆写进 record。"""
    path = worker_timing_path(records_dir, record.get("logical_task_tag"))
    if not path.exists():
        return record
    document = json.loads(path.read_text(encoding="utf-8"))
    if document.get("session_id") != record.get("session_id") or document.get("phase") != record.get("phase"):
        return record
    for field in WORKER_TIMING_FIELDS:
        if isinstance(document.get(field), int):
            record[field] = document[field]
    return record
