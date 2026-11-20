#!/usr/bin/env python3
"""新 lane 挂载（mock-with-pi mount 契约）：统一请求 stdin → 新解释器 → 回复 stdout。

- 路由：worker BENCH-TAG → worker.md；main（含自动判定）→ main.md；title/门/压缩
  → aux.md。所有模型 IO 都经 mock2.mjs（新解释器、阅读 pointer、Validation）。
- FSM 单槽身份串行（冻结机不变量的跨进程移植）：同名 fsm 工具锁按会话持有，
  会话下一请求到达即释放；等待上限 20s。带内回执被 compaction 抹掉时，按锁内
  签发记录做有界活体回执对账，仅凭已验证终态真实回执释放该唯一锁。
- 逐请求落 new-lane-tape.jsonl：请求/回复 sha256、类别、解释器 argv 与退出码
  ——新解释器在场的执行见证。
"""
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

sys.path[:0] = [str(Path(__file__).resolve().parent)]

HERE = Path(__file__).resolve().parent
DOMAIN = HERE.parent
MOCK2 = str(DOMAIN.parent.parent.parent / "mock2.mjs")
LOCK_LIMIT_S = 20.0


def route(raw):
    sys.path[:0] = [str(HERE)]
    from lane_context import build_payload, extract_tag, message_text
    import worker_registry
    request = raw.get("request") or {}
    messages = (request.get("context") or {}).get("messages") or []
    session = (request.get("options") or {}).get("sessionId") or ""
    records = Path(os.environ["CCA_NEW_LANE"]) / "records"
    tag = extract_tag(messages)
    system = [m for m in messages if m.get("role") == "system"]
    head = message_text(system[0])[:160] if system else ""
    names = sorted({t.get("name") for m in system for t in m.get("toolsAdded") or [] if isinstance(t, dict)})
    tools_count = sum(len(m.get("toolsAdded") or []) for m in system)
    # 请求形状优先于内容 tag：compaction/title/gate 请求（无 toolsAdded）即使会话
    # 文本里嵌了 worker BENCH-TAG（cx8 0017/0019/0020：main.s8 agent 参数内嵌），
    # 也必须走 aux 文本车道——summary 模式禁 toolCall，worker 车道必回 w1.s1。
    if "title generator" in head or "StructuredOutput" in names or not tools_count:
        return "aux", tag
    # 真 tag 在场＝可信注册点（genuine initial worker request）：持久绑定
    # session→worker 身份，拒绝 root 冒充与同会话异身份（conflict 原语义保持）。
    # 绑定已存在且本请求是压缩后续行（marker 在场）：持久身份权威，转录内任意
    # tag（含锚前渲染转述里的伪造 tag）不再重注册、不再抢占、不触发假 conflict。
    if tag and tag.get("role") == "worker":
        from compact_receipt import MARKER_TEXT
        existing = worker_registry.binding(records, session)
        continuation = any(m.get("role") == "user"
                            and message_text(m).strip().startswith(MARKER_TEXT) for m in messages)
        if existing is None or (worker_registry.tag_of(existing) != tag and not continuation):
            return "worker", worker_registry.register(records, os.environ.get("CCA_NEW_ROOT_SESSION", ""),
                                                       session, tag)
        return "worker", worker_registry.tag_of(existing)
    # 压缩后无 tag 的续行（cx12 0021）：按本 lane 自有绑定恢复 worker 角色；
    # root/未知会话仍走 main（main_step 的 session 检查保持原失败语义）。
    if tag is None and session:
        restored = worker_registry.binding_tag(records, session)
        if restored is not None:
            return "worker", restored
    return "main", tag or {"role": "main"}


