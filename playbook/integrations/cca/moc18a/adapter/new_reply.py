#!/usr/bin/env python3
"""新 lane 挂载（mock-with-pi mount 契约）：统一请求 stdin → 新解释器 → 回复 stdout。

- 路由：worker BENCH-TAG → worker.md；main（含自动判定）→ main.md；title/门/压缩
  → aux.md。所有模型 IO 都经 mock2.mjs（新解释器、阅读 pointer、Validation）。
- FSM 单槽身份串行（冻结机不变量的跨进程移植）：同名 fsm 工具锁按会话持有，
  会话下一请求到达即释放；等待上限 20s。
- 逐请求落 new-lane-tape.jsonl：请求/回复 sha256、类别、解释器 argv 与退出码
  ——新解释器在场的执行见证。
"""
import hashlib
import json
import os
import re
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
    request = raw.get("request") or {}
    messages = (request.get("context") or {}).get("messages") or []
    tag = extract_tag(messages)
    if tag and tag.get("role") == "worker":
        return "worker", tag
    system = [m for m in messages if m.get("role") == "system"]
    head = message_text(system[0])[:160] if system else ""
    names = sorted({t.get("name") for m in system for t in m.get("toolsAdded") or [] if isinstance(t, dict)})
    tools_count = sum(len(m.get("toolsAdded") or []) for m in system)
    if "title generator" in head or "StructuredOutput" in names or not tools_count:
        return "aux", tag
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


def acquire_slots(locks, session, call_ids):
    """同名 fsm 工具单槽串行：持锁到其真实回执（release_slots），非会话粒度。"""
    deadline = time.monotonic() + LOCK_LIMIT_S
    taken = []
    for name, call_id in sorted(call_ids):
        path = locks / f"{name}.lock"
        while True:
            try:
                with path.open("x", encoding="utf-8") as handle:
                    handle.write(json.dumps({"session": session, "callId": call_id}))
                taken.append(path)
                break
            except FileExistsError:
                try:
                    holder = json.loads(lock_text := path.read_text(encoding="utf-8"))
                except (OSError, ValueError):
                    holder = {}
                if holder.get("session") == session:
                    break
                if time.monotonic() > deadline:
                    for item in taken:
                        try:
                            item.unlink()
                        except OSError:
                            pass
                    return f"fsm_tool_slot_timeout: {name} held by {holder} over {LOCK_LIMIT_S}s"
                time.sleep(0.2)
    return None


AGENT_EVENT = re.compile(r'(<agent id="ses_[A-Za-z0-9]+" state="[A-Za-z_]+")\s[^>]*>')


def normalize_agent_events(raw):
    """冻结 cca_bench 的 AGENT_RETURN 只认 `<agent id=.. state=..>` 收尾；本机
    OC fork 的事件还带 run/ended 等属性。在 lane 边界把事件头归一化回冻结契约
    形状，事件体（summary/agent_result）原样保留。"""
    for message in (((raw.get("request") or {}).get("context") or {}).get("messages") or []):
        if message.get("role") != "user":
            continue
        content = message.get("content")
        if isinstance(content, str):
            message["content"] = AGENT_EVENT.sub(r"\1>", content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    block["text"] = AGENT_EVENT.sub(r"\1>", block.get("text") or "")
    return raw


def coalesce_user_messages(raw):
    """OC 宿主会在同一请求里追加多条 user 消息（agent 回程通知 + Now/子代理
    状态注入），而解释器协议是一 user 一回复（连续两条即 playbook_state 拒绝）。
    把相邻（中间只隔 system）的 user 消息合并为一条，文本按空行连接；回程
    事件由业务层从尾部文本正则解析，合并不丢信息。"""
    context = (raw.get("request") or {}).get("context") or {}
    messages = context.get("messages") or []

    def text_of(message):
        content = message.get("content")
        if isinstance(content, str):
            return content
        return "\n".join(block.get("text", "") for block in content or []
                          if isinstance(block, dict) and block.get("type") == "text")

    merged, run, systems = [], [], []

    def flush():
        if systems:
            merged.extend(systems)
            systems.clear()
        if not run:
            return
        if len(run) == 1:
            merged.append(run[0])
        else:
            merged.append({**run[0], "content": "\n\n".join(t for t in map(text_of, run) if t)})
        run.clear()

    for message in messages:
        if message.get("role") == "user":
            run.append(message)
        elif message.get("role") == "system" and run:
            systems.append(message)
        else:
            flush()
            merged.append(message)
    flush()
    context["messages"] = merged
    return raw


def main():
    data = sys.stdin.buffer.read()
    dump_dir = os.environ.get("CCA_NEW_DUMP_DIR")
    if dump_dir:
        path = Path(dump_dir)
        path.mkdir(parents=True, exist_ok=True)
        (path / ("req-%d.json" % time.time_ns())).write_bytes(data)
    try:
        raw = json.loads(data)
    except ValueError as error:
        print(json.dumps({"error": {"status": 422, "code": "bad_request", "message": str(error)}}))
        return 1
    coalesce_user_messages(raw)
    normalize_agent_events(raw)
    data = json.dumps(raw, ensure_ascii=False).encode("utf-8")
    lane = Path(os.environ["CCA_NEW_LANE"])
    kind, tag = route(raw)
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
            fault = acquire_slots(locks, session, [(c.get("name"), c.get("id")) for c in calls
                                                   if str(c.get("name", "")).startswith("fsm_")])
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
