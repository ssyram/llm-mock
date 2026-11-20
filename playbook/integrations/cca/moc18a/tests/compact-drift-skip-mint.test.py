#!/usr/bin/env python3
"""0017 漂移修复回归（mint 面）：渲染史越过已发未覆盖决策的链式铸造。

cx9 实证（raw-requests READ ONLY）：0015 截断弃绑 → 0016 活体消费 s7 派发 s8 →
0017 渲染史以 s8 agent 开头、prior 仍指 genesis[s1..s6] → 旧代码位置拉链报
compact_history_drift: rendered call 6 (agent) diverges from the lane decision (bash)。
修复＝共享最低属主回执推进不变量（详见 adapter/compact_genesis_binding.py）。
本文件证明 mint 面（夹具：compact-drift-skip-fixture.py；续行/门控面见
compact-drift-skip-gating.test.py）：
1) 0017 mint：逐枚经已验证活体回执补绑 s7（唯一 part＋name＋exact args＋属主会话
   ＋completed＋与 live-receipt-advance 记录的 output_sha256 逐字一致）＋渲染 s8
   回执 → 链追加 genesis[s1..s8]；receipt_sources 如实标注（s7=旁路 model_visible=
   False，s8=渲染史）；同请求重放幂等（链不增）。
2) 对齐：渲染史头部重渲染旧调用（s6）→ 按已验证基线尾部逐位剥离后同链幂等。
3) 负路径（全部不铸造）：活库缺 part/错名/错参/异主/pending/与已消费输出 sha 不
   一致/传输不可用/陌生调用（越出已验证进程追不上）＝铸造显式故障。
4) 过时 prior（渲染只到 s7）＝不回退铸造，幂等答复链尾引用（无回退分叉）。
5) 续行：新回执引用的零尾恢复推进下一决策，与 cold oracle 逐字节一致。
"""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
_spec = importlib.util.spec_from_file_location("compact_resume_fixture", HERE / "compact-resume-fixture.py")
fx = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fx)
_drift = importlib.util.spec_from_file_location("compact_drift_skip_fixture", HERE / "compact-drift-skip-fixture.py")
dv = importlib.util.module_from_spec(_drift)
_drift.loader.exec_module(dv)
FAILURES = []


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-compact-drift-skip-"))
    workspace = base / "ws"
    workspace.mkdir()
    server = dv.start_synthetic_server()
    port = server.server_address[1]
    cold = fx.build_lane(base, "cold", workspace)
    live = fx.build_lane(base, "live", workspace)
    dv.write_ready(live, port)

    prior7, replays = dv.build_to_0017(live, workspace)
    chain = fx.checkpoint_entries(live)
    check("0014 末链=genesis[s1..s6]+已发未覆盖 s7（0017 前置状态）",
          len(chain) == 7 and [r["call_id"] for r in chain[-1]["receipts"]]
          == ["main.s%d" % n for n in range(1, 7)]
          and chain[-1]["emitted_decisions"][-1] == {"action": "tool", "id": "main.s7"},
          json.dumps(chain[-1]["emitted_decisions"][-2:]))
    reserve_call = None
    for echo, _ in replays:
        block = (echo.get("content") or [{}])[0]
        if block.get("id") == "main.s7":
            reserve_call = block
    check("0016 前置: replays 含 main.s7 bash reserve 回显", bool(reserve_call)
          and reserve_call.get("name") == "bash", json.dumps(reserve_call or {})[:120])
    actual7 = fx.synthesize_receipt(reserve_call, workspace)["content"][0]["text"]
    dv.STATE["messages"] = [dv.native_tool_message(dv.pending_of(reserve_call), actual7)]

    oracle_next, _ = fx.ask(cold, workspace, dv.oracle_messages(replays))
    check("cold oracle: 消费 s7 真实回执后下一决策=agent 派发",
          bool(fx.tool_call(oracle_next)) and fx.tool_call(oracle_next)["name"] == "agent",
          json.dumps(oracle_next)[:160])
    reply16, _ = dv.zero_tail(live, workspace, prior7)
    call16 = fx.tool_call(reply16)
    check("0016 活体检索: 真实回执→main.s8 agent 派发(与 cold 逐字节一致)",
          not reply16.get("error") and bool(call16) and call16["id"] == "main.s8"
          and reply16.get("content") == oracle_next.get("content"),
          json.dumps(reply16)[:240] if reply16.get("error") else "ok")
    check("0016 后链不增(活体消费不铸造)", len(fx.checkpoint_entries(live)) == 7)

    rendered17 = dv.chained_render(
        dv.CONTINUE, call16, fx.synthesize_receipt(call16, workspace)["content"][0]["text"])
    req17 = dv.summary_request(rendered17, prior7)
    reply17, run17 = fx.ask(live, workspace, req17)
    chain = fx.checkpoint_entries(live)
    entry8 = chain[-1] if chain else {}
    payload17 = dv.receipt_payload(fx.reply_text(reply17))
    check("0017 mint 成功: 补绑 s7 活体回执＋渲染 s8 回执 → genesis[s1..s8]",
          run17.returncode == 0 and not reply17.get("error") and len(chain) == 8
          and [r["call_id"] for r in entry8["receipts"]] == ["main.s%d" % n for n in range(1, 9)]
          and payload17.get("checkpoint") == entry8["ref"],
          json.dumps(reply17)[:200] if reply17.get("error") else "ref=%s" % payload17.get("checkpoint", "")[:16])
    receipt7 = entry8["receipts"][6]
    check("0017 s7 补绑=活体完整输出原文(truncated=False)",
          receipt7["call_id"] == "main.s7" and receipt7["tool"] == "bash"
          and receipt7["result"] == actual7 and receipt7["result_truncated"] is False,
          json.dumps(receipt7)[:160])
    check("0017 receipt_sources 如实标注(s7=活体旁路, s8=渲染史)",
          entry8["receipt_sources"][6].get("source") == "opencode-session-api"
          and entry8["receipt_sources"][6].get("model_visible") is False
          and entry8["receipt_sources"][6].get("call_id") == "main.s7"
          and entry8["receipt_sources"][6].get("output_sha256")
          and entry8["receipt_sources"][7] == {"model_visible": True},
          json.dumps(entry8["receipt_sources"][6])[:200])
    reply17b, _ = fx.ask(live, workspace, req17)
    check("0017 同请求重放幂等(同回执, 链不增)",
          fx.reply_text(reply17b) == fx.reply_text(reply17) and len(fx.checkpoint_entries(live)) == 8)

    agent_result = fx.synthesize_receipt(call16, workspace)["content"][0]["text"]
    render_align = ("[User]: %s\n\n[Assistant tool call]: fsm_fsm_get_state({})\n[Tool result]: %s\n\n"
                    "[Assistant tool call]: %s(%s)\n[Tool result]: %s"
                    % (dv.CONTINUE, dv.state_result(workspace), call16["name"],
                       json.dumps(call16.get("arguments") or {}, ensure_ascii=False), agent_result))
    reply_a, _ = fx.ask(live, workspace, dv.summary_request(render_align, prior7))
    check("对齐: 旧调用重渲染按已验证基线尾部剥离(同链幂等, 不误绑不漂移)",
          not reply_a.get("error") and len(fx.checkpoint_entries(live)) == 8
          and dv.receipt_payload(fx.reply_text(reply_a)).get("checkpoint") == entry8["ref"],
          json.dumps(reply_a)[:200] if reply_a.get("error") else "ok")

    negatives = []
    dv.STATE["messages"] = []
    negatives.append(("absent: 活库无 s7 part → missing 拒绝",
                      fx.ask(live, workspace, req17)[0], "compact_receipt_transport_missing"))
    dv.STATE["messages"] = [dv.native_tool_message(dv.pending_of(reserve_call), actual7, tool_override="agent")]
    negatives.append(("wrong tool: part 名≠决策名 → mismatch",
                      fx.ask(live, workspace, req17)[0], "compact_receipt_transport_mismatch"))
    dv.STATE["messages"] = [dv.native_tool_message(dv.pending_of(reserve_call), actual7,
                                                   input_override={"command": "tampered"})]
    negatives.append(("wrong args: exact input 不符 → mismatch",
                      fx.ask(live, workspace, req17)[0], "compact_receipt_transport_mismatch"))
    dv.STATE["messages"] = [dv.native_tool_message(dv.pending_of(reserve_call), actual7,
                                                   part_session="ses_foreign0001")]
    negatives.append(("wrong session: 异主 part → binding 拒绝",
                      fx.ask(live, workspace, req17)[0], "compact_receipt_transport_binding"))
    dv.STATE["messages"] = [dv.native_tool_message(dv.pending_of(reserve_call), actual7, status="pending")]
    negatives.append(("pending: 回执未完成 → 不可证跳过=drift 拒绝",
                      fx.ask(live, workspace, req17)[0], "compact_history_drift"))
    dv.STATE["messages"] = [dv.native_tool_message(dv.pending_of(reserve_call),
                                                   actual7.replace('"para": 2', '"para": 9'))]
    negatives.append(("sha 不一致: 活体输出≠已消费输出(live-receipt-advance 记录) → drift 拒绝",
                      fx.ask(live, workspace, req17)[0], "compact_history_drift"))
    dv.write_ready(live, port, server="http://127.0.0.1:1")
    negatives.append(("unavailable: 传输不可用 → 不可证跳过拒绝",
                      fx.ask(live, workspace, req17)[0], "compact_receipt_transport_unavailable"))
    dv.write_ready(live, port)
    dv.STATE["messages"] = [dv.native_tool_message(dv.pending_of(reserve_call), actual7)]
    negatives.append(("陌生调用: 越出已验证进程(追不上) → missing 拒绝",
                      fx.ask(live, workspace, dv.summary_request(
                          dv.chained_render(dv.CONTINUE, dict(call16, name="write",
                                                           arguments={"path": "x.md", "content": "nope"}),
                                            "written"), prior7))[0], "compact_receipt_transport_missing"))
    for name, reply, kind in negatives:
        error = reply.get("error") or {}
        check("0017 负路径拒绝: %s" % name,
              error.get("code") == "playbook_program_error"
              and kind in error.get("message", "") and not fx.tool_call(reply),
              "msg=%s" % error.get("message", "")[:150])
    check("负路径全部不铸造(链仍 8)", len(fx.checkpoint_entries(live)) == 8)

    stale, _ = fx.ask(live, workspace, dv.summary_request(
        dv.chained_render(dv.CONTINUE, reserve_call, actual7), prior7))
    check("过时 prior: 不回退铸造(幂等答复链尾引用, 无回退分叉)",
          not stale.get("error") and len(fx.checkpoint_entries(live)) == 8
          and dv.receipt_payload(fx.reply_text(stale)).get("checkpoint") == entry8["ref"],
          json.dumps(stale)[:200] if stale.get("error") else "ok")

    oracle_next2, _ = fx.ask(cold, workspace, dv.oracle_messages(replays) + [dict(fx.echo_of(reply16)),
                              dict(fx.synthesize_receipt(call16, workspace))])
    reply18, _ = dv.zero_tail(live, workspace, fx.reply_text(reply17))
    check("0017 后续行: 从 genesis[s1..s8] 恢复推进下一决策(与 cold 逐字节一致)",
          not reply18.get("error") and reply18.get("content") == oracle_next2.get("content"),
          json.dumps(reply18)[:240] if reply18.get("error") else "ok")

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
