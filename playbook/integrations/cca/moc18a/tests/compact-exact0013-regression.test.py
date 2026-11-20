#!/usr/bin/env python3
"""cx10 attempt12 0013 精确回归：铸造侧活体补绑回执＋保留 tail 回显的同请恢复。

真实证据形状（.pi/cx10 READ ONLY）：0012 压缩的 <conversation> 深切割吞掉 r6，
铸造经 pending_resolver 活体 GET 绑定 completed r6（checkpoint entry5
receipt_sources[5]=loopback-http-get；liveoc-read-events.jsonl 恰 1 行）；0013
保留 tail 含 a_s6+t_s6。回归：恢复侧重放循环把基线已消费的 a_s6 当未消费重步进
→ 机已持 pending=s7、载荷无回执 → missing_tool_result 崩溃，永远到不了
restore-pending/live 分支。修复：consumed_bound 取恢复后 script.consumed，
floor 后基线已覆盖回显核对即跳过（绝不重步进＝不双消费）。

证明（全走 new_reply→mock2→playbook→adapter 真实栈；HTTP 服务仅合成
opencode 会话 API 协议形状，不模拟原生语义）：
- 铸造活体 GET 真实执行（captured server 计数恰 1）＋entry5 receipt_sources
  带完整来源（output_sha256 与活体输出一致）；
- exact0013：restore-pending 首发main.s7 bash reserve（s7 未发——绝不为未发
  动作读证明：GET 计数不增、无 receipt_via 行、链不增）；同请求幂等；
- 下一请求 a_s7+t_s7：r7 恰一次消费，s8 派发与 cold oracle 逐字节一致
  （原机一次消费后才下一决策；s7=loop 阶段 reserve、s8=agent 派发＝stage/phase
  行为证据）；
- 已发未覆盖（0016 铸造后 s7 在活库 pending）→ 诚实等待不重发；同形请求
  活体 completed → live-receipt-advance＋receipt_via；错身份（错 tool 名）→
  显式 mismatch 拒绝；
- 无 legacy missing_result 旁路：适配器源不引用 missing_tool_result。
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
STATE = {"messages": [], "gets": 0}


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def echo_of_text(text):
    return {"role": "assistant", "content": [{"type": "text", "text": text}]}


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


def chained_render(user_head, call, result_text):
    return ("[User]: %s\n\n[Assistant tool call]: %s(%s)\n[Tool result]: %s"
            % (user_head, call["name"], json.dumps(call.get("arguments") or {}, ensure_ascii=False),
               result_text))


def summary_request(rendered, prior_receipt_text):
    return [SUMMARIZER_SYSTEM, {"role": "user", "content":
            "Here is the conversation so far:\n\n<conversation>\n%s\n[truncated]\n</conversation>\n\n"
            "Here is the summary of the conversation before the <conversation> above:\n\n"
            "<prior-summary>\n%s\n</prior-summary>\n\n"
            "The <prior-summary> summarizes everything that happened before the <conversation>. "
            "Construct a new summary that combines both." % (rendered, prior_receipt_text)}]


def zero_tail(lane, workspace, receipt_text):
    return fx.ask(lane, workspace, [fx.main_system(), dict(MARKER),
                                    echo_of_text(receipt_text), {"role": "user", "content": CONTINUE}])


def native_tool_message(call, output, status="completed", input_override=None, exit_code=0):
    stamp = call["id"].replace(".", "")
    return {"info": {"id": "msg_native%s" % stamp, "sessionID": fx.ROOT_SESSION, "role": "assistant",
                     "time": {"created": 1795115004673}, "summary": {"diffs": []},
                     "agent": "main", "model": {"providerID": "bench-mock", "modelID": "bench-model"}},
            "parts": [{"id": "prt_native%s" % stamp, "sessionID": fx.ROOT_SESSION,
                       "messageID": "msg_native%s" % stamp, "type": "tool", "callID": call["id"],
                       "tool": call["name"],
                       "state": {"status": status,
                                 "input": input_override if input_override is not None
                                 else (call.get("arguments") or {}),
                                 "output": output, "title": "",
                                 "metadata": {"output": output, "exit": exit_code, "truncated": False},
                                 "time": {"start": 1795115013190, "end": 1795115013207}}}]}


class SyntheticProtocol(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        STATE["gets"] += 1
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


def write_ready(lane, port):
    (lane / "ready.json").write_text(json.dumps(
        {"session": fx.ROOT_SESSION, "server": "http://127.0.0.1:%d" % port,
         "workspace": "/fixture-ws", "mock_port": port + 1}, indent=1), encoding="utf-8")


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-compact-exact0013-"))
    workspace = base / "ws"
    workspace.mkdir()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), SyntheticProtocol)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    port = server.server_address[1]
    cold = fx.build_lane(base, "cold", workspace)
    live = fx.build_lane(base, "live", workspace)
    write_ready(live, port)
    replays = []

    # ===== 0001..0011：s1..s6 逐枚发布，0002..0010 链式铸造（r1..r5 模型可见） =====
    first, _ = fx.ask(live, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    call1 = fx.tool_call(first)
    replays.append((fx.echo_of(first), fx.synthesize_receipt(call1, workspace)))
    aux1, _ = fx.ask(live, workspace, [SUMMARIZER_SYSTEM, {"role": "user", "content":
            "Here is the conversation so far:\n\n<conversation>\n%s\n[truncated]\n</conversation>\n\n"
            "Create a new anchored summary from the conversation history in the <conversation> "
            "tags above so another coding agent can continue the work."
            % chained_render("start", call1, enter_result(workspace))}])
    prior = fx.reply_text(aux1)
    renders = [state_result(workspace), '{"nodes": 4, "status": "ok"}', '{"status": "ready"}', None]
    for step in range(2, 6):
        reply, _ = zero_tail(live, workspace, prior)
        call = fx.tool_call(reply)
        replays.append((fx.echo_of(reply), fx.synthesize_receipt(call, workspace)))
        result_text = renders[step - 2] if renders[step - 2] is not None \
            else json.dumps({"current_state": (call.get("arguments") or {}).get("target")})
        aux, _ = fx.ask(live, workspace, summary_request(chained_render(CONTINUE, call, result_text), prior))
        prior = fx.reply_text(aux)
    reply6, _ = zero_tail(live, workspace, prior)
    call6 = fx.tool_call(reply6)
    check("0011 发布 s6（get_state，未发 s7 前置）", bool(call6) and call6["id"] == "main.s6"
          and call6["name"] == "fsm_fsm_get_state", json.dumps(reply6)[:160])
    replays.append((fx.echo_of(reply6), fx.synthesize_receipt(call6, workspace)))
    actual6 = fx.synthesize_receipt(call6, workspace)["content"][0]["text"]

    # ===== 0012 深切割压缩：渲染吞 r6，活库供 completed r6 → 铸造活体 GET 补绑 =====
    STATE["messages"] = [native_tool_message(call6, actual6)]
    gets_before = STATE["gets"]
    aux6, _ = fx.ask(live, workspace, [SUMMARIZER_SYSTEM,
                                       {"role": "user", "content": EMPTY_CONVERSATION % prior}])
    prior6 = fx.reply_text(aux6)
    entries = fx.checkpoint_entries(live)
    gets_mint = STATE["gets"] - gets_before
    check("0012 铸造: 活体 GET 恰执行 1 次（captured server）", gets_mint == 1,
          "gets=%d" % gets_mint)
    src6 = (entries[-1].get("receipt_sources") or [{}])[-1]
    check("0012 铸造: r6 活体补绑入链（receipt_sources=loopback-http-get＋output_sha256）",
          len(entries) == 6 and [r.get("call_id") for r in entries[-1]["receipts"]]
          == ["main.s%d" % i for i in range(1, 7)]
          and src6.get("transport") == "loopback-http-get"
          and src6.get("model_visible") is False and src6.get("status") == "completed"
          and src6.get("call_id") == "main.s6"
          and src6.get("output_sha256") == __import__("hashlib").sha256(actual6.encode()).hexdigest(),
          json.dumps(src6)[:200])
    check("0012 铸造: emitted 止于 s6（s7 从未发布）",
          entries[-1]["emitted_decisions"][-1] == {"action": "tool", "id": "main.s6"},
          json.dumps(entries[-1]["emitted_decisions"][-2:]))

    # ===== exact0013：保留 tail a_s6+t_s6 → 首发恢复 s7，绝不为未发动作读证明 =====
    req13 = [fx.main_system(), dict(MARKER), echo_of_text(prior6),
             dict(replays[-1][0]), dict(replays[-1][1]), {"role": "user", "content": CONTINUE}]
    gets_before = STATE["gets"]
    reply13, _ = fx.ask(live, workspace, req13)
    call7 = fx.tool_call(reply13)
    row13 = fx.trace_rows(live)[-1]
    check("0013 恢复: 不再 missing_tool_result，首发 main.s7 bash reserve",
          not reply13.get("error") and bool(call7) and call7["id"] == "main.s7"
          and call7["name"] == "bash"
          and " reserve --session " + fx.ROOT_SESSION in call7["arguments"]["command"]
          and "--operation bench-analysis-r1" in call7["arguments"]["command"],
          json.dumps(reply13)[:240] if reply13.get("error") else json.dumps(call7)[:200])
    check("0013 trace: case=restore-pending（首发，非等待/非活体检索）",
          row13.get("case") == "restore-pending" and (row13.get("decision") or {}).get("id") == "main.s7"
          and "receipt_via" not in row13 and "waiting_receipt" not in row13,
          json.dumps({k: row13.get(k) for k in ("case", "decision")}))
    check("0013 未发不读证明: s7 无活体 GET（计数不增）、链不增",
          STATE["gets"] == gets_before and len(fx.checkpoint_entries(live)) == 6,
          "gets+=%d entries=%d" % (STATE["gets"] - gets_before, len(fx.checkpoint_entries(live))))
    reply13b, _ = fx.ask(live, workspace, req13)
    check("0013 同请求幂等: 逐字节同答 s7、无二次 GET、链稳定",
          not reply13b.get("error") and reply13b.get("content") == reply13.get("content")
          and STATE["gets"] == gets_before and len(fx.checkpoint_entries(live)) == 6,
          json.dumps(reply13b)[:160] if reply13b.get("error") else "ok")
    oracle6, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": "start"}]
                        + [dict(e) for pair in replays for e in pair])
    check("0013 与 cold oracle 逐字节一致（原机一次消费后同一决策）",
          not oracle6.get("error") and oracle6.get("content") == reply13.get("content"),
          json.dumps(oracle6.get("content"))[:160])

    # ===== 0015：a_s7+t_s7 到场 → r7 恰一次消费 → s8 agent 派发 =====
    pending7 = {"id": call7["id"], "name": call7["name"], "arguments": call7.get("arguments") or {}}
    echo7, result7 = fx.echo_of(reply13), fx.synthesize_receipt(call7, workspace)
    req15 = [fx.main_system(), dict(MARKER), echo_of_text(prior6),
             dict(replays[-1][0]), dict(replays[-1][1]), dict(echo7), dict(result7),
             {"role": "user", "content": CONTINUE}]
    reply15, _ = fx.ask(live, workspace, req15)
    call8 = fx.tool_call(reply15)
    oracle7, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": "start"}]
                        + [dict(e) for pair in replays + [(echo7, result7)] for e in pair])
    check("0015 恰一次消费: r7 消费后 main.s8 agent 派发（loop/analysis 行为证据），与 oracle 逐字节一致",
          not reply15.get("error") and bool(call8) and call8["id"] == "main.s8"
          and call8["name"] == "agent" and " reserve " not in json.dumps(call8.get("arguments") or {})
          and reply15.get("content") == oracle7.get("content"),
          json.dumps(reply15)[:200] if reply15.get("error") else "ok")

    # ===== 0016 链式铸造：渲染吞 r7 → 活体补绑 r7，待发推导到 s8（唯一未覆盖） =====
    actual7 = fx.synthesize_receipt(call7, workspace)["content"][0]["text"]
    STATE["messages"] = [native_tool_message(pending7, actual7)]
    gets_before = STATE["gets"]
    aux7, _ = fx.ask(live, workspace, [SUMMARIZER_SYSTEM,
                                       {"role": "user", "content": EMPTY_CONVERSATION % prior6}])
    prior7 = fx.reply_text(aux7)
    entries = fx.checkpoint_entries(live)
    src7 = (entries[-1].get("receipt_sources") or [{}])[-1]
    check("0016 铸造: 活体 GET 恰 1 次补绑 r7 入链（receipts s1..s7＋来源标注）",
          len(entries) == 7 and STATE["gets"] - gets_before == 1
          and [r.get("call_id") for r in entries[-1]["receipts"]] == ["main.s%d" % i for i in range(1, 8)]
          and src7.get("transport") == "loopback-http-get" and src7.get("model_visible") is False
          and src7.get("call_id") == "main.s7"
          and src7.get("output_sha256") == __import__("hashlib").sha256(actual7.encode()).hexdigest(),
          json.dumps(src7)[:200])
    check("0016 铸造: emitted 止于 s8（恰一枚未覆盖待发）",
          entries[-1]["emitted_decisions"][-1] == {"action": "tool", "id": "main.s8"},
          json.dumps(entries[-1]["emitted_decisions"][-2:]))

    # ===== 0017 已发未覆盖：活库 pending → 诚实等待；completed → 恰一次活体检索推进 =====
    req17 = [fx.main_system(), dict(MARKER), echo_of_text(prior7), {"role": "user", "content": CONTINUE}]
    pending8 = {"id": call8["id"], "name": call8["name"], "arguments": call8.get("arguments") or {}}
    STATE["messages"] = [native_tool_message(pending8, "dispatching", status="pending")]
    gets_before = STATE["gets"]
    wait_p, _ = fx.ask(live, workspace, req17)
    row_p = fx.trace_rows(live)[-1]
    check("0017 已发未覆盖+活库 pending: 诚实等待不推进不重发",
          not wait_p.get("error") and fx.tool_call(wait_p) is None
          and "main.s8" in fx.reply_text(wait_p) and "not reissuing" in fx.reply_text(wait_p)
          and row_p.get("case") == "wait-receipt"
          and (row_p.get("receipt_transport") or {}).get("kind") == "pending",
          fx.reply_text(wait_p)[:120])
    check("0017 等待路径 GET 恰 1 次（有界只读）", STATE["gets"] - gets_before == 1,
          "gets=%d" % (STATE["gets"] - gets_before))
    actual8 = fx.synthesize_receipt(call8, workspace)["content"][0]["text"]
    STATE["messages"] = [native_tool_message(pending8, actual8)]
    gets_before = STATE["gets"]
    reply17, _ = fx.ask(live, workspace, req17)
    row17 = fx.trace_rows(live)[-1]
    via = row17.get("receipt_via") or {}
    oracle8, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": "start"}]
                        + [dict(e) for pair in replays + [(echo7, result7),
                                                          (fx.echo_of(reply15), fx.synthesize_receipt(call8, workspace))]
                        for e in pair])
    check("0017 completed: live-receipt-advance 恰一次 GET → r8 消费 → s9 与 oracle 逐字节一致",
          not reply17.get("error") and reply17.get("content") == oracle8.get("content")
          and row17.get("case") == "live-receipt-advance"
          and (row17.get("decision") or {}).get("id") == "main.s9"
          and STATE["gets"] - gets_before == 1
          and via.get("source") == "opencode-session-api" and via.get("model_visible") is False
          and via.get("call_id") == "main.s8" and via.get("status") == "completed",
          json.dumps({k: row17.get(k) for k in ("case", "decision", "receipt_via")})[:260])
    STATE["messages"] = [native_tool_message(dict(pending8, name="bash"), actual8)]
    bad, _ = fx.ask(live, workspace, req17)
    error = bad.get("error") or {}
    check("0017 错身份: part 名≠决策名 → mismatch 显式拒绝",
          error.get("code") == "playbook_program_error"
          and "compact_receipt_transport_mismatch" in error.get("message", "")
          and not fx.tool_call(bad), "msg=%s" % error.get("message", "")[:160])

    # ===== 无 legacy missing_result 旁路（静态守卫） =====
    leaked = [p.name for p in ADAPTER_DIR.glob("*.py")
              if "missing_tool_result" in p.read_text(encoding="utf-8")]
    check("无 legacy 旁路: 适配器源不捕获/不引用 missing_tool_result", not leaked, str(leaked))

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