def release_slots(locks, raw):
    """对齐冻结机 _release_on_real_result：只有回执携带该次真实 callId 才释放，
    不因同会话下一个请求（如 aux/无回执请求）误释放。"""
    messages = ((raw.get("request") or {}).get("context") or {}).get("messages") or []
    settled = None
    for message in reversed(messages):
        if message.get("role") == "toolResult":
            settled = message.get("toolCallId")
            break
    if settled is None:
        return
    for lock in list(locks.glob("*.lock")):
        try:
            holder = json.loads(lock.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if holder.get("callId") == settled:
            lock.unlink()


def acquire_slots(locks, session, call_ids, lane, trace):
    """同名 fsm 工具单槽串行：持锁到其真实回执（release_slots），非会话粒度。

    签发时把属主身份 (session, callId, tool, exact arguments) 写进锁文件；被
    异会话旧锁阻塞且带内回执已被 compaction 抹掉时，按锁内记录对同一属主做
    有界活体回执对账（fsm_slot_reconcile）：仅凭已验证的终态真实回执释放该
    唯一锁；其余一切情况维持原等待/20s 超时语义不变。"""
    deadline = time.monotonic() + LOCK_LIMIT_S
    taken = []
    observations = {}
    for name, call_id, arguments in sorted(call_ids):
        path = locks / f"{name}.lock"
        while True:
            try:
                with path.open("x", encoding="utf-8") as handle:
                    handle.write(json.dumps({"session": session, "callId": call_id,
                                             "tool": name, "arguments": arguments}))
                taken.append(path)
                break
            except FileExistsError:
                try:
                    holder = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    holder = {}
                if holder.get("session") == session:
                    break
                if _reconcile_blocked_lock(path, holder, name, lane, deadline, observations, trace):
                    continue
                if time.monotonic() > deadline:
                    for item in taken:
                        try:
                            item.unlink()
                        except OSError:
                            pass
                    held = {"session": holder.get("session"), "callId": holder.get("callId")}
                    return f"fsm_tool_slot_timeout: {name} held by {held} over {LOCK_LIMIT_S}s"
                time.sleep(0.2)
    return None


def _reconcile_blocked_lock(path, holder, name, lane, deadline, observations, trace):
    """有界对账：首次阻塞立即观测一次；临近上限再补一次（每锁≤2次 GET）。
    released→释放该锁并让调用方重试获取；其余一律 False（继续原等待）。"""
    count = observations.get(path, 0)
    if not (count == 0 or (count == 1 and deadline - time.monotonic() < 1.0)):
        return False
    observations[path] = count + 1
    import fsm_slot_reconcile
    record = fsm_slot_reconcile.reconcile(lane, path, holder, name)
    trace.append({"at_ns": time.time_ns(), "tool": name, "holder": holder, **record})
    return record.get("outcome") == "released"


def main():
    data = sys.stdin.buffer.read()
    try:
        raw = json.loads(data)
    except ValueError as error:
        print(json.dumps({"error": {"status": 422, "code": "bad_request", "message": str(error)}}))
        return 1
    lane = Path(os.environ["CCA_NEW_LANE"])
    try:
        kind, tag = route(raw)
    except Exception as fault:
        sys.path[:0] = [str(HERE)]
        import lane_context  # noqa: F401  (sys.path for cca_bench)
        from cca_bench.suites.mock_results import MockFault
        if not isinstance(fault, MockFault):
            raise
        print(json.dumps({"error": {"status": 422, "code": fault.kind, "message": str(fault)}}))
        return 1
    session = ((raw.get("request") or {}).get("options") or {}).get("sessionId") or ""
    locks = lane / "fsm-slots"
    locks.mkdir(exist_ok=True)
    release_slots(locks, raw)
    playbook = str(DOMAIN / {"main": "main.md", "worker": "worker.md", "aux": "aux.md"}[kind])
    argv = ["node", MOCK2, "--playbook", playbook, "--judge-timeout-ms", "120000"]
    if kind == "aux":
        # 同一个 aux 请求的门禁判定可以随主会话落盘状态变化。
        argv.append("--no-cache")
    else:
        argv.extend(["--cache-dir", str(lane / "mock2-cache")])
    env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
    started = time.monotonic()
    child = subprocess.run(argv, input=data, capture_output=True, cwd=str(DOMAIN), env=env)
    sys.stderr.buffer.write(child.stderr)
    outcome = {"stamp_ns": time.time_ns(), "class": kind, "session": session,
               "tag": tag, "request_sha256": hashlib.sha256(data).hexdigest(),
               "argv": argv, "exit": child.returncode, "wall_s": round(time.monotonic() - started, 4),
               "reply_sha256": hashlib.sha256(child.stdout).hexdigest(),
               "interpreter": MOCK2, "reply_head": child.stdout[:400].decode("utf-8", "replace")}
    if child.returncode == 0:
        try:
            reply = json.loads(child.stdout)
            calls = [b for b in (reply.get("content") or []) if isinstance(b, dict) and b.get("type") == "toolCall"]
            reconcile_trace = []
            fault = acquire_slots(locks, session,
                                  [(c.get("name"), c.get("id"), c.get("arguments")) for c in calls
                                   if str(c.get("name", "")).startswith("fsm_")],
                                  lane, reconcile_trace)
            if reconcile_trace:
                outcome["slot_reconcile"] = reconcile_trace
            if fault:
                outcome["slot_fault"] = fault
                child = subprocess.CompletedProcess(argv, 0,
                                                    json.dumps({"error": {"status": 500, "code": "mock_fault",
                                                                          "message": fault}}).encode(),
                                                    b"")
                outcome["reply_sha256"] = hashlib.sha256(child.stdout).hexdigest()
        except ValueError:
            outcome["reply_unparsed"] = True
    with (lane / "new-lane-tape.jsonl").open("a", encoding="utf-8") as tape:
        tape.write(json.dumps(outcome, ensure_ascii=False) + "\n")
    sys.stdout.buffer.write(child.stdout)
    return child.returncode


if __name__ == "__main__":
    raise SystemExit(main())
