#!/usr/bin/env python3
"""0017 漂移修复回归（门控面）：进度仅在 agent 回执真实可见时推进。

cx9 实证后续形状（夹具：compact-drift-skip-fixture.py；mint 面见
compact-drift-skip-mint.test.py）。两条独立用例：
1) live2（0017 渲染只含 s8 agent 调用、无回执）：mint 机会式补绑活体已验证的 s7
   → genesis[s1..s7]+已发含 s8；续行零尾仅在 agent 回执真实可见时推进——活库
   pending＝诚实等待（不重发 s8、不发明结果）；活库 completed＝同形状请求即以真
   实回执推进，与 cold oracle 逐字节一致。
2) live3（零回执 genesis 的活体推进）：不可信渲染回执零绑定后，零尾恢复推导的
   待发决策（已发未覆盖 s1）经活体检索 completed 真实回执后推进 main.s2（与 cold
   逐字节一致，不重发非幂等 fsm_enter）；对照 compact-zero-tail 的无活体等待路径。
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


def reserve_call_of(replays):
    for echo, _ in replays:
        block = (echo.get("content") or [{}])[0]
        if block.get("id") == "main.s7":
            return block
    return None


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-compact-drift-gating-"))
    workspace = base / "ws"
    workspace.mkdir()
    server = dv.start_synthetic_server()
    port = server.server_address[1]
    cold = fx.build_lane(base, "cold", workspace)
    live2 = fx.build_lane(base, "live2", workspace)
    live3 = fx.build_lane(base, "live3", workspace)
    dv.write_ready(live2, port)
    dv.write_ready(live3, port)

    # ---- live2：0017 只渲染 s8 调用无回执 → mint 机会式补绑 s7；推进仅凭可见回执 ----
    prior7b, replaysb = dv.build_to_0017(live2, workspace)
    reserve7b = reserve_call_of(replaysb)
    actual7b = fx.synthesize_receipt(reserve7b, workspace)["content"][0]["text"]
    dv.STATE["messages"] = [dv.native_tool_message(dv.pending_of(reserve7b), actual7b)]
    reply16b, _ = dv.zero_tail(live2, workspace, prior7b)
    call16b = fx.tool_call(reply16b)
    check("live2 0016: 同轨活体推进 main.s8", bool(call16b) and call16b["id"] == "main.s8",
          json.dumps(reply16b)[:160] if reply16b.get("error") else "ok")
    reply17c, _ = fx.ask(live2, workspace, dv.summary_request(
        dv.chained_render(dv.CONTINUE, call16b), prior7b))
    chain2 = fx.checkpoint_entries(live2)
    entry7c = chain2[-1] if chain2 else {}
    check("live2 0017 无 s8 回执: 只补绑 s7 → genesis[s1..s7]+已发含 s8",
          not reply17c.get("error") and [r["call_id"] for r in entry7c["receipts"]]
          == ["main.s%d" % n for n in range(1, 8)]
          and entry7c["emitted_decisions"][-1] == {"action": "tool", "id": "main.s8"},
          json.dumps(entry7c.get("receipts") or [])[:160])
    agent_text = fx.synthesize_receipt(call16b, workspace)["content"][0]["text"]
    dv.STATE["messages"] = [dv.native_tool_message(dv.pending_of(reserve7b), actual7b),
                            dv.native_tool_message(call16b, agent_text, status="pending")]
    wait18, _ = dv.zero_tail(live2, workspace, fx.reply_text(reply17c))
    row18 = fx.trace_rows(live2)[-1]
    check("agent 回执不可见: 不推进的诚实等待(不重发 s8/不发明结果)",
          not wait18.get("error") and fx.tool_call(wait18) is None
          and "main.s8" in fx.reply_text(wait18) and "not reissuing" in fx.reply_text(wait18)
          and row18.get("case") == "wait-receipt" and row18.get("waiting_receipt") == "main.s8",
          fx.reply_text(wait18)[:140])
    dv.STATE["messages"] = [dv.native_tool_message(dv.pending_of(reserve7b), actual7b),
                            dv.native_tool_message(call16b, agent_text)]
    reply18b, _ = dv.zero_tail(live2, workspace, fx.reply_text(reply17c))
    oracle_nextb, _ = fx.ask(cold, workspace, dv.oracle_messages(replaysb)
                             + [dict(fx.echo_of(reply16b)), dict(fx.synthesize_receipt(call16b, workspace))])
    check("agent 回执可见(活库 completed): 同形状请求即推进(与 cold 逐字节一致)",
          not reply18b.get("error") and reply18b.get("content") == oracle_nextb.get("content"),
          json.dumps(reply18b)[:240] if reply18b.get("error") else "ok")

    # ---- live3：零回执 genesis 的活体推进（恢复侧待发决策推导） ----
    first3, _ = fx.ask(live3, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    call1c = fx.tool_call(first3)
    aux3c, _ = fx.ask(live3, workspace, dv.first_summary_request(dv.chained_render("start", call1c)))
    entry3c = (fx.checkpoint_entries(live3) or [{}])[0]
    check("live3 不可信回执零绑: genesis receipts=[]+已发含 s1",
          not aux3c.get("error") and (entry3c.get("receipts") or []) == []
          and entry3c.get("emitted_decisions") == [{"action": "tool", "id": "main.s1"}],
          json.dumps(entry3c)[:160])
    dv.STATE["messages"] = [dv.native_tool_message(
        dv.pending_of(call1c), fx.synthesize_receipt(call1c, workspace)["content"][0]["text"])]
    oracle3c, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": "start"},
                                          dict(fx.echo_of(first3)),
                                          dict(fx.synthesize_receipt(call1c, workspace))])
    reply3c, _ = dv.zero_tail(live3, workspace, fx.reply_text(aux3c))
    check("live3 零回执 genesis+活体 s1 completed: 推进 main.s2(与 cold 逐字节一致, 不重发 enter)",
          not reply3c.get("error") and reply3c.get("content") == oracle3c.get("content")
          and fx.tool_call(reply3c)["id"] == "main.s2",
          json.dumps(reply3c)[:240] if reply3c.get("error") else "ok")

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
