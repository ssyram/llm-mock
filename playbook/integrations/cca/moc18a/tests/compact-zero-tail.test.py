#!/usr/bin/env python3
"""Zero-tail 原生压缩回归：真实 0001/0002 形状 + 原生零尾 0003（可移植、自包含）。

真实证据（CCA_ROOT=.local/analysis-decouple/.pi/cx3/raw-requests，r256c 保留）：
- 0001＝system+user("start") → main.s1 fsm_enter_fsm；0002＝原生自动 summary 请求
  （summarizer system + 单条 user：渲染史含 [Assistant tool call] 全量实参与
  [Tool result] 部分文本——宿主在 instructions 中途以列首 [truncated] 截断，
  const_vars 完整幸存）；0003＝system + marker user("What did we do so far?") +
  assistant 回执回显 + 合成续行 user("Continue if you have next steps, or stop and
  ask for clarification if you are unsure how to proceed.")，零 main 回显、零回执
  （任何静息点之前 head 全被吞）。
- 本夹具全部输入为显式合成物（reconstructed）：私有 id（会话/路径/FSM 名）改写为
  可移植合成值；渲染史的截断形状（部分 result + [truncated]）忠实重建；回执具体
  值按冻结机 expect 契约合成。真实闭环中回执来自产品 FSM 工具。

证明目标（全部经打包 new_reply.py 全 mount 路径）：
1) 0002（aux）：解析确定性渲染史框架，绑定真实回执（issued≠success：有回执才绑
   进度；截断如实记录）；回执载荷仍是不透明本地检查点引用，不内嵌 transcript。
2) 0003（main，零尾）：恢复＝初始机+绑定回执确定性重放，下一决策与未压缩 cold
   lane 逐字节一致（main.s2 fsm_fsm_get_state）；非幂等的 fsm_enter 不被重发。
3) 后续请求（echo+回执在场）：pending 语义与 serial/stage/call 身份延续，仍与
   cold 逐字节一致。
4) 负路径：渲染回执不满足机契约（缺 const_vars）＝铸造即拒；链上回执被篡改
   （ref 重算自洽）＝恢复即拒；渲染史无回执＋零尾＝不重发非幂等决策的诚实
   等待（已发未覆盖交活体检索/等待路径：无活体证据＝等待不推进，绝不重发
   fsm_enter 冒充新进度；等待行如实落 trace）。
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
_state_spec = importlib.util.spec_from_file_location("compact_state", ADAPTER_DIR / "compact_state.py")
cs = importlib.util.module_from_spec(_state_spec)
_state_spec.loader.exec_module(cs)

MARKER = {"role": "user", "content": fx.MARKER}
CONTINUE = ("Continue if you have next steps, or stop and ask for clarification "
            "if you are unsure how to proceed.")
SUMMARIZER_SYSTEM = {"role": "system", "content": (
    "You are a context summarization agent. You are given a conversation between a user "
    "and an agent. Your goal is to produce a structured summary matching the format "
    "specified so another coding agent can continue the work.")}
FAILURES = []


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def partial_enter_result(workspace):
    """渲染史里的部分 [Tool result]（真实 0002 截断形状的忠实重建）。

    const_vars 完整（幸存部分）；instructions 在字符串中途被切断（无闭引号/闭括号），
    由列首 [truncated] 收尾——绑定的是观测原文，机器 enter 契约 /"const_vars"/ 可满足。
    """
    const = dict(fx.const_vars(fx.ROOT_SESSION, workspace),
                 agent_cli="opencode", agent_id="main",
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


def summary_request(rendered):
    return [SUMMARIZER_SYSTEM, {"role": "user", "content":
            "Here is the conversation so far:\n\n<conversation>\n%s\n[truncated]\n</conversation>\n\n"
            "Create a new anchored summary from the conversation history in the <conversation> "
            "tags above so another coding agent can continue the work." % rendered}]


def receipt_payload(text):
    try:
        value = json.loads(text)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-compact-zero-"))
    workspace = base / "ws"
    workspace.mkdir()
    cold, comp = fx.build_lane(base, "cold", workspace), fx.build_lane(base, "compact", workspace)
    enter_args = json.loads((cold / "entries.json").read_text(encoding="utf-8"))["analysis"]["enter_fsm"]

    # ---- 0001（真实形状）：system + user "start" → main.s1 fsm_enter ----
    first_cold, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    first_comp, _ = fx.ask(comp, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    call1 = fx.tool_call(first_cold)
    check("0001 cold 首决策=fsm_enter main.s1", bool(call1) and call1["id"] == "main.s1"
          and call1["name"] == "fsm_enter_fsm", json.dumps(first_cold)[:160])
    check("0001 compact 与 cold 逐字节一致", first_comp.get("content") == first_cold.get("content"))
    check("0001 实参=部署 enter_fsm（真实全量实参可复现）", call1.get("arguments") == enter_args,
          json.dumps(call1.get("arguments"))[:120])

    # ---- 0002（真实形状）：渲染史含全量实参 + 部分回执 + [truncated] ----
    rendered = ("[User]: start\n\n[Assistant tool call]: %s(%s)\n[Tool result]: %s"
                % (call1["name"], json.dumps(enter_args, ensure_ascii=False),
                   partial_enter_result(workspace)))
    aux_reply, aux_run = fx.ask(comp, workspace, summary_request(rendered))
    summary1 = fx.reply_text(aux_reply)
    payload1 = receipt_payload(summary1)
    chain = fx.checkpoint_entries(comp)
    check("0002 合法 runtime 应答(非顶层 error, exit 0)",
          aux_run.returncode == 0 and not aux_reply.get("error") and bool(summary1),
          json.dumps(aux_reply)[:200])
    check("0002 回执=不透明本地引用(不含 transcript/进度权限)",
          set(payload1) == {"type", "checkpoint"} and payload1.get("type") == "compact-progress"
          and len(payload1.get("checkpoint", "")) == 64, summary1[:120])
    entry0 = chain[0] if chain else {}
    check("genesis 链恰一条且引用一致", bool(chain) and len(chain) == 1
          and payload1.get("checkpoint") == entry0.get("ref"))
    receipt0 = (entry0.get("receipts") or [{}])[0]
    check("绑定回执=真实观测(call_id/tool/全量实参)",
          receipt0.get("call_id") == "main.s1" and receipt0.get("tool") == "fsm_enter_fsm"
          and receipt0.get("arguments") == enter_args, json.dumps(receipt0)[:160])
    check("绑定回执内容=渲染史部分回执原文且截断如实记录",
          receipt0.get("result_truncated") is True
          and '"const_vars"' in (receipt0.get("result") or "")
          and '"session_id": "ses_compactfixturemain"' in (receipt0.get("result") or "")
          and receipt0.get("result") == partial_enter_result(workspace),
          (receipt0.get("result") or "")[:120])
    check("genesis 机仍为初始(进度只在回执里)",
          entry0.get("machine", {}).get("stage") == "start"
          and entry0.get("machine", {}).get("consumed") == []
          and entry0.get("machine", {}).get("serial") == 0
          and entry0.get("emitted_decisions") == [{"action": "tool", "id": "main.s1"}])

    aux_again, _ = fx.ask(comp, workspace, summary_request(rendered))
    check("0002 传输重放幂等(同回执, 链不增)",
          fx.reply_text(aux_again) == summary1 and len(fx.checkpoint_entries(comp)) == 1)

    # ---- cold 前沿（未压缩对照）：consume 完整回执后 → main.s2 get_state ----
    echo1, result1 = fx.echo_of(first_cold), fx.synthesize_receipt(call1, workspace)
    oracle, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": "start"},
                                         echo1, result1])
    oracle_call = fx.tool_call(oracle)
    check("cold 前沿=main.s2 fsm_fsm_get_state", bool(oracle_call)
          and oracle_call["id"] == "main.s2" and oracle_call["name"] == "fsm_fsm_get_state",
          json.dumps(oracle)[:160])

    # ---- 0003（真实零尾形状）：marker + 回执回显 + 合成续行 user，零回显零回执 ----
    s1_echo = {"role": "assistant", "content": [{"type": "text", "text": summary1}]}
    c1 = [fx.main_system(), dict(MARKER), s1_echo, {"role": "user", "content": CONTINUE}]
    reply_c1, run_c1 = fx.ask(comp, workspace, c1)
    check("0003 零尾恢复与 cold 逐字节一致(下一工具转移)",
          reply_c1.get("content") == oracle.get("content"),
          json.dumps(reply_c1)[:300] if reply_c1.get("error") else "ok")
    check("0003 不重发非幂等 fsm_enter(身份推进到 main.s2)",
          bool(fx.tool_call(reply_c1)) and fx.tool_call(reply_c1)["id"] == "main.s2"
          and fx.tool_call(reply_c1)["name"] == "fsm_fsm_get_state")
    trace = fx.trace_rows(comp)[-1]
    check("0003 trace: 恢复基线生效(case/compact)", trace.get("compact") is True
          and trace.get("compact_floor") == 2, json.dumps(trace)[:240])
    check("0003 后链不增(工具决策不落静息点)", len(fx.checkpoint_entries(comp)) == 1)

    # ---- 0004（续行）：pending 决策回显+回执在场 → serial/stage 身份延续 ----
    echo2, result2 = fx.echo_of(reply_c1), fx.synthesize_receipt(oracle_call, workspace)
    c1b = [fx.main_system(), dict(MARKER), s1_echo, {"role": "user", "content": CONTINUE},
           echo2, result2]
    reply_c1b, _ = fx.ask(comp, workspace, c1b)
    oracle2, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": "start"},
                                          echo1, result1, echo2, result2])
    check("0004 回显+回执在场: 恢复重放仍与 cold 逐字节一致(main.s3)",
          reply_c1b.get("content") == oracle2.get("content"),
          json.dumps(reply_c1b)[:300] if reply_c1b.get("error") else "ok")
    check("0004 身份推进(bash init, prepare 阶段)", bool(fx.tool_call(reply_c1b))
          and fx.tool_call(reply_c1b)["id"] == "main.s3"
          and fx.tool_call(reply_c1b)["name"] == "bash"
          and " init " in fx.tool_call(reply_c1b).get("arguments", {}).get("command", ""))

    # ---- 负路径 1：渲染回执不满足机契约（缺 const_vars）＝不绑定，零尾不可推进 ----
    comp3 = fx.build_lane(base, "compact3", workspace)
    fx.ask(comp3, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    bad = ("[User]: start\n\n[Assistant tool call]: %s(%s)\n[Tool result]: %s"
           % (call1["name"], json.dumps(enter_args, ensure_ascii=False), '{"status": "nope"}'))
    bad_reply, _ = fx.ask(comp3, workspace, summary_request(bad))
    bad_summary = fx.reply_text(bad_reply)
    bad_chain = fx.checkpoint_entries(comp3) or []
    check("不可信回执不绑定(receipts=[], 回执仍为不透明引用)",
          not bad_reply.get("error") and len(bad_chain) == 1
          and (bad_chain[0].get("receipts") or []) == []
          and receipt_payload(bad_summary).get("checkpoint") == bad_chain[0].get("ref"),
          json.dumps(bad_chain[0].get("receipts") if bad_chain else None)[:200])
    s3_echo = {"role": "assistant", "content": [{"type": "text", "text": bad_summary}]}
    reply3, _ = fx.ask(comp3, workspace, [fx.main_system(), dict(MARKER), s3_echo,
                                          {"role": "user", "content": CONTINUE}], cache="0")
    row3 = fx.trace_rows(comp3)[-1]
    check("不可信回执零尾: 不重发 fsm_enter(诚实等待, 非重发非伪造)",
          not reply3.get("error") and fx.tool_call(reply3) is None
          and "main.s1" in fx.reply_text(reply3) and "not reissuing" in fx.reply_text(reply3)
          and len(fx.checkpoint_entries(comp3)) == 1, fx.reply_text(reply3)[:160])
    check("不可信回执零尾: 等待行如实落 trace(wait-receipt/unavailable)",
          row3.get("case") == "wait-receipt" and row3.get("waiting_receipt") == "main.s1"
          and (row3.get("receipt_transport") or {}).get("kind") == "unavailable",
          json.dumps({k: row3.get(k) for k in ("case", "waiting_receipt", "receipt_transport")})[:200])

    # ---- 负路径 2：链上绑定回执被篡改（ref 重算自洽）＝恢复重放即拒 ----
    chain_path = comp / "records" / "compact-checkpoint.json"
    original = chain_path.read_bytes()
    document = json.loads(original)
    document["entries"][0]["receipts"][0]["result"] = '{"available_transitions": []}'
    document["entries"][0]["ref"] = cs.entry_ref(document["entries"][0])
    chain_path.write_bytes(json.dumps(document, ensure_ascii=False).encode())
    s_bad = {"role": "assistant", "content": [{"type": "text", "text": json.dumps(
        {"type": "compact-progress", "checkpoint": document["entries"][0]["ref"]}, sort_keys=True)}]}
    reply_bad, _ = fx.ask(comp, workspace, [fx.main_system(), dict(MARKER), s_bad,
                                            {"role": "user", "content": CONTINUE}], cache="0")
    error_bad = reply_bad.get("error") or {}
    check("拒绝: 篡改回执无法通过恢复重放(expected_success_rejected)",
          error_bad.get("code") == "playbook_program_error"
          and "expected_success_rejected" in error_bad.get("message", ""),
          json.dumps(reply_bad)[:300])
    chain_path.write_bytes(original)
    reply_ok, _ = fx.ask(comp, workspace, c1, cache="0")
    check("恢复原链后 0003 仍同答", reply_ok.get("content") == oracle.get("content"))

    # ---- 负路径 3：渲染史无回执 + 零尾＝显式不支持（缺的正是回执，不伪造） ----
    comp4 = fx.build_lane(base, "compact4", workspace)
    fx.ask(comp4, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    no_result = ("[User]: start\n\n[Assistant tool call]: %s(%s)"
                 % (call1["name"], json.dumps(enter_args, ensure_ascii=False)))
    aux4, _ = fx.ask(comp4, workspace, summary_request(no_result))
    summary4 = fx.reply_text(aux4)
    s4_echo = {"role": "assistant", "content": [{"type": "text", "text": summary4}]}
    reply4, _ = fx.ask(comp4, workspace, [fx.main_system(), dict(MARKER), s4_echo,
                                          {"role": "user", "content": CONTINUE}], cache="0")
    row4 = fx.trace_rows(comp4)[-1]
    check("无绑定回执零尾: 不重发 fsm_enter(诚实等待, 缺的正是回执)",
          not reply4.get("error") and fx.tool_call(reply4) is None
          and "main.s1" in fx.reply_text(reply4) and "not reissuing" in fx.reply_text(reply4)
          and len(fx.checkpoint_entries(comp4)) == 1, fx.reply_text(reply4)[:160])
    check("无绑定回执零尾: 等待行如实落 trace(wait-receipt/unavailable)",
          row4.get("case") == "wait-receipt" and row4.get("waiting_receipt") == "main.s1"
          and (row4.get("receipt_transport") or {}).get("kind") == "unavailable",
          json.dumps({k: row4.get(k) for k in ("case", "waiting_receipt", "receipt_transport")})[:200])

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
