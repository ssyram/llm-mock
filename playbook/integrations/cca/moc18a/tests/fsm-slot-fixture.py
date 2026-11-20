#!/usr/bin/env python3
"""fsm 槽位泄漏对账回归（cx7 attempt9 0018 根因，attempt10 修复）。

【fixture HTTP 仅适配器协议，不代表真实 OC】本地 HTTP 服务是显式合成的
适配器协议证据：只证明本适配器与 "/session/<session>/message 消息表形状"
的协议交互（sanitized 自 cx7 捕获：info{sessionID,role}/parts[{type:tool,
callID,tool,state{status,input,output,metadata{truncated}}}；fsm part 的
metadata 无 exit/output 键——cx7 main-messages.json 实测形状），值全部为
fixture 合作物，绝不冒充原生 OC 行为（真机由 a688 attempt10 原生验证负责）。

复现链（与 cx7 事件序同构）：根会话 root 签发 main.s2 fsm_fsm_get_state →
compaction（aux 摘要＋zero-tail）抹掉带内回执 → 锁泄漏 → 异会话 worker 首个
get_state 被阻塞 → 活体 GET 观测到唯一 completed part（session/callId/tool/
exact args 全绑定）→ 仅释放该锁 → 获取成功、回执原样透传、provenance 落带；
同会话先例（0017 形状）走既有 same-session 串行分支不释放；pending/错参/错
名/重复/异主/缺件/无 ready.json 一律不释放；一次完整 20s 超时故障面不变。
"""
import http.server
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ADAPTER = HERE.parent / "adapter"
sys.path.insert(0, str(ADAPTER))
import lane_context  # noqa: E402,F401  (frozen-machine script paths)

_spec = importlib.util.spec_from_file_location("compact_resume_fixture", HERE / "compact-resume-fixture.py")
fx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fx)

CONTINUE = "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed."
SUMMARY_HEAD = "Here is the conversation so far:\n\n<conversation>\n%s\n[truncated]\n</conversation>\n\n%s"
SUMMARIZER_SYSTEM = {"role": "system", "content": (
    "You are a context summarization agent. You are given a conversation between a user "
    "and an agent. Your goal is to produce a structured summary matching the format "
    "specified so another coding agent can continue the work.")}


def rich(session, call_id, tool, arguments):
    return {"session": session, "callId": call_id, "tool": tool, "arguments": arguments}
WORKER_TAG_PROMPT = "BENCH-TAG role=worker phase=analysis task=w1 kind=batch\n先 fsm_fsm_get_state({})，然后根据 FSM 要求完成任务。"
W1, W2 = "ses_fixw1aaaa11", "ses_fixw2bbbb22"
FAILURES = []
STATE = {"root": [], "extra": {}, "gets": 0}


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


class SyntheticProtocol(http.server.BaseHTTPRequestHandler):
    """显式合成：只证明适配器协议，不模拟原生 OC 语义。"""

    def do_GET(self):
        STATE["gets"] += 1
        store = [(fx.ROOT_SESSION, STATE["root"])] + list(STATE["extra"].items())
        body = next((json.dumps(m).encode() for s, m in store
                     if self.path == "/session/%s/message" % s), None)
        if body is None:
            self.send_response(404)
            self.end_headers()
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def native_fsm_part(call_id, status="completed", input_override=None, tool=None, owner=None,
                    part_session=None):
    """cx7 实测形状（sanitized 值）：fsm part 的 metadata 仅 truncated，无 exit。"""
    owner = owner or fx.ROOT_SESSION
    stamp = call_id.replace(".", "")
    return {"info": {"id": "msg_fix" + stamp, "sessionID": owner, "role": "assistant",
                     "time": {"created": 1795115004673}},
            "parts": [{"id": "prt_fix" + stamp, "sessionID": part_session or owner, "type": "tool",
                       "callID": call_id, "tool": tool or "fsm_fsm_get_state",
                       "state": {"status": status, "input": {} if input_override is None else input_override,
                                 "output": "fixture-state-output", "metadata": {"truncated": False}}}]}


