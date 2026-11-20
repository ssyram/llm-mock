"""Main 车道保留尾重放与 walk 目标解析（main_step 的重放职责模块）。

锚后保留尾逐条经冻结机核对：绑定回显按回执指纹核对即跳过（绝不重步进、
绝不向后索要旧结果）；恢复位待发决策与等待回显只核对、不驱动机；其余回显
经 script.step 重放并逐字核对。walk（P 处回显且其后无回执＝本请求即该回显
的重发）目标优先按已绑回执/恢复位待发决策逐字重构，非主回显按转录原文重导。
锚前＝显式丢弃段，由调用方先跳锚，本模块只处理锚后保留尾。
"""
import json
import re

import compact_inflight_wait
import compact_machine
import compact_receipt
import compact_state
from lane_context import build_payload, decision_matches, message_text


def _fault(kind, message):
    from cca_bench.suites.mock_results import MockFault
    return MockFault(kind, message)


def message_kind(message):
    content = message.get("content") or []
    if any(isinstance(b, dict) and b.get("type") == "toolCall" and b.get("name") == "StructuredOutput"
           for b in content):
        return "gate"
    if any(isinstance(b, dict) and b.get("type") == "text"
           and ("continue from " in b.get("text", "") or '"compact-progress"' in b.get("text", ""))
           for b in content):
        return "compaction"
    return "main"


def is_main_echo(message):
    return message.get("role") == "assistant" and bool(message.get("content")) \
        and message_kind(message) == "main"


def pending_echo(decision, message):
    """回显是否恰为恢复侧重建出的待发决策（从未送达宿主的那一枚）的再投递。"""
    if not decision or decision.get("action") != "tool":
        return False
    content = message.get("content") or []
    call = next((b for b in content if isinstance(b, dict) and b.get("type") == "toolCall"), None)
    return decision_matches(decision, message) if call is not None else False


def terminal_echo(decision, message):
    """tail 里的终局回显是否恰为恢复位终局决策（已证完局）的确定性重导。"""
    return (bool(decision) and decision.get("terminal") and message.get("role") == "assistant"
            and not any(isinstance(b, dict) and b.get("type") == "toolCall"
                        for b in message.get("content") or [])
            and message_text(message) == decision.get("text"))


def trace_row(case, pointer, floor):
    return {"case": case, "pointer": pointer, "boundary": pointer, "jump": None,
            "compact": floor > 0, "compact_floor": floor, "frontier_gates": [],
            "verified_call_ids": []}


def rest_fingerprints(env, baseline):
    """基线已覆盖的静息点文本指纹（own 链权威）：条目 machine.serial ≤ 基线
    serial ＝基线状态已知该静息决策（渲染文本只按链指纹核对，不作状态来源）。"""
    if baseline is None:
        return set()
    serial = (baseline.get("machine") or {}).get("serial")
    return {entry["rest"]["waiting_text_sha256"] for entry in compact_state.verified_entries(env)
            if (entry.get("machine") or {}).get("serial") <= serial}


_SERIAL_OF_CALL = re.compile(r"\.s(\d+)$")


def newer_rest_binding(env, baseline, text, seen_serial):
    """同文本静息回显对更新 own 链条目的绑定（r256c 末 worker 回程丢失实证）。

    静息文本可重复（active=1 在基线前后各出现一次）：仅按 ≤基线指纹跳过会把
    基线后的同文本静息回显误当基线前噪声跳过，其后真实回执/回程不再被逐步
    重放消费＝重建静默欠推导（无 drift 故障、无 faults 退出）。绑定条件全在
    own 链与保留尾自身：条目经全链身份校验、serial 严格晚于基线且 ≤ 尾内已
    见回显 serial（尾自身证实该静息前沿已发生）、静息指纹恰等于回显 canon。
    命中＝机在该静息点自身的已验证真值（与锚同源同权），装配取代其后的逐条
    重推导；未命中＝维持原路径（跳过或逐步重放）。锚语义与丢弃段法则不变。"""
    if baseline is None or seen_serial is None:
        return None
    baseline_serial = (baseline.get("machine") or {}).get("serial") or 0
    digest = compact_state.canon(text)
    best = None
    for entry in compact_state.verified_entries(env):
        machine = entry.get("machine") or {}
        serial = machine.get("serial") or 0
        if entry.get("genesis") or serial <= baseline_serial or serial > seen_serial:
            continue
        if (entry.get("rest") or {}).get("waiting_text_sha256") == digest:
            if best is None or serial > (best.get("machine") or {}).get("serial") or 0:
                best = entry
    return best


