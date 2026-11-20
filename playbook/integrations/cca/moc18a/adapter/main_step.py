"""Main Segment 业务程序：消费 transcript（阅读 pointer=消费前沿），按冻结
PilotMainScript 确定性重放已回显决策并核对，然后给出下一步真实决策。

入口三态（由 pointer P 与其后真实消息结构判定，冷热重放同判定）：
- P 处是自己回显且其后紧跟回执 ⇒ resume：重放含 P，产出下一决策，并返回
  pointer 跳过该完整 RV（echo+回执整单元消费提交）；
- P 处是自己回显且其后无回执 ⇒ 本请求即该回显的重发（walk）：重放 P 之前，
  step(P) 得到决策并原样再发（解释器与回显逐字核对）；
- P==前沿 ⇒ 续行：重放全部已回显，step(前沿) 得下一决策。

压缩形状（用户裁决的结构法则，与 worker_step 同法）：marker user 消息与锚
（其后首条恰为结构化 own 回执 JSON 的回显）之间的一切＝显式丢弃段——不解析、
不匹配、不绑定、不触发协议故障（root 旧保留尾法则：锚前核对/重步进/收养已
废除）。锚引用经本地 own 链全身份验证（namespace/session/spec/adapters/ref）
后装配快照恢复；指针落在丢弃段时先于任何引擎匹配跳至锚并 idle 逐字重导锚
回执（解释器经 say 回环在锚位采纳）。锚后保留尾由基线之后的正常重放逐条经
冻结机核对；锚后回执回显仍须解析进本 root 命名空间（外链/未知＝fail closed）。
"""
import json
import os
import re
import sys

sys.path[:0] = [os.path.dirname(os.path.abspath(__file__))]
import compact_inflight_wait
import compact_receipt
import compact_state
from lane_context import (build_payload, fixed_default_level, lane_env,
                          message_text, request_boundaries, TapeLedger, trace_handler)
from main_replay import is_main_echo, message_kind, replay_retained, trace_row, walk_target
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
            return (int(found.group(1)) or None) if found and int(found.group(1)) >= 1 else None
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


def marker_index_of(messages):
    """首个以压缩 marker 开头的 user 消息（与 worker_step 同法，不限位置）。"""
    return next((index for index, message in enumerate(messages)
                 if message.get("role") == "user"
                 and message_text(message).strip().startswith(compact_receipt.MARKER_TEXT)), None)


