"""Worker 车道恢复/续行职责模块（worker_step 的锚后重放与前沿决策选择）。

丢弃前缀段（用户裁决的结构法则，与 main 同法）：marker 用户消息声明压缩
形状；marker 与锚之间的一切（旧原生回显/旧回执/user 噪声/畸形近似回执文本）
＝显式丢弃段——不解析、不匹配、不绑定、不触发协议故障。锚＝其后首条恰为
结构化 own 回执 JSON 的 assistant 回显（compact_receipt.own_anchor 唯一
形状权威）；锚引用仍须验证本 worker 命名空间/session/spec/adapter（外链/
未知/篡改＝fail closed，绝不改试后候选）。恢复＝把锚条目已验证回执经原簿
真实消费重建进度（重建由 worker_registry.replay_receipts 完成）。

锚后保留尾重放：绑定回显按回执指纹核对即跳过；恢复位待发决策回显与等待
回显只核对、不驱动机；其余经冻结簿重放并逐字核对。前沿决策：walk 旧回显
逐字重构；恢复位即前沿＝首发（绝不重步进）；已发未覆盖＝活体只读检索或
诚实等待；其余＝正常前沿步进。
"""
import json

import compact_inflight_wait
import compact_receipt
import worker_registry
from lane_context import build_payload, decision_matches, message_text


def _fault(kind, message):
    from cca_bench.suites.mock_results import MockFault
    return MockFault(kind, message)


def compact_ref(message):
    """压缩摘要回显（compact-progress 回执文本）→ 其不透明引用；非该形状＝None。"""
    text = message_text(message)
    if '"compact-progress"' not in text:
        return None
    return compact_receipt.parse_receipt(text)


def discard_floor(env, messages, bound):
    """marker→锚丢弃前缀段解析：返回 (锚下标, 已验证锚条目)；无 marker＝(0, None)。

    无注册 worker 身份而携带压缩回执＝显式故障（fail closed）。
    """
    marker_index = next((index for index, message in enumerate(messages)
                         if message.get("role") == "user"
                         and message_text(message).strip().startswith(compact_receipt.MARKER_TEXT)), None)
    if marker_index is None:
        return 0, None
    if bound is None:
        raise _fault("worker_identity_unknown",
                     "compaction echo without a registered worker identity")
    anchor_index, anchor_ref = compact_receipt.own_anchor(messages, message_text, marker_index)
    base = worker_registry.verify_ref(env, bound, anchor_ref)
    return anchor_index, base


def replay_suffix(workers, tag, session, raw, messages, boundaries, floor, upto,
                  bound, covered, restore_decision, restore_pending):
    """重放锚后保留尾回显（floor < boundary <= upto）并逐字核对；返回是否真实步进。

    压缩回显不驱动机；锚后回显仍须解析进本 worker 命名空间（外链/未知＝阻塞）。
    """
    suffix_stepped = False
    for boundary in [b for b in boundaries if floor < b <= upto]:
        ref = compact_ref(messages[boundary])
        if ref is not None:
            worker_registry.verify_ref(env, bound, ref)
            continue
        echo_call = next((b for b in messages[boundary].get("content") or []
                          if isinstance(b, dict) and b.get("type") == "toolCall"), None)
        if echo_call is None and message_text(messages[boundary]).startswith("waiting for receipt of "):
            continue
        if echo_call is not None and echo_call.get("id") in covered:
            # 已绑回执的旧回显（摘要后仍可能保留）：指纹核对后跳过，绝不重消费。
            held = covered[echo_call["id"]]
            if echo_call.get("name") != held.get("tool") or echo_call.get("arguments") != held.get("arguments"):
                raise _fault("compact_history_drift",
                             "retained echo %r does not match the bound receipt"
                             % echo_call.get("id"))
            continue
        if echo_call is not None and restore_pending \
                and echo_call.get("id") == restore_decision.get("id"):
            # 恢复位 pending 决策的真实投递回显：逐字核对即可，回执由前沿消费。
            if not decision_matches(restore_decision, messages[boundary]):
                raise _fault("replay_drift", "pending echo %r diverges from the restored decision"
                             % echo_call.get("id"))
            continue
        payload = build_payload(raw, boundary)
        payload["tag"] = tag
        decision = workers.step(payload, tag)
        suffix_stepped = True
        if not decision_matches(decision, messages[boundary]):
            raise _fault("replay_drift", "replayed %r but transcript has %r"
                         % (decision.get("id"),
                            json.dumps(messages[boundary].get("content"), ensure_ascii=False)[:300]))
    return suffix_stepped