def worker_messages(echo=None, receipt=None):
    messages = [{"role": "system", "content": "worker system head (synthesized)",
                 "toolsAdded": [{"name": name} for name in fx.MAIN_TOOLS]},
                {"role": "user", "content": WORKER_TAG_PROMPT}]
    return messages + ([echo, receipt] if echo is not None else [])


def mount_env(lane):
    return dict(os.environ, CCA_NEW_LANE=str(lane), CCA_NEW_ROOT_SESSION=fx.ROOT_SESSION,
                CCA_NEW_WORKSPACE=str(lane.parent / "ws"), PYTHONDONTWRITEBYTECODE="1", PLAYBOOK2_CACHE="0")


def payload_of(messages, session):
    request = {"options": {"sessionId": session}, "context": {"messages": messages}}
    return json.dumps({"api": "openai-completions", "model": "bench-model", "request": request}).encode()


def ask(lane, messages, session=fx.ROOT_SESSION):
    """fresh mount 子进程（真实入口 new_reply.py），root 会话环境恒为 lane root。"""
    run = subprocess.run([sys.executable, str(ADAPTER / "new_reply.py")], input=payload_of(messages, session),
                         capture_output=True, env=mount_env(lane), timeout=120)
    return json.loads(run.stdout.decode("utf-8"))


def ask_bg(lane, messages, session):
    proc = subprocess.Popen([sys.executable, str(ADAPTER / "new_reply.py")], stdin=subprocess.PIPE,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=mount_env(lane))
    proc.stdin.write(payload_of(messages, session)), proc.stdin.close()
    return proc


def lock_of(lane, name):
    try:
        return json.loads((lane / "fsm-slots" / ("%s.lock" % name)).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def tape_last(lane):
    return json.loads((lane / "new-lane-tape.jsonl").read_text(encoding="utf-8").splitlines()[-1])


def fsm_result(workspace, instructions):
    const = dict(fx.const_vars(fx.ROOT_SESSION, workspace), agent_cli="opencode", agent_id="main",
                 cca_framework_home=str(workspace / "framework"), max_in_one_batch="16", para_default="2")
    return '{\n  "const_vars": %s,\n  "instructions": "%s"' % (json.dumps(const), instructions)


def chained_render(user_head, call, result_text):
    args = json.dumps(call.get("arguments") or {}, ensure_ascii=False)
    return "[User]: %s\n\n[Assistant tool call]: %s(%s)\n[Tool result]: %s" % (user_head, call["name"], args, result_text)


def summarizer_request(rendered, prior=None):
    tail = ("Here is the summary of the conversation before the <conversation> above:\n\n"
            "<prior-summary>\n%s\n</prior-summary>\n\nThe <prior-summary> summarizes everything "
            "that happened before the <conversation>. Construct a new summary that combines both." % prior) \
        if prior else "Create a new anchored summary from the conversation history within the " \
                      "<conversation> tags above so another coding agent can continue the work."
    return [SUMMARIZER_SYSTEM, {"role": "user", "content": SUMMARY_HEAD % (rendered, tail)}]


def zero_tail(prior):
    return [fx.main_system(), {"role": "user", "content": fx.MARKER},
            {"role": "assistant", "content": [{"type": "text", "text": prior}]},
            {"role": "user", "content": CONTINUE}]


def blocked_case(name, lane, extra_store, ready=True):
    """负路径：异会话获取被阻塞 → 有界观测不释放 → 锁属主不变（不等满 20s）。"""
    before = lock_of(lane, "fsm_fsm_get_state")
    STATE["extra"] = extra_store
    if not ready:
        (lane / "ready.json").rename(lane / "ready.json.hold")
    gets = STATE["gets"]
    proc = ask_bg(lane, worker_messages(), W2)
    time.sleep(1.3)
    holder = lock_of(lane, "fsm_fsm_get_state")
    proc.terminate()
    proc.wait()
    if not ready:
        (lane / "ready.json.hold").rename(lane / "ready.json")
    STATE["extra"] = {}
    check("负路径 %s: 不释放、属主不变（观测 %d 次 GET）" % (name, STATE["gets"] - gets),
          holder == before and holder is not None, "holder=%r" % (holder,))