def next_decision(raw, messages, pointer, script, env=None):
    session = ((raw.get("request") or {}).get("options") or {}).get("sessionId")
    if session != script.root_session:
        raise MockFault("session_mismatch", "Main request does not belong to the fixed root session")
    anchor_index, baseline, floor = None, None, 0
    if env is not None:
        marker_index = marker_index_of(messages)
        if marker_index is not None:
            anchor_index, anchor_ref = compact_receipt.own_anchor(messages, message_text, marker_index)
            baseline, anchor_index = compact_state.restore_anchor(env, script, anchor_ref, anchor_index)
            floor = anchor_index
            if pointer < floor:
                # 指针落在丢弃段＝先于任何引擎匹配跳至锚：idle 逐字重导锚回执
                # （解释器经 say 回环在锚位采纳）；被丢弃的旧回显/回执/user 噪声
                # 绝不被引擎逐条匹配采纳，也不驱动机、不触发协议故障。
                return ({"action": "text", "text": message_text(messages[floor]),
                         "verbatim": True, "jump_to": floor}, None,
                        trace_row("discard-prefix-jump", pointer, floor))
    boundaries = [i for i, m in enumerate(messages) if is_main_echo(m) and i >= floor]
    at_echo = pointer < len(messages) and messages[pointer].get("role") == "assistant"
    resume = (at_echo and is_main_echo(messages[pointer])
              and pointer + 1 < len(messages) and messages[pointer + 1].get("role") == "toolResult")
    walk = at_echo and not resume
    upto = pointer if resume else pointer - 1
    jump = None
    if resume:
        base = pointer + 1
        while base < len(messages) and messages[base].get("role") == "toolResult":
            base += 1
        following = [b for b in boundaries if b >= base]
        jump = following[0] if following else len(messages)
    consumed_bound, bound_receipts = replay_retained(script, raw, env, messages, floor, upto, baseline)
    if walk:
        decided = walk_target(script, messages, pointer, floor, consumed_bound, bound_receipts)
        if decided is not None:
            return decided[0], None, decided[1]
    boundary = pointer if walk else (jump if resume else len(messages))
    if resume:
        # jump 跨过的回执区间内可能夹压缩回显：它们对机器状态同样生效。
        for message in messages[pointer + 1:jump]:
            if message.get("role") == "assistant" and message_kind(message) == "compaction":
                script.compacted()
    script.entry_context["replay"] = walk
    timeline_before = set(script.stats["timeline"])
    consumed_before = len(script.consumed)
    pending = getattr(script, "compact_pending_decision", None)
    if pending is not None and pending.get("terminal"):
        # 已证完局（链上全部绑定回执消费完毕、机到 done）的终局决策：幂等重导
        # 同一终局文本——不发新工具、无副作用；原生 autoContinue/传输重试同文
        # 应答（cx16 0463 实证：终局在恢复侧派生后被丢弃，前沿 step 只会
        # resubmit_after_success，终局永远无法送达）。
        return pending, None, trace_row("restore-terminal", pointer, floor)
    if pending is not None and pending.get("id") in script.consumed:
        # 待发决策的回执已被保留 tail 重放消费：待发身份已过时，清掉后按正常
        # 前沿推进，绝不把已消费决策当成已发未覆盖去等待/活体检索。
        script.compact_pending_decision = pending = None
    if pending is not None:
        last = (build_payload(raw, boundary).get("last_tool_result") or {})
        if last.get("toolCallId") != pending["id"]:
            # 已交付未覆盖决策且本请求无其回执：先向本 lane 活体 OC 会话 API 做
            # 一次只读检索——唯一匹配 part 的真实输出经原机 expect 消费后产出下
            # 一决策；绝不重发 reserve、绝不凭 graph/collection 推导；检索不可用
            # ＝unavailable 观测回落诚实等待；未交付（零尾首发）仍走首发路径。
            return compact_inflight_wait.uncovered_reply(env, baseline, script, pending, raw,
                                                         pointer, boundary, jump, floor, upto, messages)
    decision = script.step(build_payload(raw, boundary))
    advanced = boundary == len(messages) and len(script.consumed) > consumed_before
    frontier_gates = [{"phase": phase, "gate": gate, "at_ns": script.stats["timeline"][gate],
                       "call_id": script.consumed[-1]}
                      for phase, gate in (("analysis", "analysis_final_gate_ns"),
                                          ("eqclass", "eqclass_final_gate_ns"))
                      if advanced and gate in script.stats["timeline"] and gate not in timeline_before]
    return decision, jump, {"case": "resume" if resume else "walk" if walk else "frontier",
                            "pointer": pointer, "boundary": boundary, "jump": jump,
                            "compact": floor > 0,
                            "compact_floor": floor,
                            "frontier_gates": frontier_gates,
                            "verified_call_ids": [messages[b].get("content", [{}])[0].get("id")
                                                  for b in request_boundaries(messages)
                                                  if floor <= b <= upto]}


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
        decision, jump, trace = next_decision(raw, messages, envelope["pointer"], script, env)
        if decision.get("jump_to") is not None:
            # 丢弃段指针跳：与 worker 同构——只跳指针＋idle 逐字重导锚回执，
            # 不落 trace、不落检查点（无新决策、无新进度）。
            print(json.dumps({"result": "idle", "values": {"idle_text": decision["text"]},
                              "pointer": decision["jump_to"]}, ensure_ascii=False))
            return
        for gate in trace.get("frontier_gates") or ():
            persist_main_gate(env["records"], gate["phase"], gate["at_ns"], gate["call_id"],
                              env["root_session"])
        trace_handler(env, ((raw.get("request") or {}).get("options") or {}).get("sessionId"),
                      compact_inflight_wait.handler_row(trace, decision, script.gate_verdict()))
        # 静息检查点在压缩模式内同样滚动追加：链式压缩（第二次切割）的基线来源。
        compact_state.write_rest_checkpoint(env, script, decision)
    except MockFault as fault:
        sys.stderr.write(f"main_step {fault.kind}: {fault}\n")
        raise SystemExit(3)
    if decision.get("verbatim"):
        print(json.dumps({"result": "idle", "values": {"idle_text": decision["text"]}}, ensure_ascii=False))
        return
    if decision.get("action") == "tool":
        if para is not None and decision.get("name") == "bash" and " reserve " in decision["arguments"].get("command", ""):
            decision["arguments"] = {**decision["arguments"], "command": decision["arguments"]["command"] + f" --para {para}"}
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
