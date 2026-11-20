#!/usr/bin/env python3
"""cx11 attempt13 0015 精确回归：连续 root summarizer 的未签发待发机会式尾绑。

真实证据（.pi/cx11 READ ONLY）：0013 首发main.s7 reserve（s1..s7 唯一、无 s8 行）
→ 0014 summary 铸造 6084c4ba（渲染史=s6 旧调用回显→基线尾部剥离；s7 已发未覆盖
→活体 GET 恰 1 次补绑 r7）→ 0015 连续 summary（其间无 main 请求）：渲染史=s7 旧
调用+回执回显→剥离后残余待发 main.s8 只是机的确定性推导、lane 从未发射。旧尾绑
无条件 _require_emitted_slot → compact_history_drift "rendered history forces lane
decision 'main.s8' at emitted slot 7 but the lane emitted None"＝mock_reply_error
（result.json first_fault request 15）。修复＝尾绑属主判定（签发≠推导，见
adapter/compact_genesis_binding.py）：待发确在已发指纹序列正确槽位才活体检索补绑；
未签发＝不检索/不声称/不故障。

证明（全走 new_reply→mock2→playbook→adapter 真实栈；HTTP 服务为 drift-skip 夹具
的合成 opencode 会话 API 协议形状＋GET 计数，不模拟原生语义）：
- 0014 形状：s6 旧调用回显剥离＋s7 已发未覆盖活体 GET 恰 1 次补绑 → genesis[s1..s7]
  （cx10 s6 echo skip＋已发待发活体传输双保留）；
- 0015 形状：连续 summary、s7 旧调用+回执回显剥离、s8 仅推导未签发 → 真相应答：
  幂等答复链尾引用、链不增、无新回执、无 s8 活体 GET；
- 其后首个 main 零尾请求：restore-pending 首发main.s8 agent 恰一次（与 cold oracle
  逐字节一致、同请求幂等、无 GET、链稳定）；
- 负路径（仍然严格、均不铸造、无 GET）：渲染史声称未签发 s8 回执＝对齐拒绝
  （"replays as 'main.s8' but lane emitted None"）；渲染史声称机绝不会派生的陌生
  调用＝循环内跳过路径以同一不变量拒绝（"forces lane decision … emitted None"）。
"""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
_fx = importlib.util.spec_from_file_location("compact_resume_fixture", HERE / "compact-resume-fixture.py")
fx = importlib.util.module_from_spec(_fx)
_fx.loader.exec_module(fx)
_dv = importlib.util.spec_from_file_location("compact_drift_skip_fixture", HERE / "compact-drift-skip-fixture.py")
dv = importlib.util.module_from_spec(_dv)
_dv.loader.exec_module(dv)
FAILURES = []


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


_original_get = dv.SyntheticProtocol.do_GET


def _counted_get(self):
    dv.STATE["gets"] = dv.STATE.get("gets", 0) + 1
    return _original_get(self)


dv.SyntheticProtocol.do_GET = _counted_get


def gets():
    return dv.STATE.get("gets", 0)


