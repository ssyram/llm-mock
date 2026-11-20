#!/usr/bin/env python3
"""cx13 attempt15 0022 精确回归：root 链式铸造跨等待交叉（compact_history_drift）。

真实证据（CCA_ROOT=.local/analysis-decouple/.pi/cx13，READ ONLY 未改动）：
root s1..s9 全真实工具无重复（s8=agent 派发 w1、s9=bash reserve bench-analysis-r2）；
handler-trace 行16＝walk-verbatim 文本（压缩回执重导，非机步进），行17＝s9 frontier；
0022＝链式 summary（prior=6ba4b5e5 receipts[s1..s8]，渲染史仅 s9 调用+完整回执）
→ aux 铸造 replay_receipts 只重放回执：s8 回执消费后机进入 idle 等待（batches 空、
need_reserve=False、active=1）→ bind 首分支 compact_history_drift "rendered call 8
arrives where the lane would emit a non-tool decision"（result.json first_fault
request 22）。宿主真实签发 s9 的因果前提＝压缩事件（main_step 重放保留摘要回显
→ script.compacted()→need_reserve→SQL 权威再对账；operation 编号 r2 佐证）。
异步 worker 在 root summary 时仍在途（native_execution_incomplete children:1），
不得从 modelissued agent 调用假定完成。

证明（全走 new_reply→mock2→playbook→adapter 真实栈；回执按冻结机 expect 契约
合成，真实闭环来自产品命令；活体服务为合成 OC 会话 API 协议形状＋GET 计数）：
- 正路径：prior[s1..s8]→s9 精确回执→summary 绑定 s1..s9 铸造新链；其后首个 main
  首发下一验证进度 s10 reserve r3；再次链式铸造 s1..s10（重放跨 s8→s9 等待交叉）。
- 负路径（均不推进、不铸造）：textwait（空会话 summary 于等待点，派生未签发→
  不检索不声称）；更改实收据（expect 契约拒→前缀弃绑→幂等旧引用）；错会话
  （worker_identity_unknown）；渲染未签发调用（已发槽位活体不可证＝drift 拒绝）。
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
CX13_PLAN = {"bench-analysis-r1": (["w1"], 1), "bench-analysis-r2": ([], 1), "bench-analysis-r3": ([], 0)}


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


def reserve_command(operation, workspace):
    return ("python3 \"$CCV_HOME/scripts/cca_state.py\" reserve --session %s --agent main "
            "--workspace %s --phase:analysis --operation %s" % (fx.ROOT_SESSION, workspace, operation))


def ask_foreign(lane, workspace, messages, session):
    """真实 lane 条件：CCA_NEW_ROOT_SESSION 恒为本 lane root，仅请求 sessionId 外会话。"""
    import os
    import subprocess
    env = dict(os.environ, CCA_NEW_LANE=str(lane), CCA_NEW_ROOT_SESSION=fx.ROOT_SESSION,
               CCA_NEW_WORKSPACE=str(workspace), PYTHONDONTWRITEBYTECODE="1", PLAYBOOK2_CACHE="0")
    payload = {"api": "openai-completions", "model": "bench-model",
               "request": {"options": {"sessionId": session},
                           "context": {"messages": messages}}}
    run = subprocess.run([sys.executable, str(HERE.parent / "adapter" / "new_reply.py")],
                         input=json.dumps(payload, ensure_ascii=False).encode(),
                         capture_output=True, env=env, timeout=180)
    try:
        return json.loads(run.stdout.decode("utf-8")), run
    except ValueError:
        return {"error": {"code": "bad_mount_stdout",
                          "message": run.stdout.decode("utf-8", "replace")[:300]}}, run


def main():
    fx.RESERVE_PLAN.update(CX13_PLAN)
    base = Path(tempfile.mkdtemp(prefix="pb2-compact-rootwait-"))
    workspace = base / "ws"
    workspace.mkdir()
    server = dv.start_synthetic_server()
    live = fx.build_lane(base, "live", workspace)
    dv.write_ready(live, server.server_address[1])
    replays = []

    def publish(reply):
        call = fx.tool_call(reply)
        if call is not None:
            replays.append((fx.echo_of(reply), fx.synthesize_receipt(call, workspace)))
        return call

    def result_text(index=-1):
        return replays[index][1]["content"][0]["text"]

    first, _ = fx.ask(live, workspace, [fx.main_system(), {"role": "user", "content": "start"}])
    aux, _ = fx.ask(live, workspace, dv.first_summary_request(
        dv.chained_render("start", publish(first), dv.enter_result(workspace))))
    prior = fx.reply_text(aux)
    for _ in range(2, 7):
        reply, _ = dv.zero_tail(live, workspace, prior)
        aux, _ = fx.ask(live, workspace, dv.summary_request(
            dv.chained_render(dv.CONTINUE, publish(reply), result_text()), prior))
        prior = fx.reply_text(aux)
    echo6, result6 = replays[-1]
    reply7, _ = fx.ask(live, workspace, [fx.main_system(), {"role": "user", "content": fx.MARKER},
                                         dv.echo_of_text(prior), dict(echo6), dict(result6),
                                         {"role": "user", "content": dv.CONTINUE}])
    call7 = publish(reply7)
    check("s7=reserve r1(单批 w1,active=1)", bool(call7) and call7["id"] == "main.s7"
          and call7["name"] == "bash"
          and call7["arguments"]["command"] == reserve_command("bench-analysis-r1", workspace),
          json.dumps(call7)[:160] if call7 else json.dumps(reply7)[:160])
    aux7, _ = fx.ask(live, workspace, dv.summary_request(
        dv.chained_render(dv.CONTINUE, call7, result_text()), prior))
    prior7 = fx.reply_text(aux7)
    reply8, _ = dv.zero_tail(live, workspace, prior7)
    call8 = publish(reply8)
    check("s8=agent 派发 w1(异步在途)", bool(call8) and call8["id"] == "main.s8"
          and call8["name"] == "agent", json.dumps(call8)[:160] if call8 else json.dumps(reply8)[:160])
    aux8, _ = fx.ask(live, workspace, dv.summary_request(
        dv.chained_render(dv.CONTINUE, call8, result_text()), prior7))
    prior8 = fx.reply_text(aux8)
    entries8 = fx.checkpoint_entries(live)

    before = gets()
    aux_wait, _ = fx.ask(live, workspace, dv.empty_conversation_request(prior8))
    check("textwait: 等待点空会话 summary 不推进(不铸造/无 GET/幂等旧引用)",
          not aux_wait.get("error") and len(fx.checkpoint_entries(live)) == len(entries8) == 8
          and receipt_ref(aux_wait) == entries8[-1]["ref"] and gets() == before,
          json.dumps(aux_wait)[:200] if aux_wait.get("error") else "ref ok")

    reply9, _ = dv.zero_tail(live, workspace, prior8)
    call9 = publish(reply9)
    r2_command = reserve_command("bench-analysis-r2", workspace)
    check("s9=reserve r2(压缩回执重放→SQL 再对账,=cx13 行17 前沿)", bool(call9)
          and call9["id"] == "main.s9" and call9["name"] == "bash"
          and call9["arguments"]["command"] == r2_command,
          json.dumps(call9)[:180] if call9 else json.dumps(reply9)[:200])

    before = gets()
    aux_bad, _ = fx.ask(live, workspace, dv.summary_request(
        dv.chained_render(dv.CONTINUE, call9, '{"status": "ok"}'), prior8))
    entries_bad = fx.checkpoint_entries(live)

    def receipt_progress():
        return [r.get("call_id") for e in entries_bad for r in (e.get("receipts") or [])]

    check("neg: 更改实收据(缺 batches)=expect 拒→前缀弃绑非推进(无 s9 回执进度)",
          not aux_bad.get("error") and "main.s9" not in receipt_progress()
          and all('{"status": "ok"}' not in (r.get("result") or "")
                  for e in entries_bad for r in (e.get("receipts") or []))
          and receipt_ref(aux_bad) == entries_bad[-1]["ref"] and gets() == before,
          json.dumps(aux_bad)[:220] if aux_bad.get("error") else "ref ok")
    aux_foreign, _ = ask_foreign(live, workspace, dv.summary_request(
        dv.chained_render(dv.CONTINUE, call9, result_text()), prior8), "ses_otherroot9999")
    error_f = aux_foreign.get("error") or {}
    check("neg: 错会话 summary=worker_identity_unknown 不铸造(无回执进度)",
          error_f.get("code") == "playbook_program_error"
          and "worker_identity_unknown" in error_f.get("message", "")
          and [r.get("call_id") for r in fx.checkpoint_entries(live)[-1]["receipts"]]
          == ["main.s%d" % i for i in range(1, 9)],
          "msg=%s" % error_f.get("message", "")[:160])
    before = gets()
    aux_unissued, _ = fx.ask(live, workspace, dv.summary_request(
        dv.chained_render(dv.CONTINUE, {"id": "main.sX", "name": "fsm_exit_fsm", "arguments": {}},
                          '{"current_state": "S_default"}'), prior8))
    error_u = aux_unissued.get("error") or {}
    check("neg: 渲染未签发调用=已发槽位活体无 part 完整性拒绝(恰 1 GET, 无回执进度)",
          error_u.get("code") == "playbook_program_error"
          and "compact_receipt_transport_missing" in error_u.get("message", "")
          and gets() - before == 1
          and [r.get("call_id") for r in fx.checkpoint_entries(live)[-1]["receipts"]]
          == ["main.s%d" % i for i in range(1, 9)],
          "msg=%s" % error_u.get("message", "")[:180])

    count_before_pos = len(fx.checkpoint_entries(live))
    aux22, _ = fx.ask(live, workspace, dv.summary_request(
        dv.chained_render(dv.CONTINUE, call9, result_text()), prior8))
    entries22 = fx.checkpoint_entries(live)
    check("pos: 0022 形状(prior[s1..s8]→s9 精确回执)绑定 s1..s9 铸造新链",
          not aux22.get("error") and len(entries22) == count_before_pos + 1
          and [r.get("call_id") for r in entries22[-1]["receipts"]] == ["main.s%d" % i for i in range(1, 10)]
          and entries22[-1]["receipts"][-1]["result"] == result_text()
          and entries22[-1]["emitted_decisions"][-1] == {"action": "tool", "id": "main.s9"}
          and receipt_ref(aux22) == entries22[-1]["ref"],
          json.dumps(aux22)[:240] if aux22.get("error") else "ref=%s" % str(receipt_ref(aux22))[:16])
    prior9 = fx.reply_text(aux22)

    reply10, _ = dv.zero_tail(live, workspace, prior9)
    call10 = fx.tool_call(reply10)
    check("下一 main 首发下一验证进度 s10=reserve r3", bool(call10)
          and call10["id"] == "main.s10" and call10["name"] == "bash"
          and call10["arguments"]["command"] == reserve_command("bench-analysis-r3", workspace)
          and len(fx.checkpoint_entries(live)) == len(entries22),
          json.dumps(reply10)[:200] if reply10.get("error") else json.dumps(call10)[:180])
    publish(reply10)
    if fx.tool_call(reply10) is not None:
        aux10, _ = fx.ask(live, workspace, dv.summary_request(
            dv.chained_render(dv.CONTINUE, fx.tool_call(reply10), result_text()), prior9))
        entries10 = fx.checkpoint_entries(live)
        check("二次链式铸造 s1..s10(重放跨 s8→s9 等待交叉不再 drift)",
              not aux10.get("error") and len(entries10) == len(entries22) + 1
              and [r.get("call_id") for r in entries10[-1]["receipts"]] == ["main.s%d" % i for i in range(1, 11)]
              and receipt_ref(aux10) == entries10[-1]["ref"],
              json.dumps(aux10)[:240] if aux10.get("error") else "ref=%s" % str(receipt_ref(aux10))[:16])
    else:
        check("二次链式铸造 s1..s10(重放跨 s8→s9 等待交叉不再 drift)", False, "s10 未签发(前序失败级联)")

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
