#!/usr/bin/env python3
"""Early-summary 原生压缩回归：任何静息点之前到达的 context-summary（可移植、自包含）。

真实证据（.pi/cx2/raw-requests 0001/0002，capture CONTEXT_LIMIT=3200）：宿主在
首个 main 静息点之前自动触发压缩——0001 应答 fsm_enter(main.s1) 后，FSM enter
的巨型 instructions 把上下文顶过阈值，0002 即原生 context-summary 请求（系统
头 "You are a context summarization agent"，会话以渲染文本内嵌，无任何工具）。
旧实现把它当"链缺失的不支持形状"，却用段 stdout 顶层 error 键应答＝协议外键
（422 playbook_program_error：program stdout 出现协议外键 error）。

证明目标（全部经打包 new_reply.py 全 mount 路径，非 aux helper 直调）：
1) 路由：该请求真实路由到 aux（tape 行 class=aux），回复是合法 assistant 回执
   ——指向 genesis 检查点（初始机快照＋按序已发决策绑定，不声称进度）。
2) 冷重放保持：压缩后 tail 若完整保留已发决策回显，恢复侧核对窗口
   （marker 之后、摘要回显之前）与已发序列一致后整段冷重放，下一决策与未压缩
   cold lane 逐字节一致；摘要回显之后的新历史正常重放；未发过任何 main 决策的
   更早 summary 同理（恢复＝初始机，下一决策＝首个决策）。进度增长后的再次
   summary 铸造新 genesis 条目（链只追加）。
3) 切割吞掉已发决策＝真实不支持形状：compact_cut_unsupported 经合法段失败通道
   传播（stderr＋非零退出→playbook_program_error 含根因），绝不重发旧决策冒充
   新进度，也绝不输出协议外键。完全吞掉（相邻 user 输入形状）在解释器协议层
   即拒（playbook_state），到不了恢复逻辑——同为合法 fail closed。
4) 坏链失败同样走合法通道（compact_checkpoint_corrupt），且消息不含旧的
   "协议外键" 形状。
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
POLL = {"role": "user", "content": "status: continue when ready"}
SUMMARIZER_SYSTEM = {"role": "system", "content": (
    "You are a context summarization agent. You are given a conversation between a user "
    "and an agent. Your goal is to produce a structured summary matching the format "
    "specified so another coding agent can continue the work.")}
FAILURES = []


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def summary_request(rendered_conversation):
    return [SUMMARIZER_SYSTEM, {"role": "user", "content":
            "Here is the conversation so far:\n\n<conversation>\n%s\n</conversation>\n\n"
            "Create a new anchored summary from the conversation history." % rendered_conversation}]


def receipt_payload(text):
    try:
        value = json.loads(text)
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def tape_classes(lane):
    path = lane / "new-lane-tape.jsonl"
    return [json.loads(line).get("class") for line in path.read_text(encoding="utf-8").splitlines()] \
        if path.exists() else []


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-compact-early-"))
    workspace = base / "ws"
    workspace.mkdir()
    cold, comp = fx.build_lane(base, "cold", workspace), fx.build_lane(base, "compact", workspace)
    prompt = json.loads((cold / "entries.json").read_text(encoding="utf-8"))["analysis"]["prompt"]

    # ---- Phase A：0001/0002 复现——首个决策后、任何静息点之前的原生 summary ----
    first_cold, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": prompt}])
    call1 = fx.tool_call(first_cold)
    check("cold 首决策=fsm_enter main.s1", bool(call1) and call1["id"] == "main.s1"
          and call1["name"] == "fsm_enter_fsm", json.dumps(first_cold)[:160])
    first_comp, _ = fx.ask(comp, workspace, [fx.main_system(), {"role": "user", "content": prompt}])
    check("compact 首决策与 cold 逐字节一致", first_comp.get("content") == first_cold.get("content"))
    check("任何静息点之前：链不存在", fx.checkpoint_entries(comp) is None)

    rendered = ("[User]: %s\n\n[Assistant tool call]: %s(%s)"
                % (prompt, call1["name"], json.dumps(call1.get("arguments"), ensure_ascii=False)))
    aux_reply, aux_run = fx.ask(comp, workspace, summary_request(rendered))
    summary1 = fx.reply_text(aux_reply)
    payload1 = receipt_payload(summary1)
    chain = fx.checkpoint_entries(comp)
    check("0002 请求真实路由到 aux", tape_classes(comp)[-1] == "aux", json.dumps(tape_classes(comp)))
    check("0002 合法 runtime 应答(非顶层 error, exit 0)",
          aux_run.returncode == 0 and not aux_reply.get("error") and bool(summary1),
          json.dumps(aux_reply)[:200])
    check("0002 回执=不透明 64hex 检查点引用",
          set(payload1) == {"type", "checkpoint"} and payload1.get("type") == "compact-progress"
          and len(payload1.get("checkpoint", "")) == 64, summary1[:120])
    check("genesis 条目: 初始机+已发决策绑定(不声称进度)",
          bool(chain) and len(chain) == 1 and chain[0].get("genesis") is True
          and chain[0]["machine"]["stage"] == "start" and chain[0]["machine"]["consumed"] == []
          and chain[0]["machine"]["serial"] == 0
          and chain[0]["emitted_decisions"] == [{"action": "tool", "id": "main.s1"}]
          and payload1.get("checkpoint") == chain[0]["ref"], json.dumps(chain[0]["emitted_decisions"]))

    aux_again, _ = fx.ask(comp, workspace, summary_request(rendered))
    check("summary 传输重放幂等(同回执, 链不增)",
          fx.reply_text(aux_again) == summary1 and len(fx.checkpoint_entries(comp)) == 1)

    echo1, result1 = fx.echo_of(first_cold), fx.synthesize_receipt(call1, workspace)
    oracle, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": prompt},
                                         echo1, result1])
    oracle_call = fx.tool_call(oracle)
    check("cold 前沿=main.s2 fsm_fsm_get_state",
          bool(oracle_call) and oracle_call["id"] == "main.s2"
          and oracle_call["name"] == "fsm_fsm_get_state", json.dumps(oracle)[:160])

    s1_echo = {"role": "assistant", "content": [{"type": "text", "text": summary1}]}
    c0 = [fx.main_system(), dict(MARKER), dict(echo1), dict(result1), dict(POLL), s1_echo, dict(POLL)]
    reply_c0, _ = fx.ask(comp, workspace, c0)
    check("C0 完整保留 tail: genesis 恢复+整段冷重放与 cold 逐字节一致",
          reply_c0.get("content") == oracle.get("content"),
          json.dumps(reply_c0)[:240] if reply_c0.get("error") else "ok")
    check("C0 真实路由到 main", tape_classes(comp)[-1] == "main")
    trace = fx.trace_rows(comp)[-1]
    check("C0 trace: floor=marker+1, 全 tail 重验证",
          trace.get("compact") is True and trace.get("compact_floor") == 2
          and trace.get("verified_call_ids") == ["main.s1"], json.dumps(trace)[:240])
    check("C0 后链仍恰一条 genesis(工具决策不落静息点)", len(fx.checkpoint_entries(comp)) == 1)
    reply_dup, _ = fx.ask(comp, workspace, c0)
    check("C0 旧形状重复(cache=0 新进程)仍同答", reply_dup.get("content") == oracle.get("content"))

    gate_c, _ = fx.ask(cold, workspace, [fx.gate_system(), {"role": "user", "content": "should we stop?"}])
    gate_x, _ = fx.ask(comp, workspace, [fx.gate_system(), {"role": "user", "content": "should we stop?"}])
    check("aux 门禁活读不受影响(两 lane 同裁决)",
          (fx.tool_call(gate_c) or {}).get("arguments") == (fx.tool_call(gate_x) or {}).get("arguments")
          and (fx.tool_call(gate_c) or {}).get("name") == "StructuredOutput",
          json.dumps(fx.tool_call(gate_x))[:160])

    # ---- Phase B：压缩后新历史正常重放；二次 summary 铸造新 genesis；部分吞掉显式故障 ----
    echo2, result2 = fx.echo_of(reply_c0), fx.synthesize_receipt(oracle_call, workspace)
    c0_ext = [fx.main_system(), dict(MARKER), dict(echo1), dict(result1), dict(POLL),
              s1_echo, dict(POLL), dict(echo2), dict(result2)]
    reply_ext, _ = fx.ask(comp, workspace, c0_ext)
    oracle3, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": prompt},
                                          echo1, result1, echo2, result2])
    check("压缩后新历史(s2)正常重放, 下一决策(s3)与 cold 逐字节一致",
          reply_ext.get("content") == oracle3.get("content"),
          json.dumps(reply_ext)[:240] if reply_ext.get("error") else "ok")

    aux2_reply, _ = fx.ask(comp, workspace, summary_request(rendered + "\n\n[Tool result]: ok"))
    summary2 = fx.reply_text(aux2_reply)
    payload2 = receipt_payload(summary2)
    chain = fx.checkpoint_entries(comp)
    check("二次 summary: 链追加新 genesis(已发决策刷新去重, 引用不同于 S1)",
          not aux2_reply.get("error") and len(chain) == 2 and chain[1].get("genesis") is True
          and chain[1]["emitted_decisions"] == [{"action": "tool", "id": "main.s%d" % n} for n in (1, 2, 3)]
          and payload2.get("checkpoint") == chain[1]["ref"]
          and payload2.get("checkpoint") != payload1.get("checkpoint"),
          json.dumps(chain[1]["emitted_decisions"]))

    oracle3_call = fx.tool_call(oracle3)
    echo3, result3 = fx.echo_of(reply_ext), fx.synthesize_receipt(oracle3_call, workspace)
    oracle4, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": prompt},
                                          echo1, result1, echo2, result2, echo3, result3])
    check("cold 前沿=main.s4 self_check",
          bool(fx.tool_call(oracle4)) and fx.tool_call(oracle4)["id"] == "main.s4"
          and fx.tool_call(oracle4)["name"] == "fsm_fsm_submit_self_check", json.dumps(oracle4)[:160])

    s2_echo = {"role": "assistant", "content": [{"type": "text", "text": summary2}]}
    c0f2 = [fx.main_system(), dict(MARKER), dict(echo1), dict(result1), dict(POLL),
            dict(echo2), dict(result2), dict(echo3), dict(result3), dict(POLL), s2_echo, dict(POLL)]
    reply_f2, _ = fx.ask(comp, workspace, c0f2)
    check("二次压缩完整保留: 恢复 genesis[s1..s3] 与 cold 逐字节一致",
          reply_f2.get("content") == oracle4.get("content"),
          json.dumps(reply_f2)[:240] if reply_f2.get("error") else "ok")

    c0_cut = [fx.main_system(), dict(MARKER), dict(echo1), dict(result1), dict(POLL),
              s2_echo, dict(POLL)]
    reply_cut, run_cut = fx.ask(comp, workspace, c0_cut)
    error = reply_cut.get("error") or {}
    check("部分吞掉(s2/s3 回显被切): compact_cut_unsupported 经 playbook_program_error 合法传播",
          error.get("code") == "playbook_program_error" and "compact_cut_unsupported" in error.get("message", "")
          and "main.s2" in error.get("message", "") and "main.s1" in error.get("message", ""),
          json.dumps(reply_cut)[:300])
    check("吞掉失败不是协议外键形状", "协议外键" not in error.get("message", ""))
    check("吞掉失败根因在 mount stderr",
          "main_step compact_cut_unsupported" in run_cut.stderr.decode("utf-8", "replace"))

    # ---- Phase C：更早的 summary——未发过任何 main 决策（零丢失历史） ----
    comp2 = fx.build_lane(base, "compact2", workspace)
    aux0_reply, _ = fx.ask(comp2, workspace, summary_request("[User]: %s" % prompt))
    summary0 = fx.reply_text(aux0_reply)
    chain0 = fx.checkpoint_entries(comp2)
    check("未发决策的 summary: genesis emitted=[]",
          not aux0_reply.get("error") and bool(chain0) and chain0[0].get("genesis") is True
          and chain0[0]["emitted_decisions"] == [], json.dumps(aux0_reply)[:200])
    s0_echo = {"role": "assistant", "content": [{"type": "text", "text": summary0}]}
    c00 = [fx.main_system(), dict(MARKER), s0_echo, dict(POLL)]
    reply_c00, _ = fx.ask(comp2, workspace, c00)
    check("C00 零丢失: 恢复初始机后下一决策=首决策(与 cold 逐字节一致)",
          reply_c00.get("content") == first_cold.get("content"),
          json.dumps(reply_c00)[:240] if reply_c00.get("error") else "ok")

    # ---- Phase D：完全吞掉＝相邻 user 输入形状，解释器协议层即拒（合法 fail closed） ----
    c0_gone = [fx.main_system(), dict(MARKER), dict(POLL), s1_echo, dict(POLL)]
    reply_gone, _ = fx.ask(comp, workspace, c0_gone)
    error_gone = reply_gone.get("error") or {}
    check("完全吞掉(相邻 user): 解释器 playbook_state 即拒(到不了恢复逻辑)",
          error_gone.get("code") == "playbook_state", json.dumps(reply_gone)[:220])

    # ---- Phase E：坏链失败走合法通道（回归协议外键 bug 本体） ----
    chain_path = comp2 / "records" / "compact-checkpoint.json"
    chain_path.write_bytes(b"{ not json")
    aux3_reply, aux3_run = fx.ask(comp2, workspace, summary_request(rendered))
    error3 = aux3_reply.get("error") or {}
    check("坏链: compact_checkpoint_corrupt 经 playbook_program_error 合法传播",
          error3.get("code") == "playbook_program_error"
          and "compact_checkpoint_corrupt" in error3.get("message", ""), json.dumps(aux3_reply)[:300])
    check("坏链失败不是协议外键形状(0002 原缺陷回归)",
          "协议外键" not in error3.get("message", "") and aux3_run.returncode == 0)
    check("坏链失败根因在 mount stderr", "aux_step compact_checkpoint_corrupt"
          in aux3_run.stderr.decode("utf-8", "replace"))

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
