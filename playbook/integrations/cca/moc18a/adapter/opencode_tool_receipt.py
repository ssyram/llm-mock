"""在途切割决策的真实回执检索：只读访问本 lane 活体 OC 会话 API（loopback）。

真实证据（cx6 lane ready.json['server']='http://127.0.0.1:50760'、['session']；
compact_launch.py 既有工具即 GET /session/<session>/message；capture
main-messages.json 的原生 tool part 形状＝callID/tool/state{status,input,output,
metadata{output,exit,truncated}}；a688 main.s7 completed exit0 仅作格式参照）。
已发未覆盖决策（genesis emitted 序列含其 id、绑定回执未覆盖）而本请求无其回显
也无回执时，宿主侧该调用的真实结果已（或即将）落在活体会话存储：本模块做一次
有界只读 GET，按 pending call_id 取唯一原生 tool part，逐字核对 name 与 exact
input、属主会话，status completed 且 exit 0 才算成功回执；pending/running＝尚未
完成（等待，不推进）；error/非零 exit＝如实错误回执（交原机 expect 拒绝）。
绝不从 graph/SQL/门状态/collection/archive 推导，绝不重发 reserve，绝不发明
输出。安全边界：只认 ready.json 的 server+session（会话必须等于本 lane
root_session），仅 http＋loopback 主机＋显式端口、无凭据/查询/片段、拒绝重定向
与外联；一次请求、固定超时、零重试；provenance 只记 host:port/会话/件 id/
摘要，不记任何令牌（本通道本无鉴权）。诚实性：回执观测自活体 OC 会话 API 旁
路，不在模型可见 transcript 里——provenance 如实标注 model_visible=False。
"""
import hashlib
import json
import urllib.error
import urllib.request
from urllib.parse import quote, urlsplit

REQUEST_TIMEOUT_S = 5.0
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
PENDING_STATUSES = frozenset({"pending", "running"})


def _fault(kind, message):
    from cca_bench.suites.mock_results import MockFault
    return MockFault(kind, message)


def lane_endpoint(root):
    """CURRENT lane ready.json → (host, port, ready_session)：只做传输安全形状
    校验（loopback http、显式端口、无凭据/查询/片段/路径），不绑定任何会话。"""
    path = root / "ready.json"
    if not path.is_file():
        raise _fault("compact_receipt_transport_unavailable",
                     "lane ready.json is absent: no live OC session API to read")
    try:
        ready = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise _fault("compact_receipt_transport_malformed", "lane ready.json is not readable JSON")
    if not isinstance(ready, dict) or not isinstance(ready.get("server"), str) or not ready["server"]:
        raise _fault("compact_receipt_transport_unavailable",
                     "lane ready.json carries no live server entry")
    parts = urlsplit(ready["server"])
    if (parts.scheme != "http" or parts.username or parts.password or parts.query or parts.fragment
            or parts.path not in ("", "/") or parts.hostname not in LOOPBACK_HOSTS or parts.port is None):
        raise _fault("compact_receipt_transport_refused",
                     "ready.json server is not a plain loopback http host:port endpoint "
                     "(external hosts, credentials, and redirectable URLs are refused)")
    return parts.hostname, parts.port, ready.get("session")


def lane_server(root, root_session):
    """CURRENT lane ready.json → (host, port)；会话必须绑定为本 lane root session。"""
    host, port, ready_session = lane_endpoint(root)
    if ready_session != root_session:
        raise _fault("compact_receipt_transport_binding",
                     "ready.json session %r is not this lane's root session (refusing foreign binding)"
                     % (ready_session,))
    return host, port


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise _fault("compact_receipt_transport_refused",
                     "live session API answered a redirect; redirects are never followed")


