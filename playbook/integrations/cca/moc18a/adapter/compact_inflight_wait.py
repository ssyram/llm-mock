"""跨切割在途决策的诚实等待：已交付宿主、回执未在模型可见信道落地的最小真相应答。

cx6 0013→0014/0015→0016 实证：宿主在工具调用已发出、真实回执已在宿主存储落地
（collection/main-messages.json 状态 completed、exit 0、registration.confirmed）后
连续切割——压缩后的 main 重问请求既无该调用的原生回显也无回执；后续 summary 渲
染按渲染预算截断（s7 回执的 "batches" 段永不闭合＝不可绑）。既有迟到回执路径
（cx5 0013 实证的原生保留形状）继续负责回执到达后的恰一次消费；本模块只补另一
侧：恢复侧重建出「已发未覆盖决策」（emitted 含其 id、绑定回执未覆盖）而本请求
既无其回显也无回执时，先经 opencode_tool_receipt 向本 lane 活体 OC 会话 API 做
一次只读检索（真实回执即原机 expect 消费推进）；检索不到再以确定性等待文本应
答——不重发副作用、不发明回执、不声称进度、不终局弃跑。等待行以 waiting_receipt
键落 handler-trace（不进已发决策序列）；连续 WAIT_LIMIT 个不同请求仍无回执＝
显式故障（点名缺失回执，不无限轮询；同请求重放不计数）。
"""
import json

from lane_context import request_boundaries

WAIT_LIMIT = 8


def _fault(kind, message):
    from cca_bench.suites.mock_results import MockFault
    return MockFault(kind, message)


def wait_text(call_id):
    return ("waiting for receipt of %s: delivered before the compaction cut, "
            "not visible in this request; not reissuing, not inventing progress" % call_id)


def delivered(entry, pending):
    """已发未覆盖判定：恢复基线的已发决策序列含该工具 id（已送达宿主，非首发布）。"""
    if not entry or pending is None or pending.get("action") != "tool":
        return False
    emitted = entry.get("emitted_decisions") or []
    return pending.get("id") in {item.get("id") for item in emitted if item.get("action") == "tool"}


def observe_transport(env, baseline, pending):
    """已发未覆盖形状的一次活体检索观测；未交付形状＝None（首发路径不检索）。

    检索不可用（旧 lane 无 ready.json/宿主未起）＝unavailable 观测（回落诚实等待，
    成因如实入 trace）；其余绑定/拒绝/不匹配类故障向上抛出（fail loudly）。"""
    if baseline is None or not delivered(baseline, pending):
        return None
    import opencode_tool_receipt
    from cca_bench.suites.mock_results import MockFault
    try:
        return opencode_tool_receipt.observe(env, pending)
    except MockFault as fault:
        if fault.kind != "compact_receipt_transport_unavailable":
            raise
        return {"kind": "unavailable", "detail": str(fault)}


def is_wait_echo(pending, message):
    """tail 里的等待回显是否恰为本等待决策的确定性重导（引擎回显采用核对用）。"""
    if not pending or message.get("role") != "assistant":
        return False
    content = message.get("content") or []
    if any(isinstance(block, dict) and block.get("type") == "toolCall" for block in content):
        return False
    from lane_context import message_text
    return message_text(message) == wait_text(pending.get("id"))


def _wait_rows(records_dir, root_session, call_id):
    path = records_dir / "handler-trace.jsonl"
    if not path.is_file():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            continue
        if row.get("session") == root_session and row.get("waiting_receipt") == call_id:
            rows.append(row)
    return rows


