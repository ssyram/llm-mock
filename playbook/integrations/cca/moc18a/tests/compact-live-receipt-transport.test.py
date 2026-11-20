#!/usr/bin/env python3
"""cx6 0016 活体检索传输回归：opencode_tool_receipt 客户端＋全 mount 适配器路径。

本测试的本地 HTTP 服务是【显式合成的适配器协议证据】——它只证明本适配器与
"/session/<session>/message 消息表形状"的协议交互，不代表原生 OC 行为（原生
行为由 a688 真机验证负责；本测试绝不连接停用归档 lane、不跑真实原生实验）。
服务端载荷形状源自 sanitized 捕获（cx6 main-messages.json READ ONLY 证据：
info{sessionID,role}/parts[{type:tool,callID,tool,state{status,input,output,
metadata{output,exit,truncated},time}}]；a688 main.s7 completed exit0 仅作格式
参照），值全部换成 fixture 工作区合成物。

证明：
- 客户端：ready.json 绑定（会话/loopback/拒绝外联与重定向/缺文件=unavailable）；
  唯一 part 匹配（call_id＋tool 名＋exact input＋属主会话）；completed+exit0→
  真实回执；pending/running→不推进；缺失/重复/错名/错参/异主/未知状态/截断＝
  fail loudly；error/非零 exit→isError 回执（原机 expect 拒绝）。
- 适配器（exact0016 形状）：已发未覆盖 main.s7 经活体检索得真实输出→原机
  expect 消费→恰产出 main.s8 agent 派发一次（与 cold oracle 逐字节一致）；
  同请求幂等、无 reserve 重发、链不增；wrongsession/call/tool/args/status 与
  unavailable/pending 的区分行为；trace 携带 receipt_via 观测来源（活体 OC 会话
  API 旁路，非模型可见 transcript，绝不冒充渲染结果）。
"""
import http.server
import importlib.util
import json
import sys
import tempfile
import threading
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ADAPTER_DIR = HERE.parent / "adapter"
sys.path.insert(0, str(ADAPTER_DIR))
import lane_context  # noqa: E402  (adds frozen-machine script paths)
import opencode_tool_receipt  # noqa: E402
from cca_bench.suites.mock_results import MockFault  # noqa: E402

_spec = importlib.util.spec_from_file_location("compact_resume_fixture", HERE / "compact-resume-fixture.py")
fx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fx)

MARKER = {"role": "user", "content": fx.MARKER}
CONTINUE = "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed."
SUMMARIZER_SYSTEM = {"role": "system", "content": (
    "You are a context summarization agent. You are given a conversation between a user "
    "and an agent. Your goal is to produce a structured summary matching the format "
    "specified so another coding agent can continue the work.")}
EMPTY_CONVERSATION = (
    "Here is the conversation so far:\n\n<conversation>\n[User]: %s\n</conversation>\n\n"
    "Here is the summary of the conversation before the <conversation> above:\n\n"
    "<prior-summary>\n%s\n</prior-summary>\n\n"
    "The <prior-summary> summarizes everything that happened before the <conversation>. "
    "Construct a new summary that combines both." % (CONTINUE, "%s"))
FAILURES = []
STATE = {"messages": [], "mode": "ok", "gets": 0}


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def enter_result(workspace):
    const = dict(fx.const_vars(fx.ROOT_SESSION, workspace), agent_cli="opencode", agent_id="main",
                 cca_framework_home=str(workspace / "framework"),
                 cca_sql_path=str(workspace / "_cca_analysis" / "callgraph.db"),
                 max_in_one_batch="16", para_default="2")
    return '{\n  "const_vars": %s,\n  "instructions": "prepare the scope"' % json.dumps(const)


def state_result(workspace):
    const = dict(fx.const_vars(fx.ROOT_SESSION, workspace), agent_cli="opencode", agent_id="main",
                 cca_framework_home=str(workspace / "framework"),
                 cca_sql_path=str(workspace / "_cca_analysis" / "callgraph.db"),
                 max_in_one_batch="16", para_default="2")
    return '{\n  "const_vars": %s,\n  "instructions": "read the handbook"' % json.dumps(const)


