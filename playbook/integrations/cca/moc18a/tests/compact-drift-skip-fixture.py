#!/usr/bin/env python3
"""0017 漂移跳过场景夹具：合成活体 OC 服务＋cx9 0001..0016 链路重建。

真实证据（CCA_ROOT=.local/analysis-decouple/.pi/cx9/raw-requests READ ONLY）：
0015 渲染 s7 回执被截断（"batches" 段不闭合＝前缀规则弃绑，链停在 genesis[s1..s6]）；
0016 零尾 main 经活体 OC 会话 API 消费真实 s7 回执（live-receipt-advance）后派发
main.s8 agent；0017 链式 summary 的 <conversation> 直接以 s8 agent 调用开头。
本夹具按同一形状重建至 0017 前置状态（genesis[s1..s6]+已发未覆盖 s7）：私有 id
改写为可移植合成值，回执按冻结机 expect 契约合成（真实闭环来自产品命令）。
服务端载荷形状源自 sanitized 捕获（cx6 main-messages.json：info/parts/tool
state{status,input,output,metadata{exit,truncated}}）——只证明适配器协议。
"""
import http.server
import importlib.util
import json
import threading
from pathlib import Path

_spec = importlib.util.spec_from_file_location(
    "drift_skip_compact_resume_fixture", Path(__file__).resolve().parent / "compact-resume-fixture.py")
fx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fx)

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
STATE = {"messages": []}


def result_with_const(workspace, instructions):
    const = dict(fx.const_vars(fx.ROOT_SESSION, workspace), agent_cli="opencode", agent_id="main",
                 cca_framework_home=str(workspace / "framework"),
                 cca_sql_path=str(workspace / "_cca_analysis" / "callgraph.db"),
                 max_in_one_batch="16", para_default="2")
    return '{\n  "const_vars": %s,\n  "instructions": %s' % (json.dumps(const), instructions)


def enter_result(workspace):
    return result_with_const(workspace, '"prepare the scope"')


def state_result(workspace):
    return result_with_const(workspace, '"read the handbook"')


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


def empty_conversation_request(prior_receipt_text):
    return [SUMMARIZER_SYSTEM, {"role": "user", "content": EMPTY_CONVERSATION % prior_receipt_text}]


def chained_render(user_head, call, result_text=None):
    text = "[User]: %s\n\n[Assistant tool call]: %s(%s)" % (
        user_head, call["name"], json.dumps(call.get("arguments") or {}, ensure_ascii=False))
    if result_text is not None:
        text += "\n[Tool result]: %s" % result_text
    return text


def echo_of_text(text):
    return {"role": "assistant", "content": [{"type": "text", "text": text}]}


def zero_tail(lane, workspace, receipt_text):
    return fx.ask(lane, workspace, [fx.main_system(), {"role": "user", "content": fx.MARKER},
                                    echo_of_text(receipt_text), {"role": "user", "content": CONTINUE}])


def native_tool_message(call, output, status="completed", input_override=None, exit_code=0,
                        truncated=False, part_session=None, tool_override=None):
    """sanitized 捕获形状（cx6 main-messages.json/a688 s7 格式）：只换值不换形。"""
    stamp = call["id"].replace(".", "")
    return {"info": {"id": "msg_native%s" % stamp, "sessionID": fx_session(), "role": "assistant",
                     "time": {"created": 1795115004673}, "summary": {"diffs": []},
                     "agent": "main", "model": {"providerID": "bench-mock", "modelID": "bench-model"}},
            "parts": [{"id": "prt_native%s" % stamp, "sessionID": part_session or fx_session(),
                       "messageID": "msg_native%s" % stamp, "type": "tool", "callID": call["id"],
                       "tool": tool_override or call["name"],
                       "state": {"status": status,
                                 "input": input_override if input_override is not None
                                 else (call.get("arguments") or {}),
                                 "output": output, "title": "",
                                 "metadata": {"output": output, "exit": exit_code, "truncated": truncated},
                                 "time": {"start": 1795115013190, "end": 1795115013207}}}]}


def fx_session():
    return fx.ROOT_SESSION


def pending_of(call):
    return {"action": "tool", "id": call["id"], "name": call["name"],
            "arguments": call.get("arguments") or {}}


def receipt_payload(text):
    try:
        value = json.loads(text)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


class SyntheticProtocol(http.server.BaseHTTPRequestHandler):
    """显式合成：只证明适配器协议，不模拟原生 OC 语义。"""

    def do_GET(self):
        if self.path != "/session/%s/message" % fx_session():
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


def write_ready(lane, port, server=None):
    (lane / "ready.json").write_text(json.dumps(
        {"session": fx_session(), "server": server or ("http://127.0.0.1:%d" % port),
         "workspace": "/fixture-ws", "mock_port": port + 1}, indent=1), encoding="utf-8")


def build_to_0017(live, workspace):
    """0001..0016：genesis 链至[s1..s6]+已发未覆盖 s7，活体消费 s7 后派发 s8。

    返回 (prior7, replays)：prior7＝0014 末回执（渲染史从 s8 起跳的链式 prior）；
    replays＝(echo, receipt) 序列（0016 的重放＝同形状 zero_tail，幂等同答）。
    """
    replays = []
    first, _ = fx.ask(live, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    call1 = fx.tool_call(first)
    replays.append((fx.echo_of(first), fx.synthesize_receipt(call1, workspace)))
    aux1, _ = fx.ask(live, workspace, first_summary_request(
        chained_render("start", call1, enter_result(workspace))))
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
    replays.append((fx.echo_of(reply6), fx.synthesize_receipt(call6, workspace)))
    aux6, _ = fx.ask(live, workspace, empty_conversation_request(prior))
    prior = fx.reply_text(aux6)
    echo6, result6 = replays[-1]
    reply7, _ = fx.ask(live, workspace, [fx.main_system(), {"role": "user", "content": fx.MARKER},
                                         echo_of_text(prior), dict(echo6), dict(result6),
                                         {"role": "user", "content": CONTINUE}])
    call7 = fx.tool_call(reply7)
    replays.append((fx.echo_of(reply7), fx.synthesize_receipt(call7, workspace)))
    aux7, _ = fx.ask(live, workspace, summary_request(
        chained_render(CONTINUE, call6, state_result(workspace)), prior))
    prior7 = fx.reply_text(aux7)
    return prior7, replays


def oracle_messages(replays):
    messages = [fx.main_system(), {"role": "user", "content": "start"}]
    for echo, receipt in replays:
        messages += [dict(echo), dict(receipt)]
    return messages


def main():
    raise AssertionError("scenario fixture module; run compact-drift-skip-mint.test.py")


if __name__ == "__main__":
    raise SystemExit(main())
