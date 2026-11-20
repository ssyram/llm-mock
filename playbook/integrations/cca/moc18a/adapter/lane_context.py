"""新 lane 共用核心：环境解析、payload 派生（逐字对齐冻结 mock_reply）、账本存根。

模型业务不重写：PilotMainScript/PilotWorkerBook/PilotDeltaBook 按只读库复用，
本模块只做"transcript→逐请求 payload→重放校验→下一步决策"的确定性重建。
"""
import hashlib
import json
import os
import re
import sys
import time
from pathlib import Path

PROJECT = Path(os.environ.get("CCA_ANALYSIS_PROJECT",
                              "/Users/ssyram/workspace/work-fv/c-code-verify/.local/analysis-decouple"))
# 与 launcher（new_lane.py）同一显式导出环境、同一优先级：CCA_MOCK18A_SUT/
# CCA_MOCK18A_PILOT 一致解析 HOME/PILOT，未设即旧树原行为；显式设置了但缺必备
# 布局时在边界硬错，不静默回退（否则挂载子进程与 launcher 会用两个框架根）。
HOME = Path(os.environ["CCA_MOCK18A_SUT"]) if os.environ.get("CCA_MOCK18A_SUT") else PROJECT / ".local/cca-newtree-sut-20261117"
PILOT = Path(os.environ["CCA_MOCK18A_PILOT"]) if os.environ.get("CCA_MOCK18A_PILOT") else PROJECT / ".pi/research/gate-latency-mock-148"
if os.environ.get("CCA_MOCK18A_SUT") and not (HOME / "scripts").is_dir():
    raise RuntimeError("CCA_MOCK18A_SUT missing scripts/ (refusing legacy fallback): %s" % HOME)
if os.environ.get("CCA_MOCK18A_PILOT") and not (PILOT / "pilot").is_dir():
    raise RuntimeError("CCA_MOCK18A_PILOT missing pilot/ (refusing legacy fallback): %s" % PILOT)
sys.path[:0] = [str(HOME / "scripts"), str(PILOT)]

TAG_PATTERN = re.compile(r"BENCH-TAG role=(main|worker) phase=(analysis|eqclass) "
                         r"task=([A-Za-z0-9._-]+) kind=([A-Za-z0-9_-]+)")
TOOL_TEXT_LIMIT = 1_048_576
TRAIL_HEAD_LIMIT = 4000

# 确定性对偶模式：spec.mock 声明这一固定默认组合时，Mock 业务随机选择全部走固定
# 默认（不加点、不加边、每次等待恰 0.5s）；其余组合维持普通随机模式不变。
DETERMINISTIC_MOCK = {"delta_probability": 0.0, "max_new_nodes_per_task": 0,
                      "max_new_edges_per_task": 0, "max_external_marks_per_task": 0,
                      "max_new_nodes": 0, "max_new_facts": 0, "wait_seconds": [0.5, 0.5]}


def fixed_default_level(spec, level):
    from dataclasses import replace
    if spec["mock"] != DETERMINISTIC_MOCK:
        return level
    return replace(level, delta_p=0.0, new_node_cap=0, new_edge_cap=0, retract_edge_cap=0,
                   sleep_s_range=(0.5, 0.5))


def lane_env():
    root = Path(os.environ["CCA_NEW_LANE"])
    return {
        "root": root,
        "spec": json.loads((root / "input-spec.json").read_text(encoding="utf-8")),
        "entries": json.loads((root / "entries.json").read_text(encoding="utf-8")),
        "workspace": Path(os.environ["CCA_NEW_WORKSPACE"]),
        "root_session": os.environ["CCA_NEW_ROOT_SESSION"],
        "tape": json.loads(Path(os.environ["CCA_NEW_TAPE"]).read_text(encoding="utf-8"))
        if os.environ.get("CCA_NEW_TAPE") else None,
        "records": root / "records",
    }


