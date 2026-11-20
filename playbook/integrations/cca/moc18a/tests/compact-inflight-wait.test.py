#!/usr/bin/env python3
"""cx6 在途切割回归：已交付未结算决策跨连续 compact cuts 的最小真相应答（全 mount 路径）。

真实证据（.pi/cx6 raw 0013..0016 ＋ collection/main-messages.json）：
- 0013（main，cx5 保留形状）消费 s6 迟到回执后发布 main.s7 bash reserve；宿主执行
  完成（OC 导出状态 completed、exit 0、registration.confirmed task-b114dc65…）——
  副作用已结算，但回执尚未进入任何模型请求；
- 0014/0015（aux）连续两次 summary：0014 渲染 s6 可绑（链前进 genesis[s1..s6]）；
  0015 渲染 s7 回执被截断（"batches" 永不闭合）＝不可绑，同 checkpoint 幂等重发；
- 0016（main 重问形状＝marker+摘要回执+新触发，零 s7 回显/回执）旧实现
  compact_cut_unsupported（retained 0）拒绝＝本回归目标形状。
本夹具输入为显式合成物（reconstructed）：渲染史/回执按冻结机 expect 契约合成，
形状逐字对齐实捕。证明：等待不重发副作用、不发明回执、同请求幂等；真实回执经
原生保留形状到达后恰一次消费并产出与 cold 逐字节一致的下一决策；异己/错位回执
fail closed；连续等待超限＝显式故障（同名缺失，不轮询；同请求重放不计数，
活体检索不可用＝transport_unavailable 成因区分）。
"""
import importlib.util
import json
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


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def enter_result(workspace):
    const = dict(fx.const_vars(fx.ROOT_SESSION, workspace), agent_cli="opencode", agent_id="main",
                 cca_framework_home=str(workspace / "framework"),
                 cca_sql_path=str(workspace / "_cca_analysis" / "callgraph.db"),
                 max_in_one_batch="16", para_default="2")
    return ('{\n  "const_vars": %s,\n  "instructions": "prepare the scope"' % json.dumps(const))


def state_result(workspace):
    const = dict(fx.const_vars(fx.ROOT_SESSION, workspace), agent_cli="opencode", agent_id="main",
                 cca_framework_home=str(workspace / "framework"),
                 cca_sql_path=str(workspace / "_cca_analysis" / "callgraph.db"),
                 max_in_one_batch="16", para_default="2")
    return ('{\n  "const_vars": %s,\n  "instructions": "read the handbook"' % json.dumps(const))


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


def echo_of_text(text):
    return {"role": "assistant", "content": [{"type": "text", "text": text}]}