def echo_covered(script, message, consumed_bound, fingerprints):
    """锚后回显是否已被恢复基线消费：已消费调用/待发·等待·终局重导/链内静息
    文本＝跳过（绝不重步进、无副作用）；未覆盖＝须 step 核对的真实前沿。"""
    pending = getattr(script, "compact_pending_decision", None)
    if pending is not None and (pending_echo(pending, message)
                                or compact_inflight_wait.is_wait_echo(pending, message)
                                or terminal_echo(pending, message)):
        return True
    call = next((b for b in message.get("content") or []
                 if isinstance(b, dict) and b.get("type") == "toolCall"), None)
    if call is not None:
        return call.get("id") in (consumed_bound or set())
    if message_kind(message) != "main":
        return True
    return compact_state.canon(message_text(message)) in fingerprints


def replay_retained(script, raw, env, messages, floor, upto, baseline):
    """重放锚后保留尾回显并逐字核对；返回（已消费集合, 绑定回执表）供 walk 判定。

    锚前（index < floor）＝显式丢弃段：不解析、不匹配、不绑定、不触发协议故障。
    """
    consumed_bound = set(script.consumed) if baseline is not None else None
    bound_receipts = {item["call_id"]: item for item in ((baseline or {}).get("receipts") or [])}
    seen_serial = (baseline.get("machine") or {}).get("serial") if baseline is not None else None
    for index, message in enumerate(messages):
        if index > upto or message.get("role") != "assistant" or index < floor:
            continue
        call = next((b for b in message.get("content") or []
                     if isinstance(b, dict) and b.get("type") == "toolCall"), None)
        if call is not None and call.get("id"):
            found = _SERIAL_OF_CALL.search(str(call.get("id")))
            if found and seen_serial is not None:
                seen_serial = max(seen_serial, int(found.group(1)))
        if message_kind(message) == "compaction":
            ref = compact_receipt.receipt_shaped(message, message_text)
            if ref is not None:
                compact_state.verify_ref(env, ref)  # 锚后回执回显须属本 root 链
            script.compacted()
            continue
        if message_kind(message) == "gate":
            continue
        covered = consumed_bound is not None and call is not None and call.get("id") in consumed_bound
        if covered:
            held = bound_receipts.get(call.get("id"))
            if held is not None and (call.get("name") != held.get("tool")
                                     or call.get("arguments") != held.get("arguments")):
                raise _fault("compact_history_drift",
                             "retained echo %r does not match the bound receipt" % call.get("id"))
            continue  # 基线已消费的回显：绑定背书跳过，绝不重步进/向后要旧结果
        if pending_echo(getattr(script, "compact_pending_decision", None), message):
            continue  # 恢复位待发决策的真实投递回显：核对即可，回执由前沿消费
        if compact_inflight_wait.is_wait_echo(getattr(script, "compact_pending_decision", None), message):
            continue  # 等待回显＝本 lane 等待决策的确定性重导，不驱动机
        if terminal_echo(getattr(script, "compact_pending_decision", None), message):
            continue  # 终局回显＝已证完局终局决策的确定性重导，不驱动机
        if baseline is not None and message_kind(message) == "main":
            text = message_text(message)
            if compact_state.canon(text) in rest_fingerprints(env, baseline):
                bound = newer_rest_binding(env, baseline, text, seen_serial)
                if bound is not None:
                    compact_machine.apply_machine(script, bound["machine"])
                    consumed_bound = set(script.consumed)
                    seen_serial = (bound.get("machine") or {}).get("serial")
                    continue
                continue  # 基线前静息回显（OC 保留尾可早于锚检查点）：链指纹核对即跳过
        script.entry_context["replay"] = True
        decision = script.step(build_payload(raw, index))
        if not decision_matches(decision, message):
            raise _fault("replay_drift", "replayed %r but transcript has %r"
                         % ({k: decision.get(k) for k in ("action", "id", "name")},
                            json.dumps(message.get("content"), ensure_ascii=False)[:300]))
    return consumed_bound, bound_receipts


