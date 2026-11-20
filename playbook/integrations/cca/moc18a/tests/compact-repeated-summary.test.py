#!/usr/bin/env python3
"""Repeated-summary 原生压缩回归：首次静息点之前的第二次（及第三次）summary。

真实证据（CCA_ROOT=.local/analysis-decouple/.pi/cx4/raw-requests 0001..0004）：
- 0002 首个 summary（无 <prior-summary>）铸造 genesis[s1 截断回执]；0003 零尾恢复
  正确发出 main.s2 fsm_fsm_get_state({})；0004 第二个 summary 的渲染史始于先前
  压缩之后——仅含 [User]: Continue、s2 调用与部分 [Tool result]（const_vars 完整、
  instructions 中途截断、列首 [truncated] 收尾），且携带 <prior-summary>＝上一轮
  回执原文。旧实现从 s1 全新起绑 → compact_history_drift(rendered call 0
  (fsm_fsm_get_state) diverges from the lane decision (fsm_enter_fsm))＝mock_reply_error。
- 本夹具全部输入为显式合成物（reconstructed）：私有 id/路径改写为可移植合成值，
  截断形状（部分 result + [truncated]）忠实重建，回执具体值按冻结机 expect 契约
  合成；截断回执在消费视图上的前缀闭合重建由协议显式标注
  （_reconstructed_from_truncated_render），链上存储始终是观测原文。
  与 rest 双切割回归（compact-resume.test.py）不同：本测试全程处于首个静息点
  之前（genesis 回执链），静息检查点机制不参与。

证明目标（全部经打包 new_reply.py 全 mount 路径）：
1) 第二次 summary：按 <prior-summary> 选中先前已验证 genesis 基线，重建已验证
   回执、只绑本次渲染史的新回执（不回 s1 重启）；链追加 genesis[s1,s2]（均如实
   记录截断），引用不回退；同请求传输重放幂等。
2) 零尾恢复：重放 [s1,s2] 绑定回执（截断回执经显式标注重建后满足机 handler 的
   const_vars 契约）→ 下一决策 main.s3 bash init 携带真实变量（R/W/S），与未压缩
   cold lane 逐字节一致；不重发已接受的 fsm_enter/get_state。
3) 第三次切割同机制成立（s3 部分回执 → genesis[s1,s2,s3] → 零尾恢复 = main.s4）。
4) 负路径（全新进程、PLAYBOOK2_CACHE=0）：缺链引用/坏形状 prior-summary/外链
   引用一律 fail closed 不铸造；过时引用（仍指 genesis[s1]）不得回退铸造/不得
  声称新进度：幂等答复链尾已验证引用（追加只增不减），后续零尾从链尾基线
  幂等重导下一决策（与 cold 逐字节一致）；缺关键段零尾＝不重发的诚实等待。
   genesis[s1,s2]）；渲染截断切掉 const_vars 关键段＝不绑定 → 零尾恢复显式
   compact_cut_unsupported 并点名缺失的 main.s2（缺什么报什么，不发明）。
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
    """首渲染史的部分 [Tool result]（0002 截断形状忠实重建；const_vars 完整幸存）。"""
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


def partial_state_result(workspace, cut_const_vars=False):
    """第二次 summary 渲染史里的 s2 部分 [Tool result]（0004 截断形状忠实重建）。

    const_vars 完整、instructions 中途切断（无闭引号/闭括号）；列首 [truncated] 收尾。
    cut_const_vars=True 时截断点提前到 const_vars 内部（负路径：关键段不完整）。
    """
    const = dict(fx.const_vars(fx.ROOT_SESSION, workspace),
                 agent_cli="opencode", agent_id="main",
                 cca_framework_home=str(workspace / "framework"),
                 cca_sql_path=str(workspace / "_cca_analysis" / "callgraph.db"),
                 max_in_one_batch="16", para_default="2")
    const_text = json.dumps(const, indent=2, ensure_ascii=False)
    if cut_const_vars:
        const_text = const_text[:const_text.index('"cca_workspace"') + len('"cca_workspace"')]
        return ('{\n  "available_transitions": [\n    "A_LOOP",\n    "FAILURE"\n  ],\n'
                '  "const_vars": %s' % const_text)
    return ('{\n  "available_transitions": [\n    "A_LOOP",\n    "FAILURE"\n  ],\n'
            '  "const_vars": %s,\n  "description": "init scope and enter dispatch",\n'
            '  "fsm_description": "one fast-forward Analysis pass",\n'
            '  "fsm_name": "bench-fx-CCodeAnalyze",\n'
            '  "instructions": "prepare the scope; read the prepare playbook; write intent.md "'
            % const_text)


def partial_init_result():
    """第三次 summary 渲染史里的 s3 部分 [Tool result]（{"nodes":… 完整后切断）。"""
    return '{\n  "nodes": 4,\n  "status": "ok",\n  "detail": "initial graph loaded; extern bounda'


def first_summary_request(rendered):
    return [SUMMARIZER_SYSTEM, {"role": "user", "content":
            "Here is the conversation so far:\n\n<conversation>\n%s\n[truncated]\n</conversation>\n\n"
            "Create a new anchored summary from the conversation history in the <conversation> "
            "tags above so another coding agent can continue the work." % rendered}]


def chained_summary_request(rendered, prior_receipt_text):
    """第二次及以后 summary（0004 真实形状）：<conversation> 只含压缩后新史 +
    <prior-summary> 转发上一轮回执原文。"""
    return [SUMMARIZER_SYSTEM, {"role": "user", "content":
            "Here is the conversation so far:\n\n<conversation>\n%s\n[truncated]\n</conversation>\n\n"
            "Here is the summary of the conversation before the <conversation> above:\n\n"
            "<prior-summary>\n%s\n</prior-summary>\n\n"
            "The <prior-summary> summarizes everything that happened before the <conversation>. "
            "Construct a new summary that combines both." % (rendered, prior_receipt_text)}]


def receipt_payload(text):
    try:
        value = json.loads(text)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def zero_tail(lane, receipt_text):
    return fx.ask(lane, lane_ws, [fx.main_system(), dict(MARKER),
                                  {"role": "assistant", "content": [{"type": "text", "text": receipt_text}]},
                                  {"role": "user", "content": CONTINUE}])


lane_ws = None


def main():
    global lane_ws
    base = Path(tempfile.mkdtemp(prefix="pb2-compact-repeated-"))
    workspace = base / "ws"
    workspace.mkdir()
    lane_ws = workspace
    cold, comp = fx.build_lane(base, "cold", workspace), fx.build_lane(base, "compact", workspace)
    enter_args = json.loads((cold / "entries.json").read_text(encoding="utf-8"))["analysis"]["enter_fsm"]

    # ---- 0001（真实形状）：system + user "start" → main.s1 fsm_enter ----
    first_cold, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    first_comp, _ = fx.ask(comp, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    call1 = fx.tool_call(first_cold)
    check("0001 首决策=fsm_enter main.s1 且两 lane 一致",
          bool(call1) and call1["id"] == "main.s1" and call1["name"] == "fsm_enter_fsm"
          and first_comp.get("content") == first_cold.get("content"), json.dumps(first_cold)[:160])

    # ---- 0002 第一个 summary（真实形状，无 prior-summary，截断回执）----
    rendered1 = ("[User]: start\n\n[Assistant tool call]: %s(%s)\n[Tool result]: %s"
                 % (call1["name"], json.dumps(enter_args, ensure_ascii=False),
                    partial_enter_result(workspace)))
    aux1, run1 = fx.ask(comp, workspace, first_summary_request(rendered1))
    summary1 = fx.reply_text(aux1)
    chain = fx.checkpoint_entries(comp)
    check("0002 首个 summary 合法应答并铸造 genesis[s1]",
          run1.returncode == 0 and not aux1.get("error") and bool(chain)
          and len(chain) == 1 and chain[0].get("genesis")
          and [(r["call_id"], r["result_truncated"]) for r in chain[0]["receipts"]] == [("main.s1", True)]
          and receipt_payload(summary1).get("checkpoint") == chain[0]["ref"],
          json.dumps(aux1)[:200])

    # ---- 0003 零尾恢复 → main.s2 fsm_fsm_get_state（首切割已有回归，此处为链条一环）----
    reply3, _ = zero_tail(comp, summary1)
    call2 = fx.tool_call(reply3)
    check("0003 零尾恢复=main.s2 fsm_fsm_get_state({}) 无重复 fsm_enter",
          bool(call2) and call2["id"] == "main.s2" and call2["name"] == "fsm_fsm_get_state"
          and call2.get("arguments") == {},
          json.dumps(reply3)[:200] if reply3.get("error") else "ok")

    # cold 对照：消费完整回执后推进到 s2 → s3（s3 init 命令携带真实变量）
    echo1, result1 = fx.echo_of(first_cold), fx.synthesize_receipt(call1, workspace)
    oracle_s2, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": "start"},
                                            echo1, result1])
    oracle_call2 = fx.tool_call(oracle_s2)
    echo2, result2 = fx.echo_of(reply3), fx.synthesize_receipt(oracle_call2, workspace)
    oracle_s3, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": "start"},
                                            echo1, result1, echo2, result2])
    oracle_call3 = fx.tool_call(oracle_s3)
    check("cold 对照: s3=bash init 且命令携带真实变量(R/W/S)",
          bool(oracle_call3) and oracle_call3["id"] == "main.s3" and oracle_call3["name"] == "bash"
          and fx.ROOT_SESSION in oracle_call3["arguments"]["command"]
          and str(workspace) in oracle_call3["arguments"]["command"],
          json.dumps(oracle_call3)[:160])

    # ---- 0004 第二个 summary（真实形状：<prior-summary> + 仅新史渲染 + 截断回执）----
    rendered2 = ("[User]: %s\n\n[Assistant tool call]: fsm_fsm_get_state({})\n[Tool result]: %s"
                 % (CONTINUE, partial_state_result(workspace)))
    aux2, run2 = fx.ask(comp, workspace, chained_summary_request(rendered2, summary1))
    summary2 = fx.reply_text(aux2)
    chain = fx.checkpoint_entries(comp)
    check("0004 第二个 summary: 从先前基线续绑 genesis[s1,s2] 而非回 s1 重启",
          run2.returncode == 0 and not aux2.get("error") and len(chain) == 2
          and chain[1].get("genesis")
          and [(r["call_id"], r["result_truncated"]) for r in chain[1]["receipts"]]
          == [("main.s1", True), ("main.s2", True)]
          and receipt_payload(summary2).get("checkpoint") == chain[1]["ref"]
          and chain[1]["ref"] != chain[0]["ref"],
          json.dumps(aux2)[:240])
    check("0004 链上存储=观测原文(截断如实记录, 重建标记不落链)",
          chain[1]["receipts"][1]["result"] == partial_state_result(workspace)
          and "_reconstructed_from_truncated_render" not in chain[1]["receipts"][1]["result"],
          chain[1]["receipts"][1]["result"][:100])
    aux2b, _ = fx.ask(comp, workspace, chained_summary_request(rendered2, summary1), cache="0")
    check("0004 同请求传输重放幂等(同回执, 链不增)",
          fx.reply_text(aux2b) == summary2 and len(fx.checkpoint_entries(comp)) == 2)

    # ---- 0005 第二次零尾恢复 → main.s3 bash init 携带真实变量，与 cold 逐字节一致 ----
    reply5, _ = zero_tail(comp, summary2)
    call3 = fx.tool_call(reply5)
    check("0005 零尾恢复=main.s3 bash init(真实变量), 与 cold 逐字节一致",
          reply5.get("content") == oracle_s3.get("content"),
          json.dumps(reply5)[:240] if reply5.get("error") else "ok")
    check("0005 不重发已接受动作(s2 已消费, s3 为新发)",
          bool(call3) and call3["id"] == "main.s3" and call3["name"] == "bash"
          and fx.ROOT_SESSION in call3["arguments"]["command"],
          json.dumps(call3)[:160])
    trace5 = fx.trace_rows(comp)[-1]
    check("0005 trace: restore-pending 恢复基线生效",
          trace5.get("case") == "restore-pending" and trace5.get("compact") is True
          and trace5.get("decision", {}).get("id") == "main.s3", json.dumps(trace5)[:200])

    # ---- 0006 第三次切割（同机制）：s3 部分回执 → genesis[s1,s2,s3] → 零尾=s4 ----
    rendered3 = ("[User]: %s\n\n[Assistant tool call]: bash(%s)\n[Tool result]: %s"
                 % (CONTINUE, json.dumps(oracle_call3["arguments"], ensure_ascii=False),
                    partial_init_result()))
    aux3, run3 = fx.ask(comp, workspace, chained_summary_request(rendered3, summary2))
    summary3 = fx.reply_text(aux3)
    chain = fx.checkpoint_entries(comp)
    check("0006 第三次切割同机制: genesis[s1,s2,s3]",
          run3.returncode == 0 and not aux3.get("error") and len(chain) == 3
          and [r["call_id"] for r in chain[2]["receipts"]] == ["main.s1", "main.s2", "main.s3"]
          and receipt_payload(summary3).get("checkpoint") == chain[2]["ref"],
          json.dumps(aux3)[:240])
    echo3, result3 = fx.echo_of(oracle_s3), fx.synthesize_receipt(oracle_call3, workspace)
    oracle_s4, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": "start"},
                                            echo1, result1, echo2, result2, echo3, result3])
    reply6, _ = zero_tail(comp, summary3)
    check("0006 零尾恢复=main.s4 self_check, 与 cold 逐字节一致",
          reply6.get("content") == oracle_s4.get("content")
          and bool(fx.tool_call(reply6)) and fx.tool_call(reply6)["id"] == "main.s4",
          json.dumps(reply6)[:240] if reply6.get("error") else "ok")

    # ---- 负路径 1：prior-summary 引用未知检查点（缺链引用）＝不铸造 ----
    comp2 = fx.build_lane(base, "compact-missing", workspace)
    fx.ask(comp2, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    unknown = chained_summary_request(rendered2, json.dumps(
        {"checkpoint": "0" * 64, "type": "compact-progress"}, sort_keys=True))
    bad1, _ = fx.ask(comp2, workspace, unknown)
    error1 = bad1.get("error") or {}
    check("拒绝: 未知引用=compact_checkpoint_missing 不铸造",
          error1.get("code") == "playbook_program_error"
          and "compact_checkpoint_missing" in error1.get("message", "")
          and fx.checkpoint_entries(comp2) is None, json.dumps(bad1)[:240])

    # ---- 负路径 2：prior-summary 非回执形状＝协议损坏 fail closed ----
    comp3 = fx.build_lane(base, "compact-malformed", workspace)
    fx.ask(comp3, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    malformed = chained_summary_request(rendered2, "not a receipt at all")
    bad2, _ = fx.ask(comp3, workspace, malformed)
    error2 = bad2.get("error") or {}
    check("拒绝: 坏形状 prior-summary=compact_receipt_invalid",
          error2.get("code") == "playbook_program_error"
          and "compact_receipt_invalid" in error2.get("message", ""),
          json.dumps(bad2)[:240])

    # ---- 负路径 3：外链引用（别的 lane 的回执）在本 lane 永不解析 ----
    comp4 = fx.build_lane(base, "compact-foreign", workspace)
    fx.ask(comp4, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    foreign = chained_summary_request(rendered2, summary1)
    bad3, _ = fx.ask(comp4, workspace, foreign)
    error3 = bad3.get("error") or {}
    check("拒绝: 外链回执=compact_checkpoint_missing(本 lane 无此基线)",
          error3.get("code") == "playbook_program_error"
          and "compact_checkpoint_missing" in error3.get("message", "")
          and fx.checkpoint_entries(comp4) is None, json.dumps(bad3)[:240])

    # ---- 负路径 4：过时引用（仍指 genesis[s1]）不得回退铸造/不得声称新进度 ----
    stale, _ = fx.ask(comp, workspace, chained_summary_request(rendered2, summary1), cache="0")
    stale_payload = receipt_payload(fx.reply_text(stale))
    chain = fx.checkpoint_entries(comp)
    check("过时引用不回退铸造: 幂等答复链尾引用[s1,s2,s3], 链不增(无回退分叉)",
          not stale.get("error") and len(chain) == 3
          and stale_payload.get("checkpoint") == chain[-1]["ref"]
          and [r["call_id"] for r in chain[-1]["receipts"]] == ["main.s1", "main.s2", "main.s3"],
          json.dumps(stale_payload)[:160])
    reply_stale, _ = zero_tail(comp, fx.reply_text(stale))
    check("过时引用零尾: 从链尾基线幂等重导下一决策(与 cold 逐字节一致, 不重发 s3)",
          not reply_stale.get("error") and reply_stale.get("content") == oracle_s4.get("content")
          and bool(fx.tool_call(reply_stale)) and fx.tool_call(reply_stale)["id"] == "main.s4"
          and len(fx.checkpoint_entries(comp)) == 3,
          json.dumps(reply_stale.get("content") or reply_stale.get("error"))[:240])

    # ---- 负路径 5：截断切掉 const_vars 关键段＝不绑定 s2，零尾恢复点名缺失 ----
    comp5 = fx.build_lane(base, "compact-cutvars", workspace)
    fx.ask(comp5, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    aux5a, _ = fx.ask(comp5, workspace, first_summary_request(rendered1))
    summary5a = fx.reply_text(aux5a)
    reply5a, _ = zero_tail(comp5, summary5a)
    rendered_bad = ("[User]: %s\n\n[Assistant tool call]: fsm_fsm_get_state({})\n[Tool result]: %s"
                    % (CONTINUE, partial_state_result(workspace, cut_const_vars=True)))
    aux5b, _ = fx.ask(comp5, workspace, chained_summary_request(rendered_bad, summary5a))
    summary5b = fx.reply_text(aux5b)
    chain5 = fx.checkpoint_entries(comp5)
    check("截断缺关键段: s2 不绑定(诚实前缀规则), 新条目仍只含 s1",
          not aux5b.get("error") and len(chain5) == 2
          and [r["call_id"] for r in chain5[1]["receipts"]] == ["main.s1"]
          and receipt_payload(summary5b).get("checkpoint") == chain5[1]["ref"],
          json.dumps(chain5[1]["receipts"])[:200])
    reply5c, _ = zero_tail(comp5, summary5b)
    row5c = fx.trace_rows(comp5)[-1]
    check("缺关键段的零尾: 不重发 s2(诚实等待点名缺失回执)",
          not reply5c.get("error") and fx.tool_call(reply5c) is None
          and "main.s2" in fx.reply_text(reply5c) and "not reissuing" in fx.reply_text(reply5c)
          and len(fx.checkpoint_entries(comp5)) == 2, fx.reply_text(reply5c)[:160])
    check("缺关键段的零尾: 等待行如实落 trace(wait-receipt/unavailable)",
          row5c.get("case") == "wait-receipt" and row5c.get("waiting_receipt") == "main.s2"
          and (row5c.get("receipt_transport") or {}).get("kind") == "unavailable",
          json.dumps({k: row5c.get(k) for k in ("case", "waiting_receipt", "receipt_transport")})[:200])

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