def wait_rows(lane):
    return [row for row in fx.trace_rows(lane) if row.get("waiting_receipt")]


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-compact-inflight-"))
    workspace = base / "ws"
    workspace.mkdir()
    cold, comp = fx.build_lane(base, "cold", workspace), fx.build_lane(base, "compact", workspace)
    replays = []

    # ---- 0001 start → s1；切割1 渲染 s1 → genesis[s1] ----
    first, _ = fx.ask(comp, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    call1 = fx.tool_call(first)
    replays.append((fx.echo_of(first), fx.synthesize_receipt(call1, workspace)))
    aux1, _ = fx.ask(comp, workspace, first_summary_request(
        chained_render("start", call1, enter_result(workspace))))
    prior = fx.reply_text(aux1)
    # ---- 切割2..5：零尾首发 s2..s5，链式 summary 逐次绑定 → genesis[s1..s5] ----
    renders = [state_result(workspace), '{"nodes": 4, "status": "ok"}',
               '{"status": "ready"}', None]
    for step in range(2, 6):
        reply, _ = zero_tail(comp, workspace, prior)
        call = fx.tool_call(reply)
        check("零尾首发=main.s%d" % step, bool(call) and call["id"] == "main.s%d" % step,
              json.dumps(reply)[:160] if reply.get("error") else "ok")
        replays.append((fx.echo_of(reply), fx.synthesize_receipt(call, workspace)))
        result_text = renders[step - 2] if renders[step - 2] is not None \
            else json.dumps({"current_state": (call.get("arguments") or {}).get("target")})
        aux, _ = fx.ask(comp, workspace, summary_request(chained_render(CONTINUE, call, result_text), prior))
        prior = fx.reply_text(aux)
    # ---- 0011 零尾首发 s6（已交付）；0012 空渲染 summary → genesis[s1..s5]+已发含 s6 ----
    reply6, _ = zero_tail(comp, workspace, prior)
    call6 = fx.tool_call(reply6)
    replays.append((fx.echo_of(reply6), fx.synthesize_receipt(call6, workspace)))
    aux6, _ = fx.ask(comp, workspace, [SUMMARIZER_SYSTEM, {"role": "user", "content":
                              EMPTY_CONVERSATION % prior}])
    prior = fx.reply_text(aux6)
    # ---- 0013 cx5 保留形状：消费 s6 迟到回执 → 发布 s7 bash reserve（已交付宿主） ----
    echo6, result6 = replays[-1]
    reply7, _ = fx.ask(comp, workspace, [fx.main_system(), dict(MARKER), echo_of_text(prior),
                                         dict(echo6), dict(result6), {"role": "user", "content": CONTINUE}])
    call7 = fx.tool_call(reply7)
    check("0013 保留形状: 消费 s6 → 发布 main.s7 bash reserve(实变量)",
          bool(call7) and call7["id"] == "main.s7" and call7["name"] == "bash"
          and " reserve --session " + fx.ROOT_SESSION in call7["arguments"]["command"],
          json.dumps(reply7)[:200] if reply7.get("error") else "ok")
    replays.append((fx.echo_of(reply7), fx.synthesize_receipt(call7, workspace)))
    # ---- 0014 summary：渲染 s6 可绑 → genesis[s1..s6]+已发含 s7（cx6 0014 同型） ----
    aux7, _ = fx.ask(comp, workspace, summary_request(chained_render(CONTINUE, call6, state_result(workspace)), prior))
    prior = fx.reply_text(aux7)
    chain = fx.checkpoint_entries(comp)
    check("0014 summary: 链前进到 genesis[s1..s6]+已发含未覆盖 s7",
          len(chain) == 7 and [r["call_id"] for r in chain[-1]["receipts"]]
          == ["main.s%d" % n for n in range(1, 7)]
          and chain[-1]["emitted_decisions"][-1] == {"action": "tool", "id": "main.s7"},
          json.dumps(chain[-1]["emitted_decisions"][-2:]))
    # ---- 0015 summary：s7 回执截断（batches 不闭合）＝不可绑 → 同 checkpoint 幂等 ----
    full7 = json.dumps(json.loads(replays[-1][1]["content"][0]["text"]))
    cut7 = full7[:full7.index('"batches"') + 24]
    aux8, _ = fx.ask(comp, workspace, summary_request(chained_render(CONTINUE, call7, cut7), prior))
    prior2 = fx.reply_text(aux8)
    check("0015 截断回执不可绑: 同 checkpoint 幂等重发(链不增)",
          not aux8.get("error") and prior2 == prior
          and len(fx.checkpoint_entries(comp)) == 7,
          json.dumps(aux8)[:200] if aux8.get("error") else "ok")
    # ---- 0016 exact shape：重问形状 → 等待（不重发 reserve、不发明回执、幂等） ----
    req16 = [fx.main_system(), dict(MARKER), echo_of_text(prior), {"role": "user", "content": CONTINUE}]
    reply16, _ = fx.ask(comp, workspace, req16)
    text16 = fx.reply_text(reply16)
    check("0016 重问形状=确定性等待(无任何 toolCall＝不重发 reserve)", not reply16.get("error")
          and fx.tool_call(reply16) is None and "main.s7" in text16 and "not reissuing" in text16,
          json.dumps(reply16)[:240] if reply16.get("error") else text16[:120])
    row16 = fx.trace_rows(comp)[-1]
    check("0016 trace: case=wait-receipt 记 waiting_receipt=main.s7(不进已发序列)",
          row16.get("case") == "wait-receipt" and row16.get("waiting_receipt") == "main.s7"
          and "decision" not in row16 and "gate_verdict" in row16, json.dumps(row16)[:200])
    check("0016 链不增(不落静息点、不伪造 s7 进度)", len(fx.checkpoint_entries(comp)) == 7)
    req16b = req16 + [echo_of_text(text16), {"role": "user", "content": CONTINUE}]
    reply16b, _ = fx.ask(comp, workspace, req16b)
    reply16c, _ = fx.ask(comp, workspace, req16)
    check("同请求幂等: 累积/非累积重问逐字节同答，链稳定",
          fx.reply_text(reply16b) == text16 and fx.reply_text(reply16c) == text16
          and len(fx.checkpoint_entries(comp)) == 7,
          json.dumps(reply16b)[:200] if reply16b.get("error") else "ok")
    row16 = fx.trace_rows(comp)[-1]
    check("0016 等待行如实携带活体检索观测(unavailable=旧 lane 无 ready.json)",
          (row16.get("receipt_transport") or {}).get("kind") == "unavailable",
          json.dumps(row16.get("receipt_transport")))
    summary_echo = echo_of_text(prior)
    echo7, result7 = replays[-1]
    # ---- 负路径：错位/异己回执不推进（等待状态原样保持） ----
    for name, rid, kind in (("wrong", "main.s9", "compact_pending_receipt_mismatch"),
                            ("foreign", "worker.s1", "compact_pending_receipt_mismatch")):
        bad, _ = fx.ask(comp, workspace, [fx.main_system(), dict(MARKER), dict(summary_echo),
                                          dict(echo7), dict(result7, toolCallId=rid),
                                          {"role": "user", "content": CONTINUE}])
        error = bad.get("error") or {}
        check("拒绝: %s 回执＝%s 不推进" % (name, kind),
              error.get("code") == "playbook_program_error" and kind in error.get("message", "")
              and rid in error.get("message", "") and not fx.tool_call(bad),
              "msg=%s" % error.get("message", "")[:160])
    miss, _ = fx.ask(comp, workspace, [fx.main_system(), dict(MARKER), dict(summary_echo),
                                       dict(echo7), {"role": "user", "content": CONTINUE}])
    error_m = miss.get("error") or {}
    check("缺回执(有回显无回执)＝拒绝不推进(不重发副作用)",
          error_m.get("code") == "playbook_program_error"
          and "compact_pending_receipt_mismatch" in error_m.get("message", "")
          and "main.s7" in error_m.get("message", "") and not fx.tool_call(miss),
          "msg=%s" % error_m.get("message", "")[:180])
    check("负路径后链稳定(7 条, s7 仍未覆盖)",
          len(fx.checkpoint_entries(comp)) == 7
          and [r["call_id"] for r in fx.checkpoint_entries(comp)[-1]["receipts"]]
          == ["main.s%d" % n for n in range(1, 7)])
    # ---- 连续等待超限＝显式故障（点名缺失，不轮询；同请求重放不计数） ----
    for _ in range(5):
        replay_same, _ = fx.ask(comp, workspace, req16)
        if replay_same.get("error"):
            break
    check("同请求重复重放不计数(重放不是进度, 不触发超限)",
          not replay_same.get("error") and fx.reply_text(replay_same) == text16,
          json.dumps(replay_same)[:200] if replay_same.get("error") else "ok")
    faulted = None
    accumulated = list(req16)
    while True:
        loop, _ = fx.ask(comp, workspace, accumulated)
        if loop.get("error"):
            faulted = loop
            break
        accumulated = accumulated + [echo_of_text(text16), {"role": "user", "content": CONTINUE}]
    error_w = faulted.get("error") or {}
    check("等待超限=transport_unavailable 点名 main.s7(检索全程不可用成因区分)",
          error_w.get("code") == "playbook_program_error"
          and "compact_receipt_transport_unavailable" in error_w.get("message", "")
          and "main.s7" in error_w.get("message", ""), "msg=%s" % error_w.get("message", "")[:200])
    # ---- cold 对照＋迟到真实回执恰一次消费 → 与 cold 逐字节一致的下一决策 ----
    oracle_messages = [fx.main_system(), {"role": "user", "content": "start"}]
    for echo, receipt in replays:
        oracle_messages += [dict(echo), dict(receipt)]
    oracle_next, _ = fx.ask(cold, workspace, oracle_messages)
    check("cold 前沿=消费 s7 真实回执后的下一决策(agent 派发)",
          bool(fx.tool_call(oracle_next)) and fx.tool_call(oracle_next)["name"] == "agent",
          json.dumps(oracle_next)[:160])
    deliver = [fx.main_system(), dict(MARKER), dict(summary_echo), dict(echo7),
               dict(result7), {"role": "user", "content": CONTINUE}]
    reply_d, _ = fx.ask(comp, workspace, deliver)
    check("迟到真实回执恰一次消费: 下一决策与 cold 逐字节一致",
          not reply_d.get("error") and reply_d.get("content") == oracle_next.get("content"),
          json.dumps(reply_d)[:280] if reply_d.get("error") else "ok")
    reply_d2, _ = fx.ask(comp, workspace, deliver)
    check("消费后同请求幂等(逐字节同答, 无重复消费)",
          reply_d2.get("content") == reply_d.get("content"),
          json.dumps(reply_d2)[:200] if reply_d2.get("error") else "ok")
    check("全程无 reserve 重发: s7 之后无任何 bash reserve toolCall",
          fx.tool_call(reply_d) is not None and fx.tool_call(reply_d)["name"] == "agent")

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