def walk_target(script, messages, pointer, floor, consumed_bound, bound_receipts):
    """walk 重发目标的解析：(decision, trace) 或 None＝非重导形状，按前沿正常步进。

    已绑回执的旧回显＝指纹一致即逐字重构（引擎采纳，不驱动机、不重发副作用）；
    恢复位待发决策＝逐字核对后原样重发；非主回显＝按转录文本原文重导。
    """
    target = next((b for b in messages[pointer].get("content") or []
                   if isinstance(b, dict) and b.get("type") == "toolCall"), None)
    pending = getattr(script, "compact_pending_decision", None)
    if target is not None and target.get("id") in (consumed_bound or set()):
        held = bound_receipts.get(target.get("id"))
        if held is None or target.get("name") != held.get("tool") \
                or target.get("arguments") != held.get("arguments"):
            raise _fault("compact_history_drift",
                         "walk echo %r does not match the bound receipt" % target.get("id"))
        return {"action": "tool", "id": held["call_id"], "name": held["tool"],
                "arguments": held["arguments"]}, trace_row("walk-bound-echo", pointer, floor)
    if target is not None and pending is not None and target.get("id") == pending.get("id"):
        if not decision_matches(pending, messages[pointer]):
            raise _fault("replay_drift", "walk echo diverges from the restored pending decision")
        return pending, trace_row("walk-pending-echo", pointer, floor)
    if not is_main_echo(messages[pointer]):
        text = "\n".join(b.get("text", "") for b in messages[pointer].get("content") or []
                         if isinstance(b, dict) and b.get("type") == "text")
        return {"action": "text", "text": text, "verbatim": True}, trace_row(
            "walk-verbatim", pointer, floor)
    if getattr(script, "done", False) and not any(
            isinstance(b, dict) and b.get("type") == "toolCall"
            for b in messages[pointer].get("content") or []):
        # 已证完局后的纯文本主回显（终局文本）walk＝逐字重导：机已终局，绝不
        # 再驱动 step（resubmit_after_success 对真重发保持，只是不再吞掉终局）。
        text = "\n".join(b.get("text", "") for b in messages[pointer].get("content") or []
                         if isinstance(b, dict) and b.get("type") == "text")
        return {"action": "text", "text": text, "verbatim": True}, trace_row(
            "walk-terminal-echo", pointer, floor)
    return None


def tail_advance(script, raw, env, messages, pointer, floor, baseline, consumed_bound, bound_receipts):
    """保留尾中段回显（其后仍有真实消息＝非裸重发，r256c row921 形状）：OC
    保留尾可始于早于锚检查点的静息点。非主/待发/可指纹重构回绑回显按
    walk_target 逐字重导；其余已消费回显按覆盖性跳至首个未覆盖边界，以该
    边界真实决策应答（解释器在该边界对实际回显严格核对）；全已消费＝前沿
    决策＋跳至末尾。未覆盖主回显返回 None＝由 boundary 流在该回显处 step
    核对后原样应答（与裸重发同径，但绝不吞掉其后真实消息）。"""
    message = messages[pointer]
    call = next((b for b in message.get("content") or []
                 if isinstance(b, dict) and b.get("type") == "toolCall"), None)
    unbound_covered = (call is not None and call.get("id") in (consumed_bound or set())
                       and call.get("id") not in bound_receipts)
    if not unbound_covered:
        decided = walk_target(script, messages, pointer, floor, consumed_bound, bound_receipts)
        if decided is not None:
            return decided[0], None, decided[1]
        if not echo_covered(script, message, consumed_bound, rest_fingerprints(env, baseline)):
            return None
    for index in range(pointer + 1, len(messages)):
        ahead = messages[index]
        if ahead.get("role") != "assistant" or index < floor:
            continue
        if message_kind(ahead) == "compaction":
            ref = compact_receipt.receipt_shaped(ahead, message_text)
            if ref is not None:
                compact_state.verify_ref(env, ref)
            script.compacted()
            continue
        if echo_covered(script, ahead, consumed_bound, rest_fingerprints(env, baseline)):
            continue
        return script.step(build_payload(raw, index)), index, trace_row("tail-advance", index, floor)
    boundary = len(messages)
    return script.step(build_payload(raw, boundary)), boundary, trace_row("tail-advance", boundary, floor)