def first_summary_request(rendered):
    return [SUMMARIZER_SYSTEM, {"role": "user", "content":
            "Here is the conversation so far:\n\n<conversation>\n%s\n[truncated]\n</conversation>\n\n"
            "Create a new anchored summary from the conversation history in the <conversation> "
            "tags above so another coding agent can continue the work." % rendered}]


def summary_request(rendered, prior_receipt_text):
    return [SUMMARIZER_SYSTEM, {"role": "user", "content":
            "Here is the conversation so far:\n\n<conversation>\n%s\n[truncated]\n</conversation>\n\n"
            "Here is the summary of the conversation before the <conversation> above:\n\n"
            "<prior-summary>\n%s\n</prior-summary>\n\n"
            "The <prior-summary> summarizes everything that happened before the <conversation>. "
            "Construct a new summary that combines both." % (rendered, prior_receipt_text)}]


def chained_render(user_head, call, result_text):
    return ("[User]: %s\n\n[Assistant tool call]: %s(%s)\n[Tool result]: %s"
            % (user_head, call["name"], json.dumps(call.get("arguments") or {}, ensure_ascii=False),
               result_text))


def echo_of_text(text):
    return {"role": "assistant", "content": [{"type": "text", "text": text}]}


def zero_tail(lane, workspace, receipt_text):
    return fx.ask(lane, workspace, [fx.main_system(), dict(MARKER),
                                    {"role": "assistant", "content": [{"type": "text", "text": receipt_text}]},
                                    {"role": "user", "content": CONTINUE}])


def native_tool_message(call, output, status="completed", input_override=None, exit_code=0,
                        truncated=False, part_session=None, info_session=None):
    """sanitized 捕获形状（cx6 main-messages.json/a688 s7 格式）：只换值不换形。"""
    stamp = call["id"].replace(".", "")
    session = info_session or fx.ROOT_SESSION
    return {"info": {"id": "msg_native%s" % stamp, "sessionID": session, "role": "assistant",
                     "time": {"created": 1795115004673}, "summary": {"diffs": []},
                     "agent": "main", "model": {"providerID": "bench-mock", "modelID": "bench-model"}},
            "parts": [{"id": "prt_native%s" % stamp, "sessionID": part_session or fx.ROOT_SESSION,
                       "messageID": "msg_native%s" % stamp, "type": "tool", "callID": call["id"],
                       "tool": call["name"],
                       "state": {"status": status,
                                 "input": input_override if input_override is not None
                                 else (call.get("arguments") or {}),
                                 "output": output, "title": "",
                                 "metadata": {"output": output, "exit": exit_code, "truncated": truncated},
                                 "time": {"start": 1795115013190, "end": 1795115013207}}}]}


class SyntheticProtocol(http.server.BaseHTTPRequestHandler):
    """显式合成：只证明适配器协议，不模拟原生 OC 语义。"""

    def do_GET(self):
        STATE["gets"] += 1
        if STATE["mode"] == "redirect":
            self.send_response(302)
            self.send_header("Location", "http://example.invalid/session/other/message")
            self.end_headers()
            return
        if STATE["mode"] == "server-error":
            self.send_response(500)
            self.end_headers()
            return
        if STATE["mode"] == "garbage":
            body = b"{not-json"
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path != "/session/%s/message" % fx.ROOT_SESSION:
            self.send_response(404)
            self.end_headers()
            return
        body = json.dumps(STATE["messages"]).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def start_synthetic_server():
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), SyntheticProtocol)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def write_ready(lane, port, session=fx.ROOT_SESSION, server=None):
    payload = {"session": session, "server": server or ("http://127.0.0.1:%d" % port),
               "workspace": "/fixture-ws", "mock_port": port + 1}
    (lane / "ready.json").write_text(json.dumps(payload, indent=1), encoding="utf-8")


def env_of(lane):
    return {"root": lane, "root_session": fx.ROOT_SESSION, "records": lane / "records",
            "workspace": lane.parent / "ws"}


def fault_kind(callable_):
    try:
        callable_()
    except MockFault as fault:
        return fault.kind
    except Exception as error:  # noqa: BLE001
        return "unexpected:%s" % type(error).__name__
    return None


