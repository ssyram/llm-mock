#!/usr/bin/env python3
"""fsm 槽位泄漏对账回归（cx7 attempt9 0018 根因，attempt10 修复）。

fixture HTTP 仅适配器协议、不代表真实 OC：见 fsm-slot-fixture.py 标注
（"/session/<session>/message" 消息表形状 sanitized 自 cx7 捕获；fsm part
metadata 无 exit/output 键；真机由 a688 attempt10 原生验证负责）。

复现链（与 cx7 事件序同构）：root 签发 main.s2 fsm_fsm_get_state →
compaction（aux 摘要＋zero-tail）抹掉带内回执 → 锁泄漏 → 异会话 worker 首个
get_state 被阻塞 → 活体 GET 观测到唯一 completed part（session/callId/tool/
exact args 全绑定）→ 仅释放该锁 → 获取成功、回执原样透传、provenance 落带；
同会话先例（0017 形状）走既有 same-session 串行分支不释放；pending/错参/错
名/重复/异主/缺件/无 ready.json 一律不释放；一次完整 20s 超时故障面不变。
"""
import importlib.util
import json
import sys
import tempfile
import threading
import time
import http.server
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("fsm_slot_fixture", HERE / "fsm-slot-fixture.py")
sf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sf)
fx = sf.fx
W1, W2 = sf.W1, sf.W2
check, ask, ask_bg, blocked_case = sf.check, sf.ask, sf.ask_bg, sf.blocked_case
lock_of, tape_last, rich = sf.lock_of, sf.tape_last, sf.rich
fsm_result, chained_render = sf.fsm_result, sf.chained_render
summarizer_request, zero_tail = sf.summarizer_request, sf.zero_tail
worker_messages, native_fsm_part = sf.worker_messages, sf.native_fsm_part
STATE, FAILURES, SyntheticProtocol = sf.STATE, sf.FAILURES, sf.SyntheticProtocol
CONTINUE = sf.CONTINUE


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-fsm-slot-reconcile-"))
    (base / "ws").mkdir()
    ws = base / "ws"
    lane = fx.build_lane(base, "lane", ws)
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), SyntheticProtocol)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    (lane / "ready.json").write_text(json.dumps(
        {"session": fx.ROOT_SESSION, "server": "http://127.0.0.1:%d" % server.server_address[1]}),
        encoding="utf-8")

    # ============ 根因链：root 签发 → compaction 抹掉带内回执 → 泄漏 ============
    first = ask(lane, [fx.main_system(), {"role": "user", "content": "start"}])
    call1 = fx.tool_call(first)
    check("root 签发 main.s1 enter（锁含 tool/arguments 完整属主记录）",
          call1 and call1["id"] == "main.s1"
          and lock_of(lane, "fsm_enter_fsm") == rich(fx.ROOT_SESSION, "main.s1", "fsm_enter_fsm",
                                                     call1.get("arguments")))
    aux1 = ask(lane, summarizer_request(chained_render("start", call1, fsm_result(ws, "prepare the scope"))))
    reply2 = ask(lane, zero_tail(fx.reply_text(aux1)))
    call2 = fx.tool_call(reply2)
    check("root 签发 main.s2 get_state＋泄漏现场（锁=属主 root＋callId＋tool＋exact args）",
          call2 and call2["id"] == "main.s2" and call2["name"] == "fsm_fsm_get_state"
          and lock_of(lane, "fsm_fsm_get_state") == rich(fx.ROOT_SESSION, "main.s2", "fsm_fsm_get_state", {}),
          json.dumps(reply2)[:160] if reply2.get("error") else "ok")
    aux2 = ask(lane, summarizer_request(chained_render(CONTINUE, call2, fsm_result(ws, "read the handbook")),
                                        fx.reply_text(aux1)))
    reply3 = ask(lane, zero_tail(fx.reply_text(aux2)))
    check("compaction 抹掉带内回执: 后续请求无 s2 toolResult → s1/s2 锁均不释放",
          fx.tool_call(reply3) and fx.tool_call(reply3)["id"] == "main.s3"
          and lock_of(lane, "fsm_fsm_get_state")["callId"] == "main.s2"
          and lock_of(lane, "fsm_enter_fsm")["callId"] == "main.s1")

    # ============ 0017 形状：root 会话携 worker 身份＝foreign 拒绝（身份模型） ============
    # cx7 时代的 root 会话 worker 首呼在新身份模型下不再合法：root 会话永不是 worker，
    # 拒绝发生在路由层（锁逻辑前）：零 GET、锁属主不变。same-session 串行分支的
    # 锁语义覆盖由下方 0018 后的 W1 自重放案例承担（真实形状：绑定 worker 重入）。
    gets = STATE["gets"]
    rw_root = ask(lane, worker_messages(), session=fx.ROOT_SESSION)
    check("0017 形状: root 会话携 worker tag＝worker_identity_foreign 拒绝",
          rw_root.get("error", {}).get("code") == "worker_identity_foreign"
          and STATE["gets"] - gets == 0 and lock_of(lane, "fsm_fsm_get_state")["callId"] == "main.s2",
          json.dumps(rw_root)[:160])

    # ============ 0018：活体 completed 回执 → 仅释放该锁 → 获取成功 ============
    STATE["root"] = [native_fsm_part("main.s2")]
    gets = STATE["gets"]
    rw1 = ask(lane, worker_messages(), session=W1)
    rec = (tape_last(lane).get("slot_reconcile") or [{}])[0]
    check("0018 修复: 异会话 worker 首呼 get_state 成功（无 500，回执原样透传）",
          not rw1.get("error")
          and fx.tool_call(rw1) == {"type": "toolCall", "id": "w1.s1",
                                    "name": "fsm_fsm_get_state", "arguments": {}},
          json.dumps(rw1)[:160] if rw1.get("error") else "ok")
    check("0018 修复: 锁被异会话接管（w1.s1＋完整属主记录）",
          lock_of(lane, "fsm_fsm_get_state") == rich(W1, "w1.s1", "fsm_fsm_get_state", {}))
    gets_replay = STATE["gets"]
    rw_replay = ask(lane, worker_messages(), session=W1)
    check("same-session 串行: 绑定 worker 重入自身 get_state 不阻塞（零 GET、锁属主不变）",
          not rw_replay.get("error") and fx.tool_call(rw_replay)["id"] == "w1.s1"
          and STATE["gets"] - gets_replay == 0
          and lock_of(lane, "fsm_fsm_get_state") == rich(W1, "w1.s1", "fsm_fsm_get_state", {}),
          json.dumps(rw_replay)[:160] if rw_replay.get("error") else "ok")
    check("0018 provenance: released＋活体旁路（main.s2/completed/model_visible=false）＋恰一次 GET；"
          "其他属主锁（enter/main.s1 同为泄漏）原样保留",
          rec.get("outcome") == "released" and rec.get("holder", {}).get("callId") == "main.s2"
          and rec.get("provenance", {}).get("source") == "opencode-session-api"
          and rec.get("provenance", {}).get("status") == "completed"
          and rec.get("provenance", {}).get("model_visible") is False
          and STATE["gets"] - gets == 1 and lock_of(lane, "fsm_enter_fsm")["callId"] == "main.s1",
          json.dumps(rec)[:220])

    # ============ 负路径：证据不成立一律不释放（阻塞观测后终止，不等满 20s） ============
    blocked_case("pending/running 在飞", lane, {W1: [native_fsm_part("w1.s1", owner=W1, status="pending")]})
    blocked_case("exact args 不符", lane, {W1: [native_fsm_part("w1.s1", owner=W1, input_override={"x": 1})]})
    blocked_case("tool 名不符", lane, {W1: [native_fsm_part("w1.s1", owner=W1, tool="fsm_enter_fsm")]})
    blocked_case("重复 part", lane, {W1: [native_fsm_part("w1.s1", owner=W1)] * 2})
    blocked_case("异主会话 part", lane, {W1: [native_fsm_part("w1.s1", owner=W1, part_session="ses_foreign0001")]})
    blocked_case("活库缺件", lane, {})
    blocked_case("无 ready.json（传输不可得）", lane, {W1: [native_fsm_part("w1.s1", owner=W1)]}, ready=False)

    # ============ 完整 20s：故障面与 0018 原文同形（含二次有界观测） ============
    STATE["extra"] = {W1: [native_fsm_part("w1.s1", owner=W1, status="pending")]}
    gets = STATE["gets"]
    started = time.monotonic()
    faulted = ask(lane, worker_messages(), session="ses_fixw3cccc33")
    STATE["extra"] = {}
    expected = ("fsm_tool_slot_timeout: fsm_fsm_get_state held by "
                "{'session': '%s', 'callId': 'w1.s1'} over 20.0s" % W1)
    check("20s 超时不变: 异会话仍被拒（恰 2 次有界观测），故障面与 0018 同形",
          faulted.get("error") == {"status": 500, "code": "mock_fault", "message": expected}
          and 20.0 <= time.monotonic() - started <= 22.0 and STATE["gets"] - gets == 2
          and lock_of(lane, "fsm_fsm_get_state")["callId"] == "w1.s1", json.dumps(faulted)[:220])

    # ============ 带内回执释放路径不受影响 + 无争用时零观测 ============
    gets = STATE["gets"]
    receipt = {"role": "toolResult", "toolCallId": "w1.s1", "toolName": "fsm_fsm_get_state",
               "content": [{"type": "text", "text": fsm_result(ws, "read the handbook")}]}
    ask(lane, worker_messages(fx.echo_of(rw1), receipt), session=W1)
    holder = lock_of(lane, "fsm_fsm_get_state")
    clean = ask(lane, worker_messages(), session=W2)
    check("带内真实回执仍释放（w1.s1 不再持锁）且锁空闲后异会话零观测直接获取",
          (holder is None or holder.get("callId") != "w1.s1") and STATE["gets"] - gets == 0
          and not clean.get("error") and fx.tool_call(clean)["id"] == "w1.s1"
          and lock_of(lane, "fsm_fsm_get_state")["session"] == W2, "holder=%r" % (holder,))

    server.shutdown()
    print("workdir:", base)
    if FAILURES:
        print("FAILED %d checks: %s" % (len(FAILURES), ", ".join(FAILURES)))
        return 1
    import shutil
    shutil.rmtree(base, ignore_errors=True)
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
