"""Main Segment 业务程序：消费 transcript（阅读 pointer=消费前沿），按冻结
PilotMainScript 确定性重放已回显决策并核对，然后给出下一步真实决策。

入口三态（由 pointer P 与其后真实消息结构判定，冷热重放同判定）：
- P 处是自己回显且其后紧跟回执 ⇒ resume：重放含 P，产出下一决策，并返回
  pointer 跳过该完整 RV（echo+回执整单元消费提交）；
- P 处是自己回显且其后无回执 ⇒ 本请求即该回显的重发（walk）：重放 P 之前，
  step(P) 得到决策并原样再发（解释器与回显逐字核对）；
- P==前沿 ⇒ 续行：重放全部已回显，step(前沿) 得下一决策。
决策 tool → assistant(toolCall)；idle → result:idle+values(idle 文本)；
terminal → assistant(纯文本) 自然结束回合与会话。
para omit-override：启动输入 para:XX 仅显式正整数追加到 reserve 命令；缺省/0/
负数（真实识别）一律省略 --para，继承配置并发。
"""
import json
import os
import re
import sys

sys.path[:0] = [os.path.dirname(os.path.abspath(__file__))]
from lane_context import (build_payload, decision_matches, fault_reply, fixed_default_level, lane_env,
                          request_boundaries, TapeLedger, trace_handler)
from phase_entry import phase_entry
from timing_capture import persist_main_gate

from pilot.case_body import pilot_budgets, pilot_level
from pilot.machine import PilotMainScript
from pilot.worker_wait import PilotDeltaBook, PilotWorkerBook
from cca_bench.suites.mock_faults import Injection
from cca_bench.suites.mock_results import MockFault

PARA = re.compile(r"\bpara:\s*(-?\d+)", re.IGNORECASE)


def parse_para(messages):
    for message in messages:
        if message.get("role") == "user":
            content = message.get("content")
            found = PARA.search(content if isinstance(content, str) else json.dumps(content))
            if found:
                value = int(found.group(1))
                return value if value >= 1 else None
            break
    return None


def build_script(env, ledger):
    spec, mock = env["spec"], env["spec"]["mock"]
    level = fixed_default_level(spec, pilot_level(spec["parallel"], spec["batch"], mock["max_new_nodes"]))
    budgets = pilot_budgets(level, len(spec["nodes"]), len(spec["edges"]), 1800,
                            mock["max_new_nodes"], mock["max_new_facts"])
    deltas = PilotDeltaBook(level, spec["seed"], len(spec["nodes"]), len(spec["edges"]), budgets)
    workers = PilotWorkerBook(level.name, deltas, ledger, env["workspace"], env["root_session"], "product", Injection())
    context = {"replay": False}
    script = PilotMainScript(workers, lambda phase: phase_entry(env, phase, replay=context["replay"]),
                             "BENCH-TAG role=main phase=analysis task=main kind=main", Injection())
    script.entry_context = context
    script.root_session = env["root_session"]
    return script


def is_main_echo(message):
    return message.get("role") == "assistant" and bool(message.get("content")) \
        and message_kind(message) == "main"


def message_kind(message):
    content = message.get("content") or []
    if any(isinstance(b, dict) and b.get("type") == "toolCall" and b.get("name") == "StructuredOutput"
           for b in content):
        return "gate"
    if any(isinstance(b, dict) and b.get("type") == "text" and "continue from " in b.get("text", "")
           for b in content):
        return "compaction"
    return "main"