def walk_compaction_echo(env, bound, messages, pointer):
    """walk 目标是压缩回显＝宿主重发该回显：校验引用后返回锚回执文本供 idle
    逐字重导（与 main 车道同构：解释器经 say 回环采纳），不驱动机、不产出新
    决策；非压缩回显＝None。"""
    ref = compact_ref(messages[pointer])
    if ref is None:
        return None
    worker_registry.verify_ref(env, bound, ref)
    return message_text(messages[pointer])


def frontier_decision(workers, tag, env, session, messages, pointer, boundary, payload,
                      walk, floor, suffix_stepped, covered, restore_decision, restore_pending, state):
    """锚后前沿决策选择：返回 (decision, receipt_via, waiting)。

    walk 目标是已绑回执/恢复位待发决策的旧回显＝指纹核对后逐字重构（引擎采
    纳，不驱动机、不重发副作用）；恢复位即前沿＝首发（绝不重步进；锚后无新
    史请求≠重发）；已发未覆盖＝活体 OC 只读检索：completed 真实回执→原机消费
    推进，pending/不可用＝诚实等待（绝不重发副作用、不发明回执；连续
    WAIT_LIMIT 个不同请求＝显式故障）；其余＝正常前沿步进。
    """
    target = next((b for b in (messages[pointer].get("content") or [] if walk else [])
                   if isinstance(b, dict) and b.get("type") == "toolCall"), None)
    receipt_via = waiting = None
    if walk and target is not None and target.get("id") in covered:
        held = covered[target["id"]]
        if target.get("name") != held.get("tool") or target.get("arguments") != held.get("arguments"):
            raise _fault("compact_history_drift",
                         "walk echo %r does not match the bound receipt" % target.get("id"))
        decision = {"action": "tool", "id": held["call_id"], "name": held["tool"],
                    "arguments": held["arguments"]}
    elif walk and target is not None and restore_pending \
            and target.get("id") == restore_decision.get("id"):
        if not decision_matches(restore_decision, messages[pointer]):
            raise _fault("replay_drift", "walk echo diverges from the restored pending decision")
        decision = restore_decision
    elif floor and not suffix_stepped and not walk:
        trailing = (payload.get("last_tool_result") or {}).get("toolCallId")
        last_issued = state.issued[-1] if state and state.issued else None
        if not restore_pending:
            # 恢复位即前沿：链尾已验证进度之后的下一真实决策＝首发，绝不重步进
            # （锚后无新史请求≠重发；旧尾随回执不得当新证据重复消费）。
            decision = restore_decision
        elif trailing == last_issued:
            decision = workers.step(payload, tag)
        else:
            # 已发未覆盖（已送达宿主、回执不在本请求）：先活体 OC 只读检索；
            # completed 真实回执→原机消费推进；pending/不可用＝诚实等待，
            # 绝不重发副作用、不发明回执；连续 WAIT_LIMIT 个不同请求＝显式故障。
            import opencode_tool_receipt
            from cca_bench.suites.mock_results import MockFault
            try:
                transport = opencode_tool_receipt.observe_worker(env, restore_decision, session)
            except MockFault as fault:
                if fault.kind not in ("compact_receipt_transport_unavailable",
                                      "compact_receipt_transport_missing"):
                    raise
                transport = None
            if transport is not None and transport.get("kind") == "receipt" \
                    and not transport["receipt"].get("isError"):
                decision = workers.step({"tag": tag, "session_id": session,
                                         "last_tool_result": transport["receipt"]}, tag)
                receipt_via = transport["provenance"]
                if state is not None:
                    state.record.pop("pending_wait_ns", None)
            else:
                rows = compact_inflight_wait._wait_rows(env["records"], session,
                                                        restore_decision.get("id"))
                if len(compact_inflight_wait.wait_rows_distinct(rows)) >= compact_inflight_wait.WAIT_LIMIT:
                    raise _fault("compact_receipt_untransported",
                                 "receipt of %r not retrieved across %d distinct post-cut requests"
                                 % (restore_decision.get("id"), compact_inflight_wait.WAIT_LIMIT))
                waiting = restore_decision.get("id")
                decision = {"action": "text", "wait_receipt": waiting}
    else:
        decision = workers.step(payload, tag)
    return decision, receipt_via, waiting