def _get_messages(url):
    """单次有界 GET（拒绝重定向、固定超时、零重试）→ 消息表（必须为 list）。"""
    request = urllib.request.Request(url, method="GET", headers={"Accept": "application/json"})
    try:
        with urllib.request.build_opener(_NoRedirect()).open(request, timeout=REQUEST_TIMEOUT_S) as response:
            status, body = getattr(response, "status", response.getcode()), response.read()
    except urllib.error.HTTPError as error:
        raise _fault("compact_receipt_transport_unavailable",
                     "live session API answered HTTP %s for this session" % error.code)
    except (urllib.error.URLError, OSError, ValueError):
        raise _fault("compact_receipt_transport_unavailable",
                     "live session API unreachable on the lane loopback endpoint")
    if status != 200:
        raise _fault("compact_receipt_transport_unavailable",
                     "live session API answered status %r" % (status,))
    try:
        messages = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise _fault("compact_receipt_transport_malformed", "live session payload is not valid JSON")
    if not isinstance(messages, list):
        raise _fault("compact_receipt_transport_malformed", "live session payload is not a message list")
    return messages


def fetch_messages(root, root_session):
    """单次有界 GET /session/<root_session>/message；零重试、拒绝重定向。"""
    host, port = lane_server(root, root_session)
    url = "http://%s:%d/session/%s/message" % (host, port, quote(root_session, safe=""))
    return _get_messages(url), "%s:%d" % (host, port)


def _provenance(root_session, endpoint, message, part, status, receipt=None):
    provenance = {"source": "opencode-session-api", "transport": "loopback-http-get", "server": endpoint,
                  "session": root_session, "call_id": part.get("callID"),
                  "message_id": (message.get("info") or {}).get("id"), "part_id": part.get("id"),
                  "status": status, "model_visible": False,
                  "note": "observed on the live OC session API sidechannel; not part of the model-visible transcript"}
    if receipt is not None:
        provenance["output_sha256"] = hashlib.sha256(receipt["text"].encode()).hexdigest()
    return provenance


def observed_completion(state):
    """OC 原生 tool part 的权威完成时刻：state.time.end（毫秒，宿主事件钟）。

    cx16 实测形状（main-messages.json 原生 tool part）：state.time={"start":ms,
    "end":ms}。换算显式 ms→ns；缺失/非数值/非正＝无可信宿主时刻→None（回执
    仍可绑定，但该调用的时序证据诚实缺位，绝不以观测时刻冒充完成时刻）。
    """
    stamp = state.get("time") if isinstance(state.get("time"), dict) else None
    stamp = stamp.get("end") if stamp is not None else None
    if isinstance(stamp, bool) or not isinstance(stamp, (int, float)) or stamp <= 0:
        return None
    return {"completed_ns": int(round(stamp)) * 1_000_000, "source": "oc-tool-part.state.time.end"}


def match_tool_part(pending, messages, root_session, endpoint):
    """唯一原生 tool part 匹配 pending（call_id＋tool 名＋exact input＋属主会话）。

    返回 {"kind": "receipt"|"pending", ...}；缺失/重复/错名/错参/异主/畸形＝
    显式 MockFault。error/非零 exit＝isError 回执（由原机 expect 如实拒绝）。
    """
    call_id = pending.get("id")
    found = []
    for message in messages:
        if not isinstance(message, dict):
            raise _fault("compact_receipt_transport_malformed", "live session entry is not an object")
        parts = message.get("parts")
        if parts is None:
            parts = []
        if not isinstance(parts, list):
            raise _fault("compact_receipt_transport_malformed", "live session entry carries non-list parts")
        for part in parts:
            if isinstance(part, dict) and part.get("type") == "tool" and part.get("callID") == call_id:
                found.append((message, part))
    if not found:
        raise _fault("compact_receipt_transport_missing",
                     "live session store carries no tool part for emitted decision %r "
                     "(baseline says it was delivered; store disagrees)" % (call_id,))
    if len(found) > 1:
        raise _fault("compact_receipt_transport_duplicate",
                     "live session store carries %d tool parts for %r (exactly one required)"
                     % (len(found), call_id))
    message, part = found[0]
    for owner in (message.get("info") or {}, part):
        session = owner.get("sessionID")
        if session is not None and session != root_session:
            raise _fault("compact_receipt_transport_binding",
                         "tool part for %r is owned by foreign session %r" % (call_id, session))
    if part.get("tool") != pending.get("name"):
        raise _fault("compact_receipt_transport_mismatch",
                     "live tool part for %r names tool %r, the emitted decision says %r"
                     % (call_id, part.get("tool"), pending.get("name")))
    state = part.get("state")
    if not isinstance(state, dict) or not isinstance(state.get("input"), dict):
        raise _fault("compact_receipt_transport_malformed",
                     "live tool part %r carries no object state.input" % (call_id,))
    if "arguments" in pending and state.get("input") != pending["arguments"]:
        raise _fault("compact_receipt_transport_mismatch",
                     "live tool part %r input differs from the emitted decision's exact arguments" % (call_id,))
    status = state.get("status")
    if status in PENDING_STATUSES:
        return {"kind": "pending",
                "provenance": _provenance(root_session, endpoint, message, part, status)}
    if status not in ("completed", "error"):
        raise _fault("compact_receipt_transport_malformed",
                     "live tool part %r carries unknown status %r" % (call_id, status))
    metadata = state.get("metadata")
    if isinstance(metadata, dict) and metadata.get("truncated") is True:
        raise _fault("compact_receipt_transport_malformed",
                     "live output for %r is marked truncated; partial output is never bound" % (call_id,))
    exit_code = metadata.get("exit") if isinstance(metadata, dict) else None
    failed = status == "error" or exit_code not in (None, 0)
    text = state.get("output")
    if not isinstance(text, str):
        raise _fault("compact_receipt_transport_malformed",
                     "live tool part %r carries non-text output" % (call_id,))
    error_text = state.get("error") if failed and isinstance(state.get("error"), str) else None
    receipt = {"toolCallId": call_id, "toolName": part.get("tool"), "isError": failed,
               "text": error_text if error_text is not None else text}
    return {"kind": "receipt", "receipt": receipt, "arguments": state.get("input"),
            "observed": observed_completion(state),
            "provenance": _provenance(root_session, endpoint, message, part, status, receipt)}