class TapeLedger:
    """冻结机账本的忠实存根：计数 + 全量 jsonl 落盘（观测不裁剪）。

    count 事件同样落盘：每请求都是新进程，内存计数不可跨请求（r256b 首错
    根因即内存计数恒 0），真实 worker 完成经账本行持久。重放会重复触发同一
    count：跨进程消费方按 (phase, kind, label) 去重，语义为“真实发生过该
    事件的标签集合”，跨重放幂等、不随请求数膨胀。
    """

    def __init__(self, records_dir):
        self.records_dir = Path(records_dir)
        self.records_dir.mkdir(parents=True, exist_ok=True)
        self.counts = {}
        self._stream = (self.records_dir / "ledger.jsonl").open("a", encoding="utf-8")

    def count(self, phase, event, label):
        self.counts[(phase, event, label)] = self.counts.get((phase, event, label), 0) + 1
        self._ingest({"event": "count", "phase": phase, "kind": event, "label": label})

    def total_accepted(self):
        return sum(1 for (phase, event, _), n in self.counts.items() if event == "accepted" for _ in range(n))

    def ledger_text(self):
        accepted = self.total_accepted()
        lines = [f"{phase} {event} {label} x{n}" for (phase, event, label), n in sorted(self.counts.items())]
        return "continue from %d\n%s" % (accepted, "\n".join(lines))

    def _ingest(self, row):
        row = dict(row, at_ns=time.time_ns())
        self._stream.write(json.dumps(row, ensure_ascii=False) + "\n")
        self._stream.flush()


def message_text(message):
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(block.get("text", "") for block in content
                         if isinstance(block, dict) and block.get("type", "text") == "text"
                         and isinstance(block.get("text"), str))
    return ""


def extract_tag(messages):
    for message in reversed(messages):
        found = TAG_PATTERN.search(message_text(message))
        if found:
            role, phase, task, kind = found.groups()
            return {"role": role, "phase": phase, "task": task, "kind": kind}
    return None


def build_payload(raw, boundary):
    """boundary 为本次请求可见的消息数：逐字对齐冻结 mock_reply.build_payload。"""
    request = raw.get("request") or {}
    messages = ((request.get("context") or {}).get("messages") or [])[:boundary]
    system = [message for message in messages if message.get("role") == "system"]
    last = None
    for message in reversed(messages):
        if message.get("role") == "toolResult":
            text = message_text(message)
            last = {"toolCallId": message.get("toolCallId"), "toolName": message.get("toolName"),
                    "isError": bool(message.get("isError")),
                    "text": text[:TOOL_TEXT_LIMIT], "text_chars": len(text),
                    "text_sha256": hashlib.sha256(text.encode()).hexdigest()}
            break
    tail = []
    for message in reversed(messages):
        if message.get("role") == "assistant":
            break
        tail.append({"role": message.get("role"), "head": message_text(message)[:TRAIL_HEAD_LIMIT]})
    return {"tag": extract_tag(messages), "messages_count": boundary,
            "last_tool_result": last,
            "session_id": (request.get("options") or {}).get("sessionId"),
            "tools_count": sum(len(m.get("toolsAdded") or []) for m in system),
            "tool_names": sorted({t.get("name") for m in system for t in m.get("toolsAdded") or []
                                  if isinstance(t, dict)}),
            "system_head": message_text(system[0])[:160] if system else "",
            "user_count": sum(1 for m in messages if m.get("role") == "user"),
            "trailing": list(reversed(tail)), "api": raw.get("api"), "model": raw.get("model")}


def request_boundaries(messages):
    """每个 assistant 回显对应一次已发生的模型请求：其可见前缀长度。"""
    boundaries = []
    for index, message in enumerate(messages):
        if message.get("role") == "assistant":
            boundaries.append(index)
    return boundaries


def decision_matches(decision, echo):
    """重放决策与真实回显逐字核对（工具 id/名/参数或文本）——真实 Validation。"""
    content = echo.get("content") or []
    if decision.get("action") == "tool":
        call = next((b for b in content if isinstance(b, dict) and b.get("type") == "toolCall"), None)
        return bool(call) and call.get("id") == decision.get("id") and call.get("name") == decision.get("name") \
            and call.get("arguments") == decision.get("arguments")
    text = "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return decision.get("action") == "text" and text == decision.get("text")


def fault_reply(reason):
    return {"error": {"status": 500, "code": "mock_fault", "message": reason}}


def trace_handler(env, session, record):
    """业务 handler 在场薄见证：入口 pointer、三态判定、重放核对的回执 span、
    产出决策与整单元跳转。只追加既有 records 目录，不做通用 tracing。"""
    try:
        with (env["records"] / "handler-trace.jsonl").open("a", encoding="utf-8") as stream:
            stream.write(json.dumps({"session": session, "at_ns": time.time_ns(), **record},
                                    ensure_ascii=False) + "\n")
    except OSError:
        pass