def next_decision(raw, messages, pointer, script):
    session = ((raw.get("request") or {}).get("options") or {}).get("sessionId")
    if session != script.root_session:
        raise MockFault("session_mismatch", "Main request does not belong to the fixed root session")
    boundaries = [i for i, m in enumerate(messages) if is_main_echo(m)]
    at_echo = pointer < len(messages) and messages[pointer].get("role") == "assistant"
    resume = (at_echo and is_main_echo(messages[pointer])
              and pointer + 1 < len(messages) and messages[pointer + 1].get("role") == "toolResult")
    walk = at_echo and not resume
    upto = pointer if resume else pointer - 1
    for index, message in enumerate(messages):
        if index > upto or message.get("role") != "assistant":
            continue
        if message_kind(message) == "compaction":
            script.compacted()
            continue
        if message_kind(message) == "gate":
            continue
        script.entry_context["replay"] = True
        decision = script.step(build_payload(raw, index))
        if not decision_matches(decision, message):
            raise MockFault("replay_drift", "replayed %r but transcript has %r"
                            % ({k: decision.get(k) for k in ("action", "id", "name")},
                               json.dumps(message.get("content"), ensure_ascii=False)[:300]))
    if walk and not is_main_echo(messages[pointer]):
        text = "\n".join(b.get("text", "") for b in messages[pointer].get("content") or []
                         if isinstance(b, dict) and b.get("type") == "text")
        return {"action": "text", "text": text, "verbatim": True}, None, {"case": "walk-verbatim",
            "pointer": pointer, "boundary": pointer, "jump": None, "verified_call_ids": []}
    jump = None
    if resume:
        base = pointer + 1
        while base < len(messages) and messages[base].get("role") == "toolResult":
            base += 1
        following = [b for b in boundaries if b >= base]
        jump = following[0] if following else len(messages)
        for message in messages[base:jump]:
            if message.get("role") == "assistant" and message_kind(message) == "compaction":
                script.compacted()
    boundary = pointer if walk else (jump if resume else len(messages))
    script.entry_context["replay"] = walk
    timeline_before = set(script.stats["timeline"])
    consumed_before = len(script.consumed)
    decision = script.step(build_payload(raw, boundary))
    # resume 的最终 step 可能仍重放历史边界、重放循环也会重建旧门时间线：只有真实前沿
    # （boundary==消息数）上由最终 step 新消费回执才新产出门键；缺新消费身份宁可缺证据。
    frontier_gates = []
    if boundary == len(messages) and len(script.consumed) > consumed_before:
        consumed_now = script.consumed[-1]
        for phase, gate in (("analysis", "analysis_final_gate_ns"), ("eqclass", "eqclass_final_gate_ns")):
            if gate in script.stats["timeline"] and gate not in timeline_before:
                frontier_gates.append({"phase": phase, "gate": gate,
                                       "at_ns": script.stats["timeline"][gate], "call_id": consumed_now})
    return decision, jump, {"case": "resume" if resume else "walk" if walk else "frontier",
                            "pointer": pointer, "boundary": boundary, "jump": jump,
                            "frontier_gates": frontier_gates,
                            "verified_call_ids": [messages[b].get("content", [{}])[0].get("id")
                                                  for b in request_boundaries(messages) if b <= upto]}


def terminal_reply(text, jump):
    reply = {"assistant": {"content": [{"type": "text", "text": text}], "stopReason": "stop"}}
    if jump is not None:
        reply["pointer"] = jump
    return reply


def main():
    envelope = json.loads(sys.stdin.read())
    raw = json.loads(open(envelope["transcript"], encoding="utf-8").read())
    messages = ((raw.get("request") or {}).get("context") or {}).get("messages") or []
    env = lane_env()
    script = build_script(env, TapeLedger(env["records"]))
    para = parse_para(messages)
    try:
        decision, jump, trace = next_decision(raw, messages, envelope["pointer"], script)
        for gate in trace.get("frontier_gates") or ():
            persist_main_gate(env["records"], gate["phase"], gate["at_ns"], gate["call_id"],
                              env["root_session"])
        trace_handler(env, ((raw.get("request") or {}).get("options") or {}).get("sessionId"),
                      {**trace, "decision": {"action": decision.get("action"), "id": decision.get("id"),
                                             "name": decision.get("name")},
                       "gate_verdict": script.gate_verdict()})
    except MockFault as fault:
        sys.stderr.write(f"main_step {fault.kind}: {fault}\n")
        raise SystemExit(3)
    if decision.get("verbatim"):
        print(json.dumps({"result": "idle", "values": {"idle_text": decision["text"]}}, ensure_ascii=False))
        return
    if decision.get("action") == "tool":
        if para is not None and decision.get("name") == "bash" \
                and " reserve " in decision["arguments"].get("command", ""):
            decision["arguments"] = {**decision["arguments"],
                                     "command": decision["arguments"]["command"] + f" --para {para}"}
        reply = {"assistant": {"content": [{"type": "toolCall", "id": decision["id"], "name": decision["name"],
                                            "arguments": decision["arguments"]}], "stopReason": "toolUse"}}
        print(json.dumps(reply if jump is None else {**reply, "pointer": jump}, ensure_ascii=False))
        return
    if decision.get("action") == "text" and decision.get("terminal"):
        print(json.dumps(terminal_reply(decision["text"], jump), ensure_ascii=False))
        return
    idle = {"result": "idle", "values": {"idle_text": decision.get("text", "")}}
    if jump is not None:
        idle["pointer"] = jump
    print(json.dumps(idle, ensure_ascii=False))


if __name__ == "__main__":
    main()