def receipt_ref(reply):
    return dv.receipt_payload(fx.reply_text(reply)).get("checkpoint")


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-compact-unissued-"))
    workspace = base / "ws"
    workspace.mkdir()
    server = dv.start_synthetic_server()
    port = server.server_address[1]
    cold = fx.build_lane(base, "cold", workspace)
    live = fx.build_lane(base, "live", workspace)
    dv.write_ready(live, port)
    replays = []

    first, _ = fx.ask(live, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    call1 = fx.tool_call(first)
    replays.append((fx.echo_of(first), fx.synthesize_receipt(call1, workspace)))
    aux1, _ = fx.ask(live, workspace, dv.first_summary_request(
        dv.chained_render("start", call1, dv.enter_result(workspace))))
    prior = fx.reply_text(aux1)
    texts = {2: dv.state_result(workspace), 3: '{"nodes": 4, "status": "ok"}',
             4: '{"status": "ready"}', 6: dv.state_result(workspace)}
    for step in range(2, 7):
        reply, _ = dv.zero_tail(live, workspace, prior)
        call = fx.tool_call(reply)
        replays.append((fx.echo_of(reply), fx.synthesize_receipt(call, workspace)))
        result_text = texts.get(step) or json.dumps(
            {"current_state": (call.get("arguments") or {}).get("target")})
        aux, _ = fx.ask(live, workspace, dv.summary_request(
            dv.chained_render(dv.CONTINUE, call, result_text), prior))
        prior = fx.reply_text(aux)
    call6 = fx.tool_call(replays[-1][0])

    req13 = [fx.main_system(), {"role": "user", "content": fx.MARKER}, dv.echo_of_text(prior),
             dict(replays[-1][0]), dict(replays[-1][1]), {"role": "user", "content": dv.CONTINUE}]
    before = gets()
    reply13, _ = fx.ask(live, workspace, req13)
    call7 = fx.tool_call(reply13)
    row13 = fx.trace_rows(live)[-1]
    check("0013 首发main.s7 reserve(restore-pending, 无 GET, 链不增)",
          not reply13.get("error") and bool(call7) and call7["id"] == "main.s7"
          and call7["name"] == "bash" and " reserve --session " + fx.ROOT_SESSION in call7["arguments"]["command"]
          and row13.get("case") == "restore-pending" and gets() == before
          and len(fx.checkpoint_entries(live)) == 6,
          json.dumps(reply13)[:200] if reply13.get("error") else json.dumps(call7)[:160])

    actual7 = fx.synthesize_receipt(call7, workspace)["content"][0]["text"]
    dv.STATE["messages"] = [dv.native_tool_message(dv.pending_of(call7), actual7)]
    before = gets()
    aux14, _ = fx.ask(live, workspace, dv.summary_request(
        dv.chained_render(dv.CONTINUE, call6, dv.state_result(workspace)), prior))
    entries = fx.checkpoint_entries(live)
    src7 = (entries[-1].get("receipt_sources") or [{}])[-1]
    check("0014 铸造: s6 旧回显剥离+s7 已发未覆盖活体 GET 恰 1 次 → genesis[s1..s7]",
          not aux14.get("error") and len(entries) == 7 and gets() - before == 1
          and [r.get("call_id") for r in entries[-1]["receipts"]] == ["main.s%d" % i for i in range(1, 8)]
          and src7.get("model_visible") is False and src7.get("call_id") == "main.s7"
          and entries[-1]["emitted_decisions"][-1] == {"action": "tool", "id": "main.s7"},
          json.dumps(aux14)[:200] if aux14.get("error") else json.dumps(src7)[:160])
    prior14 = fx.reply_text(aux14)

    echo7, result7 = fx.echo_of(reply13), fx.synthesize_receipt(call7, workspace)
    oracle8, _ = fx.ask(cold, workspace, [fx.main_system(), {"role": "user", "content": "start"}]
                        + [dict(e) for pair in replays + [(echo7, result7)] for e in pair])
    call8 = fx.tool_call(oracle8)
    check("cold oracle: s7 回执消费后下一决策=main.s8 agent 派发",
          bool(call8) and call8["id"] == "main.s8" and call8["name"] == "agent",
          json.dumps(oracle8)[:160])

    before = gets()
    aux15, _ = fx.ask(live, workspace, dv.summary_request(
        dv.chained_render(dv.CONTINUE, call7, actual7), prior14))
    entries15 = fx.checkpoint_entries(live)
    check("0015 连续 summary: s7 旧回显剥离+s8 仅推导未签发 → 幂等真相应答(链不增/无新回执/无 GET)",
          not aux15.get("error") and len(entries15) == 7
          and [r.get("call_id") for r in entries15[-1]["receipts"]] == ["main.s%d" % i for i in range(1, 8)]
          and receipt_ref(aux15) == entries15[-1]["ref"] == receipt_ref(aux14)
          and gets() == before,
          json.dumps(aux15)[:240] if aux15.get("error") else "ref=%s" % str(receipt_ref(aux15))[:16])
    prior15 = fx.reply_text(aux15)

    agent8 = fx.synthesize_receipt(call8, workspace)["content"][0]["text"]
    before = gets()
    bad8, _ = fx.ask(live, workspace, dv.summary_request(
        dv.chained_render(dv.CONTINUE, call8, agent8), prior14))
    error8 = bad8.get("error") or {}
    check("负路径: 渲染史声称未签发 s8 回执=对齐拒绝(lane emitted None), 不铸造无 GET",
          error8.get("code") == "playbook_program_error"
          and "rendered call 7 replays as main.s8 but lane emitted None" in error8.get("message", "")
          and len(fx.checkpoint_entries(live)) == 7 and gets() == before,
          "msg=%s" % error8.get("message", "")[:180])
    badu, _ = fx.ask(live, workspace, dv.summary_request(
        dv.chained_render(dv.CONTINUE, {"id": "main.sX", "name": "fsm_exit_fsm", "arguments": {}},
                          '{"current_state": "S_default"}'), prior14))
    erroru = badu.get("error") or {}
    check("负路径: 渲染史声称陌生调用=循环内跳过拒绝(forces lane decision … emitted None)",
          erroru.get("code") == "playbook_program_error"
          and "forces lane decision 'main.s8' at emitted slot 7 but the lane emitted None"
          in erroru.get("message", "")
          and len(fx.checkpoint_entries(live)) == 7 and gets() == before,
          "msg=%s" % erroru.get("message", "")[:180])

    before = gets()
    req_next = [fx.main_system(), {"role": "user", "content": fx.MARKER},
                dv.echo_of_text(prior15), {"role": "user", "content": dv.CONTINUE}]
    reply_next, _ = fx.ask(live, workspace, req_next)
    row_next = fx.trace_rows(live)[-1]
    check("其后首个 main: restore-pending 首发main.s8 agent 恰一次(=oracle, 无 GET, 链稳定)",
          not reply_next.get("error") and reply_next.get("content") == oracle8.get("content")
          and row_next.get("case") == "restore-pending"
          and (row_next.get("decision") or {}).get("id") == "main.s8"
          and gets() == before and len(fx.checkpoint_entries(live)) == 7,
          json.dumps(reply_next)[:200] if reply_next.get("error") else "ok")
    reply_next2, _ = fx.ask(live, workspace, req_next)
    check("首发幂等: 同请求逐字节同答 s8、无二次 GET、链稳定(恰一次)",
          reply_next2.get("content") == reply_next.get("content")
          and gets() == before and len(fx.checkpoint_entries(live)) == 7,
          json.dumps(reply_next2)[:160])

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
