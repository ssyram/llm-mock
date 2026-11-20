#!/usr/bin/env python3
"""Delayed cross-summary receipt 回归：真实回执跨 summary 边界迟到的原生保留形状。

真实证据（CCA_ROOT=.local/analysis-decouple/.pi/cx5/raw-requests 0011→0012→0013）：
- 0011（main，4 msgs）零尾恢复首次发布 main.s6 fsm_fsm_get_state({})；
- 0012（aux）<conversation> 仅 [User]: Continue——0 渲染调用/0 回执＋<prior-summary>，
  铸造 genesis[绑定回执 s1..s5，已发含未覆盖 main.s6]；
- 0013（main，6 msgs）＝marker、新摘要回执、main.s6 原生回显、真实 toolResult
  （native 消息，非 <conversation> 渲染）、新触发——wait-receipt 特性之前在
  verify_retained 以 compact_cut_unsupported（retained 0）拒绝；现在零尾未覆盖
  决策交回 main_step 按已发身份选诚实等待（等待不重发、不发明回执）。
本夹具输入为显式合成物（reconstructed，可移植）：各次渲染回执按冻结机 expect
契约合成；0012 空渲染请求、0013 原生 tail 与 r256b 式“回显对在摘要之前”顺序
均按实捕获形状逐字重建。

两层证明（同一 mount 与 runtime 契约，每请求全新进程）：
A) 全 mount 路径（new_reply.py→mock2→main.md→main_step.py）：本仓 runtime 可表
   达的实序＝marker、原生回显对、摘要回显、新触发（r256b 式）。第六次切割（空
   渲染 summary）后下一工具与未压缩 cold lane 逐字节一致；不重发 s1..s6；同请
   求重复幂等；D 序 wrongcall/duplicate-result 亦 fail closed（回执身份绑定）。
B) handler 直驱（runtime 的 {transcript, pointer} ABI＝外接程序真实调用形状）：
   cx5 0013 实序（迟到回执在摘要回显之后）。pointer=2 walk-verbatim 幂等重导；
   pointer=3（resume）与 pointer=6（前沿）消费迟到回执后产出与 cold 逐字节一
   致的 main.s7；重复同 pointer 幂等；wrongtool＝冻结机 replay_drift 拒绝。
C) 实序全 mount（A 同一 new_reply.py→mock2→main.md 路径，但严格 cx5 0013 实序＝
   摘要回显在前、已发未结算原生回显对在后）：Main 必须完整执行挂载解释器到最终
   响应（不孤儿化、不停在 playbook_state）——回复为打包成功的 main.s7（bash
   reserve 携带实解析变量）且与 cold 逐字节一致；同请求重复幂等；wrongcall 拒绝。
   引擎层由 tests2/segment-orphan-echo.test.mjs 背书（停 user 单元时历史工具回显由
   最近 segment 接管重入；无 segment 可接管仍 playbook_state）。
负路径（全新进程）：missing（零尾点名 main.s6）/wrongcall（main.s9）/foreign
（worker.s1）/malformed（缺 toolCallId）/duplicate（整对重复）/duplicate-result
（同 id 双回执）＝fail closed，不发明回执、不消费异己结果。
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ADAPTER_DIR = HERE.parent / "adapter"
sys.path.insert(0, str(ADAPTER_DIR))
_spec = importlib.util.spec_from_file_location("compact_resume_fixture", HERE / "compact-resume-fixture.py")
fx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fx)

MARKER = {"role": "user", "content": fx.MARKER}
CONTINUE = ("Continue if you have next steps, or stop and ask for clarification "
            "if you are unsure how to proceed.")
SUMMARIZER_SYSTEM = {"role": "system", "content": (
    "You are a context summarization agent. You are given a conversation between a user "
    "and an agent. Your goal is to produce a structured summary matching the format "
    "specified so another coding agent can continue the work.")}
EMPTY_CONVERSATION_0012 = (
    "Here is the conversation so far:\n\n<conversation>\n[User]: %s\n</conversation>\n\n"
    "Here is the summary of the conversation before the <conversation> above:\n\n"
    "<prior-summary>\n%s\n</prior-summary>\n\n"
    "The <prior-summary> summarizes everything that happened before the <conversation>. "
    "Construct a new summary that combines both. The <prior-summary> is discarded after "
    "this: anything you do not carry into the new summary is lost.\n\n"
    "When combining:\n- Carry forward objectives, constraints, user directives, decisions, "
    "and parallel workstreams from the <prior-summary> even when the <conversation> does "
    "not mention them. Drop only what is finished and no longer needed.\n"
    "- The <conversation> is more recent than the <prior-summary>. Where they conflict, "
    "the conversation wins: state the corrected fact and drop the old claim.\n"
    "- Add new progress, decisions, constraints, and context from the conversation.\n"
    "- Move completed work from \"Active\" to \"Completed\".\n"
    "- If a blocker has been resolved, update the summary to reflect that while keeping "
    "any details still needed to continue.\n"
    "- Update \"Objective\" and \"Next Move\" to reflect the current work state.\n\n"
    "Output exactly the Markdown structure shown inside <template> and keep the section "
    "order unchanged. Do not include the <template> tags in your response.\n"
    "<template>\n## Objective\n- [one or two brief sentences describing what the user is "
    "trying to accomplish]\n\n## Important Details\n- [constraints/preferences, decisions "
    "and why, important facts/assumptions, exact context needed to continue, or \"(none)\"]\n"
    "\n## Work State\n### Completed\n- [finished work, verified facts, or changes made; "
    "otherwise \"(none)\"]\n\n### Active\n- [current work, partial changes, or investigation "
    "state; otherwise \"(none)\"]\n\n### Blocked\n- [blockers, failing commands, or unknowns; "
    "otherwise \"(none)\"]\n\n## Next Move\n1. [immediate concrete action, or \"(none)\"]\n"
    "2. [next action if known, or \"(none)\"]\n\n## Relevant Files\n- [file or directory "
    "path: why it matters, or \"(none)\"]\n</template>\n\nRules:\n- Keep every section, even "
    "when empty.\n- Use terse bullets, not prose paragraphs.\n- Preserve exact file paths, "
    "symbols, commands, error strings, URLs, and identifiers when known.\n- Do not mention "
    "the summary process or that context was compacted.")
FAILURES = []


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def partial_enter_result(workspace):
    const = dict(fx.const_vars(fx.ROOT_SESSION, workspace), agent_cli="opencode", agent_id="main",
                 cca_framework_home=str(workspace / "framework"),
                 cca_sql_path=str(workspace / "_cca_analysis" / "callgraph.db"),
                 max_in_one_batch="16", para_default="2")
    return ('{\n  "available_transitions": [\n    "A_LOOP",\n    "FAILURE"\n  ],\n'
            '  "const_vars": %s,\n  "description": "init scope and enter dispatch",\n'
            '  "fsm_description": "one fast-forward Analysis pass",\n'
            '  "fsm_name": "bench-fx-CCodeAnalyze",\n'
            '  "instructions": "prepare the scope; first call fsm_fsm_get_state({}) and bind '
            'R/W/S from const_vars; then read the prepare playbook and"'
            % json.dumps(const, indent=2, ensure_ascii=False))


def partial_state_result(workspace):
    const = dict(fx.const_vars(fx.ROOT_SESSION, workspace), agent_cli="opencode", agent_id="main",
                 cca_framework_home=str(workspace / "framework"),
                 cca_sql_path=str(workspace / "_cca_analysis" / "callgraph.db"),
                 max_in_one_batch="16", para_default="2")
    return ('{\n  "available_transitions": [\n    "A_LOOP",\n    "FAILURE"\n  ],\n'
            '  "const_vars": %s,\n  "description": "init scope and enter dispatch",\n'
            '  "fsm_description": "one fast-forward Analysis pass",\n'
            '  "fsm_name": "bench-fx-CCodeAnalyze",\n'
            '  "instructions": "prepare the scope; read the prepare playbook; write intent.md "'
            % json.dumps(const, indent=2, ensure_ascii=False))


def first_summary_request(rendered):
    return [SUMMARIZER_SYSTEM, {"role": "user", "content":
            "Here is the conversation so far:\n\n<conversation>\n%s\n[truncated]\n</conversation>\n\n"
            "Create a new anchored summary from the conversation history in the <conversation> "
            "tags above so another coding agent can continue the work." % rendered}]


def chained_summary_request(rendered, prior_receipt_text):
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


def zero_tail(lane, workspace, receipt_text):
    return fx.ask(lane, workspace, [fx.main_system(), dict(MARKER),
                                    {"role": "assistant", "content": [{"type": "text", "text": receipt_text}]},
                                    {"role": "user", "content": CONTINUE}])


def receipt_payload(text):
    try:
        value = json.loads(text)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def ask_main_step(lane, workspace, messages, pointer):
    """handler 直驱：runtime 外接程序真实调用形状（{transcript, pointer} ABI）。"""
    payload = {"api": "openai-completions", "model": "bench-model",
               "request": {"options": {"sessionId": fx.ROOT_SESSION},
                           "context": {"messages": messages}}}
    directory = Path(tempfile.mkdtemp(prefix="pb2-handler-"))
    transcript = directory / "transcript.json"
    transcript.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    env = dict(os.environ, CCA_NEW_LANE=str(lane), CCA_NEW_ROOT_SESSION=fx.ROOT_SESSION,
               CCA_NEW_WORKSPACE=str(workspace), PYTHONDONTWRITEBYTECODE="1")
    run = subprocess.run([sys.executable, str(ADAPTER_DIR / "main_step.py")],
                         input=json.dumps({"transcript": str(transcript), "pointer": pointer}).encode(),
                         capture_output=True, env=env, timeout=180)
    if run.returncode == 0:
        return json.loads(run.stdout.decode("utf-8")), run
    return {"error": {"code": "playbook_program_error",
                      "message": run.stderr.decode("utf-8", "replace")}}, run


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-compact-delayed-"))
    workspace = base / "ws"
    workspace.mkdir()
    cold, comp = fx.build_lane(base, "cold", workspace), fx.build_lane(base, "compact", workspace)
    enter_args = json.loads((cold / "entries.json").read_text(encoding="utf-8"))["analysis"]["enter_fsm"]

    # ---- 0001：start → main.s1 fsm_enter_fsm ----
    first, _ = fx.ask(comp, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    call1 = fx.tool_call(first)
    check("0001 首决策=main.s1 fsm_enter_fsm", bool(call1) and call1["id"] == "main.s1"
          and call1["name"] == "fsm_enter_fsm", json.dumps(first)[:160])
    replays = [(fx.echo_of(first), fx.synthesize_receipt(call1, workspace))]

    # ---- 切割1（0002 实形）：渲染史含 s1 截断回执 → genesis[s1] ----
    aux1, _ = fx.ask(comp, workspace, first_summary_request(
        chained_render("start", call1, partial_enter_result(workspace))))
    summary1 = fx.reply_text(aux1)
    chain = fx.checkpoint_entries(comp)
    check("切割1 铸造 genesis[s1](截断如实记录)", not aux1.get("error") and len(chain) == 1
          and [(r["call_id"], r["result_truncated"]) for r in chain[0]["receipts"]] == [("main.s1", True)]
          and receipt_payload(summary1).get("checkpoint") == chain[0]["ref"], json.dumps(aux1)[:200])

    # ---- 切割2..5：零尾恢复逐次推进 s2→s5，链式 summary 只绑新回执 ----
    renders = [partial_state_result(workspace), '{"nodes": 4, "status": "ok"}',
               '{"status": "ready"}', None]
    prior_summary = summary1
    for step in range(2, 6):
        reply, _ = zero_tail(comp, workspace, prior_summary)
        call = fx.tool_call(reply)
        check("切割%d 零尾恢复=main.s%d (%s)" % (step - 1, step, call["name"] if call else "?"),
              bool(call) and call["id"] == "main.s%d" % step,
              json.dumps(reply)[:200] if reply.get("error") else "ok")
        replays.append((fx.echo_of(reply), fx.synthesize_receipt(call, workspace)))
        result_text = renders[step - 2] if renders[step - 2] is not None \
            else json.dumps({"current_state": (call.get("arguments") or {}).get("target")})
        aux, _ = fx.ask(comp, workspace, chained_summary_request(
            chained_render(CONTINUE, call, result_text), prior_summary))
        prior_summary = fx.reply_text(aux)
    chain = fx.checkpoint_entries(comp)
    check("切割2..5 链式铸造: genesis[s1..s5] 引用前进", len(chain) == 5
          and [r["call_id"] for r in chain[-1]["receipts"]] == ["main.s%d" % n for n in range(1, 6)]
          and receipt_payload(prior_summary).get("checkpoint") == chain[-1]["ref"],
          json.dumps([r["call_id"] for r in chain[-1]["receipts"]]))

    # ---- 0011 实形：零尾恢复首次发布 main.s6（已交付宿主，回执未落地）----
    reply6, _ = zero_tail(comp, workspace, prior_summary)
    call6 = fx.tool_call(reply6)
    check("0011 零尾恢复=main.s6 fsm_fsm_get_state({}) 首次发布", bool(call6)
          and call6["id"] == "main.s6" and call6["name"] == "fsm_fsm_get_state"
          and call6.get("arguments") == {},
          json.dumps(reply6)[:200] if reply6.get("error") else "ok")
    replays.append((fx.echo_of(reply6), fx.synthesize_receipt(call6, workspace)))

    # ---- 0012 实形：空 <conversation>（0 调用/0 回执）＋<prior-summary> ----
    aux6, run6 = fx.ask(comp, workspace, [SUMMARIZER_SYSTEM, {"role": "user", "content":
                              EMPTY_CONVERSATION_0012 % (CONTINUE, prior_summary)}])
    summary6 = fx.reply_text(aux6)
    chain = fx.checkpoint_entries(comp)
    check("0012 空渲染 summary: genesis[s1..s5]+已发含未覆盖 main.s6",
          run6.returncode == 0 and not aux6.get("error") and len(chain) == 6
          and [r["call_id"] for r in chain[5]["receipts"]] == ["main.s%d" % n for n in range(1, 6)]
          and chain[5]["emitted_decisions"][-1] == {"action": "tool", "id": "main.s6"}
          and receipt_payload(summary6).get("checkpoint") == chain[5]["ref"]
          and chain[5]["ref"] != chain[4]["ref"],
          json.dumps(chain[5]["emitted_decisions"][-2:]) if len(chain) == 6 else "chain")

    # ---- cold 对照：消费 s1..s6 全部真实回执后的下一决策 ----
    oracle_messages = [fx.main_system(), {"role": "user", "content": "start"}]
    for echo, receipt in replays:
        oracle_messages += [dict(echo), dict(receipt)]
    oracle_s7, _ = fx.ask(cold, workspace, oracle_messages)
    oracle_call7 = fx.tool_call(oracle_s7)
    check("cold 前沿=main.s7（消费 s6 回执后的同点新决策）", bool(oracle_call7)
          and oracle_call7["id"] == "main.s7", json.dumps(oracle_s7)[:200])

    echo6, result6 = replays[-1]
    summary_echo = {"role": "assistant", "content": [{"type": "text", "text": summary6}]}
    trigger = {"role": "user", "content": CONTINUE}

    # ---- A) 全 mount 路径（本仓 runtime 可表达的 r256b 式实序：回显对在摘要前）----
    req13d = [fx.main_system(), dict(MARKER), dict(echo6), dict(result6),
              dict(summary_echo), dict(trigger)]
    reply13, _ = fx.ask(comp, workspace, req13d)
    check("A-0013 迟到回执消费: 下一工具与 cold 逐字节一致（第六次切割后=cold 同点）",
          not reply13.get("error") and reply13.get("content") == oracle_s7.get("content"),
          json.dumps(reply13)[:280] if reply13.get("error") else "ok")
    call13 = fx.tool_call(reply13)
    check("A-0013 不重发已交付决策(s1..s6)，新决策=main.s7", bool(call13)
          and call13["id"] == "main.s7", json.dumps(call13)[:160] if call13 else "none")
    trace13 = fx.trace_rows(comp)[-1]
    check("A-0013 trace: 压缩恢复生效且决策=main.s7", trace13.get("compact") is True
          and trace13.get("decision", {}).get("id") == "main.s7", json.dumps(trace13)[:220])
    check("A-0013 后链不增(不落静息点、不伪造 s6 进度)", len(fx.checkpoint_entries(comp)) == 6
          and [r["call_id"] for r in fx.checkpoint_entries(comp)[5]["receipts"]]
          == ["main.s%d" % n for n in range(1, 6)])
    reply13b, _ = fx.ask(comp, workspace, req13d)
    check("A-0013 同请求重复幂等(逐字节同答, 链不增)",
          reply13b.get("content") == reply13.get("content")
          and len(fx.checkpoint_entries(comp)) == 6,
          json.dumps(reply13b)[:200] if reply13b.get("error") else "ok")

    # ---- B) handler 直驱：cx5 0013 实序（迟到回执在摘要回显之后）----
    req13c = [fx.main_system(), dict(MARKER), dict(summary_echo), dict(echo6),
              dict(result6), dict(trigger)]
    walk2, run_w2 = ask_main_step(comp, workspace, req13c, 2)
    check("B-pointer2 walk-verbatim 幂等重导摘要回显",
          run_w2.returncode == 0 and walk2.get("result") == "idle"
          and walk2.get("values", {}).get("idle_text") == summary6,
          json.dumps(walk2)[:200])
    resume3, run_r3 = ask_main_step(comp, workspace, req13c, 3)
    check("B-pointer3 resume: 消费迟到回执→main.s7 与 cold 逐字节一致",
          run_r3.returncode == 0 and resume3.get("assistant", {}).get("content")
          == oracle_s7.get("content") and resume3.get("pointer") == 6,
          json.dumps(resume3)[:280])
    frontier6, run_f6 = ask_main_step(comp, workspace, req13c, 6)
    check("B-pointer6 前沿: 同点同答(逐字节一致, 无重复推进)",
          run_f6.returncode == 0 and frontier6.get("assistant", {}).get("content")
          == oracle_s7.get("content") and "pointer" not in frontier6,
          json.dumps(frontier6)[:280])
    resume3b, _ = ask_main_step(comp, workspace, req13c, 3)
    check("B-pointer3 重复同请求幂等(全新进程逐字节同答)",
          resume3b.get("assistant", {}).get("content") == resume3.get("assistant", {}).get("content")
          and len(fx.checkpoint_entries(comp)) == 6)
    check("B 后链不增(serial 恰一次推进由冷对照逐字节一致性背书)",
          len(fx.checkpoint_entries(comp)) == 6)

    # ---- C) cx5 0013 实序全 mount：迟到回执在摘要回显之后，Main 必须完整执行到最终响应 ----
    # （fx.ask＝全新 new_reply.py 进程，PLAYBOOK2_CACHE=0；引擎在摘要回显验证后停 user 单元，
    #   已发未结算的 main.s6 原生回显由最近 segment 接管重入，绝不允许 playbook_state 孤儿化）
    req13e = [fx.main_system(), dict(MARKER), dict(summary_echo), dict(echo6),
              dict(result6), dict(trigger)]
    reply13e, run13e = fx.ask(comp, workspace, req13e)
    call13e = fx.tool_call(reply13e)
    check("C-0013 实序全 mount: 打包响应成功且与 cold 逐字节一致(main.s7)",
          run13e.returncode == 0 and not reply13e.get("error")
          and reply13e.get("stopReason") == "toolUse"
          and reply13e.get("content") == oracle_s7.get("content"),
          json.dumps(reply13e)[:280] if reply13e.get("error") else "ok")
    check("C-0013 main.s7 reserve 携带实解析变量(会话+真实 workspace 路径)",
          bool(call13e) and call13e["id"] == "main.s7" and call13e["name"] == "bash"
          and (" reserve --session " + fx.ROOT_SESSION) in call13e["arguments"]["command"]
          and str(workspace) in call13e["arguments"]["command"],
          json.dumps(call13e)[:220] if call13e else "none")
    trace13e = fx.trace_rows(comp)[-1]
    check("C-0013 trace: 压缩恢复 resume(pointer=3) 且决策=main.s7",
          trace13e.get("compact") is True and trace13e.get("case") == "resume"
          and trace13e.get("pointer") == 3
          and trace13e.get("decision", {}).get("id") == "main.s7", json.dumps(trace13e)[:240])
    check("C-0013 后链不增(不落静息点、不伪造 s6 进度)",
          len(fx.checkpoint_entries(comp)) == 6
          and [r["call_id"] for r in fx.checkpoint_entries(comp)[5]["receipts"]]
          == ["main.s%d" % n for n in range(1, 6)])
    reply13e2, _ = fx.ask(comp, workspace, req13e)
    check("C-0013 同请求重复幂等(逐字节同答, 链不增)",
          reply13e2.get("content") == reply13e.get("content")
          and len(fx.checkpoint_entries(comp)) == 6,
          json.dumps(reply13e2)[:200] if reply13e2.get("error") else "ok")
    refuse13e, _ = fx.ask(comp, workspace, [fx.main_system(), dict(MARKER), dict(summary_echo),
                                            dict(echo6), dict(result6, toolCallId="main.s9"),
                                            dict(trigger)])
    code13e, msg13e = (refuse13e.get("error") or {}).get("code", ""), \
        (refuse13e.get("error") or {}).get("message", "")
    check("拒绝: C序 wrongcall(实序全 mount 回执 id=main.s9)＝回执身份不匹配",
          code13e == "playbook_program_error" and "compact_pending_receipt_mismatch" in msg13e
          and "main.s9" in msg13e and not fx.tool_call(refuse13e),
          "code=%s msg=%s" % (code13e, msg13e[:220]))

    # ---- 负路径（全新进程，均 fail closed）----
    def expect_mount_refusal(name, messages, kinds, must_name):
        reply, run = fx.ask(comp, workspace, messages)
        code, message = (reply.get("error") or {}).get("code", ""), \
            (reply.get("error") or {}).get("message", "")
        check(name, code == "playbook_program_error" and any(k in message for k in kinds)
              and must_name in message and not fx.tool_call(reply),
              "code=%s msg=%s" % (code, message[:220]))

    reply_missing, _ = fx.ask(comp, workspace,
                              [fx.main_system(), dict(MARKER), dict(summary_echo), dict(trigger)])
    check("零尾未覆盖 s6＝诚实等待(wait-receipt, 不重发不发明; 活体检索不可用如实标注)",
          not reply_missing.get("error") and fx.tool_call(reply_missing) is None
          and "main.s6" in fx.reply_text(reply_missing)
          and "not reissuing" in fx.reply_text(reply_missing)
          and (fx.trace_rows(comp)[-1].get("waiting_receipt") == "main.s6"),
          fx.reply_text(reply_missing)[:160] if not reply_missing.get("error")
          else json.dumps(reply_missing)[:200])

    expect_mount_refusal("拒绝: cx5序 wrongcall(回执 id=main.s9)＝回执身份不匹配",
                         [fx.main_system(), dict(MARKER), dict(summary_echo), dict(echo6),
                          dict(result6, toolCallId="main.s9"), dict(trigger)],
                         ["compact_pending_receipt_mismatch"], "main.s9")
    expect_mount_refusal("拒绝: D序 wrongcall(回执 id=main.s9)＝回执身份不匹配",
                         [fx.main_system(), dict(MARKER), dict(echo6),
                          dict(result6, toolCallId="main.s9"), dict(summary_echo), dict(trigger)],
                         ["compact_pending_receipt_mismatch"], "main.s9")
    expect_mount_refusal("拒绝: foreign(回执 id=worker.s1)＝异己回执拒绝",
                         [fx.main_system(), dict(MARKER), dict(summary_echo), dict(echo6),
                          dict(result6, toolCallId="worker.s1"), dict(trigger)],
                         ["compact_pending_receipt_mismatch"], "worker.s1")
    malformed = {"role": "toolResult", "toolName": "fsm_fsm_get_state",
                 "content": [{"type": "text", "text": json.dumps({"const_vars": fx.const_vars(
                     fx.ROOT_SESSION, workspace)})}]}
    expect_mount_refusal("拒绝: malformed(回执缺 toolCallId)",
                         [fx.main_system(), dict(MARKER), dict(summary_echo), dict(echo6),
                          dict(malformed), dict(trigger)],
                         ["compact_pending_receipt_mismatch"], "main.s6")
    expect_mount_refusal("拒绝: duplicate(回显+回执整对重复)",
                         [fx.main_system(), dict(MARKER), dict(summary_echo), dict(echo6),
                          dict(result6), dict(echo6), dict(result6), dict(trigger)],
                         ["compact_pending_receipt_mismatch"], "main.s6")
    expect_mount_refusal("拒绝: cx5序 duplicate-result(同 id 双回执)",
                         [fx.main_system(), dict(MARKER), dict(summary_echo), dict(echo6),
                          dict(result6), dict(result6), dict(trigger)],
                         ["compact_pending_receipt_mismatch"], "main.s6")
    expect_mount_refusal("拒绝: D序 duplicate-result(同 id 双回执)",
                         [fx.main_system(), dict(MARKER), dict(echo6), dict(result6),
                          dict(result6), dict(summary_echo), dict(trigger)],
                         ["compact_pending_receipt_mismatch"], "main.s6")
    wrongtool = {"role": "assistant", "content": [{"type": "toolCall", "id": "main.s6",
                                                  "name": "fsm_fsm_submit_self_check",
                                                  "arguments": {"target": "A_LOOP", "checks": []}}]}
    reply, run = ask_main_step(comp, workspace, [fx.main_system(), dict(MARKER), dict(summary_echo),
                                                 wrongtool, dict(result6), dict(trigger)], 3)
    check("拒绝: wrongtool(回显同 id 异工具)＝冻结机契约拒绝(fail closed)",
          run.returncode == 3 and "missing_tool_result" in run.stderr.decode("utf-8", "replace")
          and "main.s6" in run.stderr.decode("utf-8", "replace"),
          run.stderr.decode("utf-8", "replace")[:220])
    reply, run = ask_main_step(comp, workspace, [fx.main_system(), dict(MARKER), dict(summary_echo),
                                                 dict(echo6), dict(result6, toolCallId="main.s9"),
                                                 dict(trigger)], 3)
    check("拒绝: B序 wrongcall(handler 层)＝回执身份不匹配",
          run.returncode == 3 and "compact_pending_receipt_mismatch" in run.stderr.decode("utf-8", "replace"),
          run.stderr.decode("utf-8", "replace")[:220])

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