def observe(env, pending):
    """一次完整观测：取活体消息表并匹配 pending 决策；不推进、不重发、不发明。"""
    messages, endpoint = fetch_messages(env["root"], env["root_session"])
    return match_tool_part(pending, messages, env["root_session"], endpoint)


def observe_worker(env, pending, worker_session):
    """worker lane 活体检索：同一 CURRENT lane 端点（ready.json 仍须绑定本 lane
    root 会话），GET 属主 worker 会话（持久绑定身份，非文本推断）；pending 无
    arguments 时以活件 input 为实际实参（绑定侧重放时再严格核对）。"""
    host, port = lane_server(env["root"], env["root_session"])
    url = "http://%s:%d/session/%s/message" % (host, port, quote(worker_session, safe=""))
    return match_tool_part(pending, _get_messages(url), worker_session, "%s:%d" % (host, port))


def payload_with_receipt(raw, boundary, receipt):
    """把真实回执按原生保留形状（回执在末尾触发前）合成进 transcript 视图，
    再走原 build_payload 派生——原机 expect 消费的就是这份载荷。"""
    from lane_context import build_payload
    context = (raw.get("request") or {}).get("context") or {}
    messages = list(context.get("messages") or [])[:boundary]
    result = {"role": "toolResult", "toolCallId": receipt["toolCallId"], "toolName": receipt["toolName"],
              "isError": bool(receipt.get("isError")), "content": [{"type": "text", "text": receipt["text"]}]}
    index = len(messages) - 1 if messages and messages[-1].get("role") != "assistant" else len(messages)
    messages.insert(index, result)
    patched = {**raw, "request": {**raw.get("request", {}), "context": {**context, "messages": messages}}}
    return build_payload(patched, len(messages))


def feed_and_advance(script, raw, boundary, transport, pointer, jump, compact_floor, upto, messages):
    """检索到的真实回执交原机 expect 消费，产出下一决策与带来源标注的 trace。"""
    from lane_context import request_boundaries
    decision = script.step(payload_with_receipt(raw, boundary, transport["receipt"]))
    script.compact_pending_decision = None
    return decision, jump, {"case": "live-receipt-advance", "pointer": pointer, "boundary": boundary,
                            "jump": jump, "compact": compact_floor > 0, "compact_floor": compact_floor,
                            "frontier_gates": [],
                            "verified_call_ids": [messages[b].get("content", [{}])[0].get("id")
                                                   for b in request_boundaries(messages)
                                                   if compact_floor <= b <= upto],
                            "receipt_via": transport["provenance"]}