def error_of(reply):
    return reply.get("error") or {}


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-compact-live-receipt-"))
    workspace = base / "ws"
    workspace.mkdir()
    server = start_synthetic_server()
    port = server.server_address[1]
    cold = fx.build_lane(base, "cold", workspace)
    live = fx.build_lane(base, "live", workspace)
    write_ready(live, port)
    replays = []

    # ================= 客户端：合成协议服务上的绑定/匹配/故障面 =================
    pending = None  # 由适配器实测决策填充（见下）
    client_lane = base / "client"
    (client_lane / "records").mkdir(parents=True)
    write_ready(client_lane, port)
    STATE["mode"] = "ok"

    def client_setup(part_messages):
        STATE["messages"] = part_messages
        return env_of(client_lane)

    probe = {"action": "tool", "id": "main.s7", "name": "bash",
             "arguments": {"command": "python3 reserve --operation bench-analysis-r1"}}
    out7 = json.dumps({"phase": "analysis", "status": "reserved", "batches": [{"cwd": "/w/src"}]})
    got = opencode_tool_receipt.observe(client_setup([native_tool_message(probe, out7)]), probe)
    check("client: completed+exit0 → 真实回执(原样输出)＋sidechannel 来源标注",
          got["kind"] == "receipt" and got["receipt"] == {"toolCallId": "main.s7", "toolName": "bash",
                                                          "isError": False, "text": out7}
          and got["provenance"]["source"] == "opencode-session-api"
          and got["provenance"]["model_visible"] is False
          and got["provenance"]["status"] == "completed"
          and got["provenance"]["server"] == "127.0.0.1:%d" % port
          and got["provenance"]["part_id"] == "prt_nativemains7",
          json.dumps(got.get("provenance", {}))[:160])
    got_p = opencode_tool_receipt.observe(
        client_setup([native_tool_message(probe, out7, status="pending")]), probe)
    check("client: pending/running → 不推进的 pending 观测", got_p["kind"] == "pending")
    got_e = opencode_tool_receipt.observe(client_setup([native_tool_message(probe, out7, status="error")]), probe)
    check("client: error 状态 → isError 回执(交原机 expect 拒绝)",
          got_e["kind"] == "receipt" and got_e["receipt"]["isError"] is True)
    got_x = opencode_tool_receipt.observe(
        client_setup([native_tool_message(probe, out7, exit_code=2)]), probe)
    check("client: completed 但 exit≠0 → isError 回执", got_x["receipt"]["isError"] is True)
    env_c = client_setup([native_tool_message(probe, out7, status="running")])
    check("client: running 同 pending",
          opencode_tool_receipt.observe(env_c, probe)["kind"] == "pending")
    for name, messages, want in (
            ("缺失 part(异 callID)", [native_tool_message(dict(probe, id="main.s9"), out7)],
             "compact_receipt_transport_missing"),
            ("重复 part", [native_tool_message(probe, out7), native_tool_message(probe, out7)],
             "compact_receipt_transport_duplicate"),
            ("错 tool 名", [native_tool_message(dict(probe, name="fsm_fsm_get_state"), out7)],
             "compact_receipt_transport_mismatch"),
            ("错 exact input", [native_tool_message(probe, out7, input_override={"command": "echo nope"})],
             "compact_receipt_transport_mismatch"),
            ("异主会话(part)", [native_tool_message(probe, out7, part_session="ses_foreign0001")],
             "compact_receipt_transport_binding"),
            ("异主会话(info)", [native_tool_message(probe, out7, info_session="ses_foreign0002")],
             "compact_receipt_transport_binding"),
            ("未知状态", [native_tool_message(probe, out7, status="weird")],
             "compact_receipt_transport_malformed"),
            ("截断输出", [native_tool_message(probe, out7, truncated=True)],
             "compact_receipt_transport_malformed"),
            ("非 JSON 体", [{"info": {}, "parts": "not-a-list"}],
             "compact_receipt_transport_malformed")):
        env_c = client_setup(messages)
        check("client 拒绝: %s → %s" % (name, want),
              fault_kind(lambda: opencode_tool_receipt.observe(env_c, probe)) == want)
    (client_lane / "ready.json").unlink()
    check("client: 无 ready.json → unavailable(非故障)",
          fault_kind(lambda: opencode_tool_receipt.observe(env_of(client_lane), probe))
          == "compact_receipt_transport_unavailable")
    write_ready(client_lane, port, session="ses_otherlane0000")
    check("client: ready.json 会话外绑 → binding 拒绝",
          fault_kind(lambda: opencode_tool_receipt.observe(env_of(client_lane), probe))
          == "compact_receipt_transport_binding")
    for bad in ("http://10.0.0.5:1234", "https://127.0.0.1:%d" % port,
                "http://user:pw@127.0.0.1:%d" % port, "http://127.0.0.1:%d/q?x=1" % port,
                "http://127.0.0.1", "http://127.0.0.1:%d/redir" % port):
        write_ready(client_lane, port, server=bad)
        check("client: 拒绝非 loopback/凭据/查询/缺端口 URL %s" % bad,
              fault_kind(lambda: opencode_tool_receipt.observe(env_of(client_lane), probe))
              == "compact_receipt_transport_refused", bad)
    write_ready(client_lane, port, server="http://127.0.0.1:1")
    check("client: 死端口 → unavailable",
          fault_kind(lambda: opencode_tool_receipt.observe(env_of(client_lane), probe))
          == "compact_receipt_transport_unavailable")
    write_ready(client_lane, port)
    STATE["mode"] = "redirect"
    check("client: 302 重定向 → refused(绝不跟随)",
          fault_kind(lambda: opencode_tool_receipt.observe(env_of(client_lane), probe))
          == "compact_receipt_transport_refused")
    STATE["mode"] = "server-error"
    check("client: HTTP 500 → unavailable",
          fault_kind(lambda: opencode_tool_receipt.observe(env_of(client_lane), probe))
          == "compact_receipt_transport_unavailable")
    STATE["mode"] = "garbage"
    check("client: 非 JSON 响应体 → malformed",
          fault_kind(lambda: opencode_tool_receipt.observe(env_of(client_lane), probe))
          == "compact_receipt_transport_malformed")
    STATE["mode"] = "ok"

    # ================= 适配器：0001..0015 建 genesis 链至已发未覆盖 s7 =================
    # 新设计：链只经 own trace＋活体 OC 补绑铸成（渲染转述只是请求里的装饰噪声）；
    # 每次摘要前把已完成的真实部件按序放入活库：completed 才绑；s6 在 aux6 前
    # 故意不放（已发未覆盖）；aux7 前补上 s6、不放 s7（链尾恰好停在未覆盖 s7）。
    first, _ = fx.ask(live, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    call1 = fx.tool_call(first)
    replays.append((fx.echo_of(first), fx.synthesize_receipt(call1, workspace)))
    STATE["messages"] = [native_tool_message(call1, replays[0][1]["content"][0]["text"])]
    aux1, _ = fx.ask(live, workspace, first_summary_request(
        chained_render("start", call1, enter_result(workspace))))
    prior = fx.reply_text(aux1)
    renders = [state_result(workspace), '{"nodes": 4, "status": "ok"}',
               '{"status": "ready"}', None]
    for step in range(2, 6):
        reply, _ = zero_tail(live, workspace, prior)
        call = fx.tool_call(reply)
        receipt = fx.synthesize_receipt(call, workspace)
        replays.append((fx.echo_of(reply), receipt))
        STATE["messages"].append(native_tool_message(call, receipt["content"][0]["text"]))
        result_text = renders[step - 2] if renders[step - 2] is not None \
            else json.dumps({"current_state": (call.get("arguments") or {}).get("target")})
        aux, _ = fx.ask(live, workspace, summary_request(chained_render(CONTINUE, call, result_text), prior))
        prior = fx.reply_text(aux)
    reply6, _ = zero_tail(live, workspace, prior)
    call6 = fx.tool_call(reply6)
    replays.append((fx.echo_of(reply6), fx.synthesize_receipt(call6, workspace)))
    aux6, _ = fx.ask(live, workspace, [SUMMARIZER_SYSTEM, {"role": "user", "content":
                          EMPTY_CONVERSATION % prior}])
    prior = fx.reply_text(aux6)
    echo6, result6 = replays[-1]
    reply7, _ = fx.ask(live, workspace, [fx.main_system(), dict(MARKER), echo_of_text(prior),
                                         dict(echo6), dict(result6), {"role": "user", "content": CONTINUE}])
    call7 = fx.tool_call(reply7)
    check("0013 保留形状: 消费 s6 → 发布 main.s7 bash reserve(实变量)",
          bool(call7) and call7["id"] == "main.s7" and call7["name"] == "bash"
          and " reserve --session " + fx.ROOT_SESSION in call7["arguments"]["command"],
          json.dumps(reply7)[:200] if reply7.get("error") else "ok")
    replays.append((fx.echo_of(reply7), fx.synthesize_receipt(call7, workspace)))
    STATE["messages"].append(native_tool_message(call6, replays[-2][1]["content"][0]["text"]))
    aux7, _ = fx.ask(live, workspace, summary_request(
        chained_render(CONTINUE, call6, state_result(workspace)), prior))
    prior = fx.reply_text(aux7)
    check("0014 summary 后链=genesis[s1..s6]+已发含未覆盖 s7",
          len(fx.checkpoint_entries(live)) == 7
          and fx.checkpoint_entries(live)[-1]["emitted_decisions"][-1] == {"action": "tool", "id": "main.s7"},
          json.dumps(fx.checkpoint_entries(live)[-1]["emitted_decisions"][-2:]))
    pending = {"action": "tool", "id": call7["id"], "name": call7["name"],
               "arguments": call7.get("arguments") or {}}
    actual7 = fx.synthesize_receipt(call7, workspace)["content"][0]["text"]

    # ================= exact0016：活体检索真实回执 → 恰一次 main.s8 派发 =================
    oracle_messages = [fx.main_system(), {"role": "user", "content": "start"}]
    for echo, receipt in replays:
        oracle_messages += [dict(echo), dict(receipt)]
    oracle_next, _ = fx.ask(cold, workspace, oracle_messages)
    check("cold oracle: 消费 s7 真实回执后下一决策=agent 派发",
          bool(fx.tool_call(oracle_next)) and fx.tool_call(oracle_next)["name"] == "agent",
          json.dumps(oracle_next)[:160])
    STATE["messages"] = [native_tool_message(pending, actual7)]
    req16 = [fx.main_system(), dict(MARKER), echo_of_text(prior), {"role": "user", "content": CONTINUE}]
    gets_before = STATE["gets"]
    reply16, _ = fx.ask(live, workspace, req16)
    call16 = fx.tool_call(reply16)
    check("0016 活体检索: 真实回执→恰一次 main.s8 agent 派发(不等待/不重发 reserve)",
          not reply16.get("error") and bool(call16) and call16["id"] == "main.s8"
          and call16["name"] == "agent" and " reserve " not in json.dumps(call16.get("arguments") or {}),
          json.dumps(reply16)[:240] if reply16.get("error") else json.dumps(call16)[:160])
    check("0016 下一决策与 cold oracle 逐字节一致(原机 expect 同轨)",
          reply16.get("content") == oracle_next.get("content"),
          json.dumps(reply16.get("content"))[:200])
    row16 = fx.trace_rows(live)[-1]
    via = row16.get("receipt_via") or {}
    check("0016 trace: live-receipt-advance＋receipt_via=活体 OC 会话 API 旁路(非模型可见)",
          row16.get("case") == "live-receipt-advance" and row16.get("decision", {}).get("id") == "main.s8"
          and "waiting_receipt" not in row16
          and via.get("source") == "opencode-session-api" and via.get("model_visible") is False
          and via.get("call_id") == "main.s7" and via.get("status") == "completed",
          json.dumps({k: row16.get(k) for k in ("case", "decision", "receipt_via")})[:260])
    check("0016 每请求恰一次只读 GET(有界、零重试)", STATE["gets"] - gets_before == 1,
          "gets=%d" % (STATE["gets"] - gets_before))
    check("0016 后链不增(不伪造静息点/不重复 reserve 进度)", len(fx.checkpoint_entries(live)) == 7)
    reply16b, _ = fx.ask(live, workspace, req16)
    check("同请求幂等: 重放逐字节同答 main.s8、无重复 reserve、链稳定",
          not reply16b.get("error") and reply16b.get("content") == reply16.get("content")
          and len(fx.checkpoint_entries(live)) == 7,
          json.dumps(reply16b)[:200] if reply16b.get("error") else "ok")

    # ================= 负路径：wrongsession/call/tool/args/status、unavailable/pending =================
    summary_echo = echo_of_text(prior)
    cases = []
    write_ready(live, port, session="ses_wrongsession00")
    STATE["messages"] = [native_tool_message(pending, actual7)]
    bad, _ = fx.ask(live, workspace, req16)
    cases.append(("wrongsession: ready 会话外绑 → binding 拒绝", bad, "compact_receipt_transport_binding"))
    write_ready(live, port)
    STATE["messages"] = [native_tool_message(dict(pending, id="main.s6"), actual7)]
    bad, _ = fx.ask(live, workspace, req16)
    cases.append(("wrong call: 活库无 s7 part → missing 拒绝", bad, "compact_receipt_transport_missing"))
    STATE["messages"] = [native_tool_message(dict(pending, name="agent"), actual7)]
    bad, _ = fx.ask(live, workspace, req16)
    cases.append(("wrong tool: part 名≠决策名 → mismatch", bad, "compact_receipt_transport_mismatch"))
    STATE["messages"] = [native_tool_message(pending, actual7, input_override={"command": "tampered"})]
    bad, _ = fx.ask(live, workspace, req16)
    cases.append(("wrong args: exact input 不符 → mismatch", bad, "compact_receipt_transport_mismatch"))
    STATE["messages"] = [native_tool_message(pending, "tool exploded", status="error")]
    bad, _ = fx.ask(live, workspace, req16)
    cases.append(("wrong status: error 回执经原机 expect 拒绝", bad, "expected_success_rejected"))
    for name, reply, kind in cases:
        error = error_of(reply)
        check("适配器拒绝: %s" % name,
              error.get("code") == "playbook_program_error" and kind in error.get("message", "")
              and not fx.tool_call(reply), "msg=%s" % error.get("message", "")[:180])
    write_ready(live, port, server="http://127.0.0.1:1")
    STATE["messages"] = [native_tool_message(pending, actual7)]
    wait_u, _ = fx.ask(live, workspace, req16)
    row_u = fx.trace_rows(live)[-1]
    check("unavailable: 死端口→如实等待不推进(trace 标 unavailable, 不崩)",
          not wait_u.get("error") and fx.tool_call(wait_u) is None
          and "main.s7" in fx.reply_text(wait_u) and "not reissuing" in fx.reply_text(wait_u)
          and (row_u.get("receipt_transport") or {}).get("kind") == "unavailable"
          and row_u.get("case") == "wait-receipt", fx.reply_text(wait_u)[:120])
    write_ready(live, port)
    STATE["messages"] = [native_tool_message(pending, actual7, status="pending")]
    wait_p, _ = fx.ask(live, workspace, req16)
    row_p = fx.trace_rows(live)[-1]
    check("pending: 结果未完成→不推进的诚实等待(trace 标 pending)",
          not wait_p.get("error") and fx.tool_call(wait_p) is None
          and (row_p.get("receipt_transport") or {}).get("kind") == "pending"
          and row_p.get("case") == "wait-receipt", fx.reply_text(wait_p)[:120])
    STATE["messages"] = [native_tool_message(pending, actual7)]
    reply_done, _ = fx.ask(live, workspace, req16)
    check("pending→completed: 同形状下一请求即以真实回执推进 main.s8",
          not reply_done.get("error") and fx.tool_call(reply_done) == fx.tool_call(reply16),
          json.dumps(reply_done)[:160])
    check("全程无 reserve 重发: 所有 0016 应答均无 bash reserve toolCall",
          all(" reserve " not in json.dumps((r.get("arguments") or {}))
              for r in [fx.tool_call(reply16), fx.tool_call(reply16b), fx.tool_call(reply_done)]
              if r and r.get("name") == "bash") is True)

    server.shutdown()
    print("workdir:", base)
    if FAILURES:
        print("FAILED %d checks: %s" % (len(FAILURES), ", ".join(FAILURES)))
        return 1
    print("ALL CHECKS PASSED")
    import shutil
    shutil.rmtree(base, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