def uncovered_reply(env, baseline, script, pending, raw, pointer, boundary, jump, compact_floor, upto, messages):
    """已发未覆盖决策的本请求应答策略：活体检索→回执即原机推进；否则诚实等待；
    未交付形状（零尾首发）＝原样首发（restore-pending，非重发）。"""
    transport = observe_transport(env, baseline, pending)
    if transport is not None and transport.get("kind") == "receipt":
        import opencode_tool_receipt
        return opencode_tool_receipt.feed_and_advance(script, raw, boundary, transport,
                                                      pointer, jump, compact_floor, upto, messages)
    held = held_reply(env, baseline, script, pending, pointer, boundary, compact_floor, upto, messages, transport)
    if held is not None:
        return held
    # 待发决策尚无任何回执在 tail＝它从未送达宿主（首次发布，非重发）；
    # 已消费的绑定回执保证其前的非幂等决策不会被重发。
    return pending, jump, {"case": "restore-pending", "pointer": pointer, "boundary": boundary,
                           "jump": jump, "compact": compact_floor > 0, "compact_floor": compact_floor,
                           "frontier_gates": [],
                           "verified_call_ids": [messages[b].get("content", [{}])[0].get("id")
                                                 for b in request_boundaries(messages)
                                                 if compact_floor <= b <= upto]}


def wait_rows_distinct(rows):
    """等待行按请求形状去重：同一请求的引擎重放不计数（不把重放当进度）。"""
    return {(row.get("pointer"), row.get("boundary"), tuple(row.get("verified_call_ids") or []))
            for row in rows}


def held_reply(env, baseline, script, pending, pointer, boundary, compact_floor, upto, messages, transport=None):
    """已发未覆盖且本请求无其回执＝等待应答；(decision, trace) 或 None（非该形状）。

    绝不重发：已交付宿主的决策（如 reserve 副作用）重发即第二次副作用。基线不
    可用或决策未在已发序列（零尾首发布形状）时交回既有 restore-pending 路径。
    transport 记录本次活体检索观测（receipt/pending/unavailable/None）——等待行
    如实携带；连续 WAIT_LIMIT 个不同请求仍无回执＝显式故障（点名缺失回执，不无限
    轮询），且区分故障成因：全程检索不可用＝transport_unavailable，检索在场而无
    completed 回执＝untransported。同请求重放不计数（等待上限度量真实新请求）。
    """
    if baseline is None or not delivered(baseline, pending):
        return None
    call_id = pending["id"]
    rows = _wait_rows(env["records"], env["root_session"], call_id)
    if len(wait_rows_distinct(rows)) >= WAIT_LIMIT:
        unavailable = all((row.get("receipt_transport") or {}).get("kind") == "unavailable" for row in rows)
        kind = "compact_receipt_transport_unavailable" if unavailable else "compact_receipt_untransported"
        detail = ("live transport unavailable on every wait" if unavailable
                  else "no completed receipt observed on the live session store")
        raise _fault(kind,
                     "receipt of %r not retrieved across %d distinct post-cut requests (%s); refusing "
                     "to advance, reissue, or invent progress" % (call_id, WAIT_LIMIT, detail))
    return ({"action": "text", "text": wait_text(call_id), "terminal": False, "wait_receipt": call_id},
            None,
            {"case": "wait-receipt", "pointer": pointer, "boundary": boundary, "jump": None,
             "compact": compact_floor > 0, "compact_floor": compact_floor, "frontier_gates": [],
             "receipt_transport": ({"kind": transport.get("kind"), "detail": transport.get("detail")}
                                   if isinstance(transport, dict) else None),
             "verified_call_ids": [messages[b].get("content", [{}])[0].get("id")
                                   for b in request_boundaries(messages) if compact_floor <= b <= upto]})


def handler_row(trace, decision, verdict):
    """handler-trace 行：等待决策只记 waiting_receipt（不进已发序列），其余照旧。
    活体检索观测（receipt_via/receipt_transport）随行落盘：回执来自宿主侧旁路
    观测，不在模型可见 transcript 内，如实标注而非冒充渲染结果。"""
    row = {"gate_verdict": verdict, **trace}
    if decision.get("wait_receipt"):
        row["waiting_receipt"] = decision["wait_receipt"]
    else:
        row["decision"] = {"action": decision.get("action"), "id": decision.get("id"),
                           "name": decision.get("name")}
    return row
