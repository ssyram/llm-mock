"""aux Segment 业务程序：title / Stop 门 / compaction 三类旁路模型请求。

分类逐字对齐冻结 ScenarioMachine._classify；Main 状态由本会话 transcript 重放
PilotMainScript 重建（gate 的 waiting/active 与 compaction 的账本计数同源）。
"""
import json
import os
import sys

sys.path[:0] = [os.path.dirname(os.path.abspath(__file__))]
from lane_context import build_payload, decision_matches, fault_reply, fixed_default_level, lane_env, request_boundaries, TapeLedger
from phase_entry import phase_entry

from pilot.case_body import pilot_budgets, pilot_level
from pilot.machine import PilotMainScript
from pilot.worker_wait import PilotDeltaBook, PilotWorkerBook
from cca_bench.suites.mock_faults import Injection
from cca_bench.suites.mock_results import MockFault


def build_script(env, ledger):
    spec, mock = env["spec"], env["spec"]["mock"]
    level = fixed_default_level(spec, pilot_level(spec["parallel"], spec["batch"], mock["max_new_nodes"]))
    nodes, edges = len(spec["nodes"]), len(spec["edges"])
    budgets = pilot_budgets(level, nodes, edges, 1800, mock["max_new_nodes"], mock["max_new_facts"])
    deltas = PilotDeltaBook(level, spec["seed"], nodes, edges, budgets)
    workers = PilotWorkerBook(level.name, deltas, ledger, env["workspace"], env["root_session"], "product", Injection())
    return PilotMainScript(workers, lambda phase: phase_entry(env, phase, replay=True),
                           "BENCH-TAG role=main phase=analysis task=main kind=main", Injection())


def latest_main_verdict(env, script):
    path = env["records"] / "handler-trace.jsonl"
    if path.exists():
        for line in reversed(path.read_text(encoding="utf-8").splitlines()):
            row = json.loads(line)
            if row.get("session") == env["root_session"] and "gate_verdict" in row:
                return row["gate_verdict"]
    return script.gate_verdict()


def main():
    envelope = json.loads(sys.stdin.read())
    raw = json.loads(open(envelope["transcript"], encoding="utf-8").read())
    messages = ((raw.get("request") or {}).get("context") or {}).get("messages") or []
    payload = build_payload(raw, len(messages))
    env = lane_env()
    ledger = TapeLedger(env["records"])
    script = build_script(env, ledger)
    kind = "title"
    if "title generator" not in (payload.get("system_head") or ""):
        if "StructuredOutput" in (payload.get("tool_names") or ()):
            kind = "gate"
        elif not payload.get("tools_count"):
            kind = "compaction"
    try:
        for boundary, echo in zip(request_boundaries(messages),
                                  [m for m in messages if m.get("role") == "assistant"]):
            content = echo.get("content") or []
            if any(isinstance(b, dict) and b.get("type") == "toolCall" and b.get("name") == "StructuredOutput"
                   for b in content):
                continue
            decision = script.step(build_payload(raw, boundary))
            if not decision_matches(decision, echo):
                raise MockFault("replay_drift", "aux replay diverged at message %d" % boundary)
    except MockFault as fault:
        print(json.dumps(fault_reply(f"{fault.kind}: {fault}"), ensure_ascii=False))
        return
    if kind == "title":
        print(json.dumps({"assistant": {"content": [{"type": "text", "text": "bench mock run"}],
                                        "stopReason": "stop"}}, ensure_ascii=False))
        return
    if kind == "gate":
        verdict = latest_main_verdict(env, script)
        print(json.dumps({"assistant": {"content": [
            {"type": "toolCall", "id": "gate.%d" % len(script.stats["gate_verdicts"]),
             "name": "StructuredOutput", "arguments": verdict}], "stopReason": "toolUse"}},
            ensure_ascii=False))
        return
    script.compacted()
    text = "%s\n%s" % ("BENCH-TAG role=main phase=analysis task=main kind=main", ledger.ledger_text())
    print(json.dumps({"assistant": {"content": [{"type": "text", "text": text}],
                                    "stopReason": "stop"}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
