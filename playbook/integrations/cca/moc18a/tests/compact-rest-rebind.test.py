#!/usr/bin/env python3
"""r256c 末 worker 回程回归：同文本静息回显 × 更新 own 链条目绑定。

真实证据（CCA_ROOT=.local/analysis-decouple/.pi/npr/r256c，READ ONLY 未改动）：
w47（ses_e073b7f11ffeFQDuNB60iUaBiO，task-83275abc961c585f574c7fb7）于
1795175003.432 终态；宿主 1795175003.811 投递 agent_notification 合成 user part
并追加 subagents 状态；Main 循环被唤醒（opencode.log 11:43:23.82 loop step=0），
003878 建请求、11:43:24.37 流式；mock 回 waiting(active=1)、门裁
wait_for_async_work、循环退出，至 1795175584 死等 577s。原始请求体无 dump
（CCA_NEW_DUMP_DIR 未启用）＝超时唯一成因不可证。已证不稳类：entry28
（serial100）与 entry32（serial113）静息文本同指纹 waiting(active=1)，仅按
≤基线指纹跳过会把基线后同文本静息回显当基线前噪声，重建暴露于静默欠推导。
本测按同形状合成（reconstructed）验证绑定语义：绑定条件全在 own 链与保留尾
自身（全链身份校验、serial 严格晚于锚且 ≤ 尾内已见调用 serial、静息指纹恰
等于回显 canon）；命中＝装配机自身已验证真值，未命中/无证据＝不推进。

harness 协议（真实 OC 形状）：一 user 一回复；回合结束（纯 say）后的下一
请求必须先追加真实新 user 事件，绝不重发同一请求；相邻 user 由 lane 边界
合并（new_reply.coalesce_user_messages）。worker 回程各投递恰一次。
"""
import importlib.util
import json
import re
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ADAPTER = HERE.parent / "adapter"
sys.path.insert(0, str(HERE))
from cca_scripts_path import cca_scripts  # noqa: E402  (loud failure without an explicit CCA root)
import os  # noqa: E402
os.environ.setdefault("CCA_NEW_CCA_HOME", str(cca_scripts().parent))
sys.path.insert(0, str(ADAPTER))
_fx = importlib.util.spec_from_file_location("compact_resume_fixture", HERE / "compact-resume-fixture.py")
fx = importlib.util.module_from_spec(_fx)
_fx.loader.exec_module(fx)
_rc = importlib.util.spec_from_file_location("compact_receipt", ADAPTER / "compact_receipt.py")
rc = importlib.util.module_from_spec(_rc)
_rc.loader.exec_module(rc)
FAILURES = []
SERIAL_OF_CALL = re.compile(r"\.s(\d+)$")


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def ask(lane, workspace, messages, strict=False):
    reply, run = fx.ask(lane, workspace, messages)
    if strict and reply.get("error"):
        raise AssertionError("mount fault: %s | %s" % (json.dumps(reply, ensure_ascii=False)[:300],
                                                       run.stderr.decode()[-300:]))
    return reply


def serial_evidence(tail):
    best = 0
    for message in tail:
        for block in (message.get("content") or []) if message.get("role") == "assistant" else []:
            if isinstance(block, dict) and block.get("type") == "toolCall":
                found = SERIAL_OF_CALL.search(str(block.get("id") or ""))
                if found:
                    best = max(best, int(found.group(1)))
    return best


def wait_say(reply):
    return fx.tool_call(reply) is None and fx.reply_text(reply).startswith("waiting")


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-rest-rebind-"))
    workspace = base / "ws"
    workspace.mkdir()
    lane = fx.build_lane(base, "lane", workspace)
    prompt = json.loads((lane / "entries.json").read_text(encoding="utf-8"))["analysis"]["prompt"]
    hist = [{"role": "user", "content": prompt}]
    waits = []
    for _ in range(160):
        reply = ask(lane, workspace, [fx.main_system()] + hist, strict=True)
        call = fx.tool_call(reply)
        hist.append(fx.echo_of(reply))
        if call is not None:
            hist.append(fx.synthesize_receipt(call, workspace))
            continue
        text = fx.reply_text(reply)
        if not text.startswith("waiting"):
            raise AssertionError("unexpected say: %r" % text[:120])
        waits.append(text)
        if len(waits) == 3:
            break
        hist.append(fx.worker_return("w%d" % len(waits)))
    check("cold 三个静息点且后两个同文本(指纹相撞 a=1)",
          len(waits) == 3 and "active=2)" in waits[0] and waits[1] == waits[2]
          and waits[1].rstrip().endswith("active=1)"), waits)
    chain = fx.checkpoint_entries(lane)
    if len(waits) != 3 or not chain or len(chain) != 3:
        check("own 链恰三条静息条目", False, [e["machine"]["serial"] for e in (chain or [])])
        return finish()
    anchor, newer = chain[1], chain[2]
    check("锚=analysis a=1 静息，更新=eqclass a=1 静息且 serial 严格晚",
          anchor["machine"]["phase"] == "analysis" and newer["machine"]["phase"] == "eqclass"
          and anchor["machine"]["serial"] < newer["machine"]["serial"]
          and anchor["rest"]["waiting_text_sha256"] == newer["rest"]["waiting_text_sha256"],
          "serial %s→%s" % (anchor["machine"]["serial"], newer["machine"]["serial"]))
    if FAILURES:
        return finish()

    final_notif = fx.worker_return("w3")
    hist.append(json.loads(json.dumps(final_notif)))
    cold_reply = ask(lane, workspace, [fx.main_system()] + hist, strict=True)
    cold_call = fx.tool_call(cold_reply)
    hist.append(fx.echo_of(cold_reply))
    if cold_call is not None:
        hist.append(fx.synthesize_receipt(cold_call, workspace))
    check("cold 前沿＝下一真实 eq 门命令(bench-eqclass-r5)",
          bool(cold_call) and "bench-eqclass-r5" in cold_call["arguments"].get("command", ""),
          json.dumps(cold_reply.get("error") or cold_call, ensure_ascii=False)[:200])

    anchor_wait_idx = next(i for i, m in enumerate(hist) if m.get("role") == "assistant"
                           and (m.get("content") or [{}])[0].get("text") == waits[1])
    tail_end = next(i for i, m in enumerate(hist) if m.get("role") == "user"
                    and m.get("content") == final_notif["content"])
    tail = hist[anchor_wait_idx:tail_end]
    evidence = serial_evidence(tail)
    check("保留尾止于更新静息回显且含 ≥ 其 serial 的调用证据",
          tail and tail[-1].get("role") == "assistant"
          and (tail[-1].get("content") or [{}])[0].get("text") == waits[2]
          and evidence >= newer["machine"]["serial"],
          "evidence=%s newer_serial=%s" % (evidence, newer["machine"]["serial"]))

    compact = ([fx.main_system(),
                {"role": "user", "content": fx.MARKER},
                {"role": "assistant", "content": [{"type": "text", "text": rc.receipt_text(anchor["ref"])}]}]
               + tail + [json.loads(json.dumps(final_notif))])
    reply = ask(lane, workspace, compact)
    print("# entries after positive:", [(e["machine"]["serial"], e["rest"]["waiting_text_sha256"][:8])
          for e in (fx.checkpoint_entries(lane) or [])])
    call = fx.tool_call(reply)
    check("绑定后末回程＝下一真实 eq 门命令恰一次(不欠推导死等)",
          bool(call) and "bench-eqclass-r5" in call["arguments"].get("command", ""),
          json.dumps(reply.get("error") or call, ensure_ascii=False)[:260])
    check("与 cold 前沿决策逐字节一致", bool(call) and call == cold_call,
          "%r vs %r" % (call, cold_call))

    dup = json.loads(json.dumps(compact))
    dup.append(json.loads(json.dumps(final_notif)))
    reply_dup = ask(lane, workspace, dup)
    dup_call = fx.tool_call(reply_dup)
    check("重复回程不复活 worker/不二次推进(幂等同一决策)",
          dup_call == cold_call and not reply_dup.get("error"),
          json.dumps(reply_dup.get("error") or dup_call, ensure_ascii=False)[:200])

    foreign = json.loads(json.dumps(compact[:-1]))
    foreign.append({"role": "user", "content": '<agent id="ses_neverseen0000000" state="completed">'
                                             '\n<summary>Agent completed: foreign</summary>'})
    reply_f = ask(lane, workspace, foreign)
    print("# entries after foreign:", [(e["machine"]["serial"], e["rest"]["waiting_text_sha256"][:8])
          for e in (fx.checkpoint_entries(lane) or [])])
    check("外来会话回程不推进(诚实等待、无故障)", wait_say(reply_f) and not reply_f.get("error"),
          json.dumps(reply_f.get("error") or fx.reply_text(reply_f), ensure_ascii=False)[:160])

    reply_m = ask(lane, workspace, compact[:-1] + [{"role": "user", "content": "Now: 11:43\n\nsubagents: 1 running"}])
    check("真实回程缺席不推进(诚实等待、仅状态注入不动机)", wait_say(reply_m) and not reply_m.get("error"),
          json.dumps(reply_m.get("error") or fx.reply_text(reply_m), ensure_ascii=False)[:160])

    bare = [fx.main_system(), {"role": "user", "content": fx.MARKER},
            {"role": "assistant", "content": [{"type": "text", "text": rc.receipt_text(anchor["ref"])}]},
            {"role": "assistant", "content": [{"type": "text", "text": waits[2]}]},
            json.loads(json.dumps(final_notif))]
    reply_b = ask(lane, workspace, bare)
    bare_call = fx.tool_call(reply_b)
    jumped = bool(bare_call) and "bench-eqclass-r5" in bare_call.get("arguments", {}).get("command", "")
    check("无 serial 证据不绑定(裸尾＝权威再对账/等待，绝不装配 eq 前沿)",
          not jumped and not reply_b.get("error"),
          json.dumps(reply_b, ensure_ascii=False)[:400])

    tampered = json.loads(json.dumps(compact))
    tampered[-2]["content"][0]["text"] = waits[2].replace("active=1", "active=7")
    reply_t = ask(lane, workspace, tampered)
    check("篡改静息回显 fail closed(不跳进、绝不装配)",
          fx.tool_call(reply_t) is None and bool(reply_t.get("error")),
          json.dumps(reply_t.get("error") or fx.reply_text(reply_t), ensure_ascii=False)[:200])

    after = fx.checkpoint_entries(lane) or []
    ledger = (lane / "records" / "ledger.jsonl")
    forged = [json.loads(line) for line in ledger.read_text(encoding="utf-8").splitlines()]
    forged = [e for e in forged if e.get("event") not in ("reserve",)]
    check("全程不伪造 count/accepted 账本行、不发明超出链的进度",
          not forged and all(e["machine"]["serial"] <= newer["machine"]["serial"] for e in after),
          "forged=%s entries=%s" % (forged[:2], [(e["machine"]["serial"],
                                                e["rest"]["waiting_text_sha256"][:8]) for e in after]))
    return finish()


def finish():
    if FAILURES:
        print("FAILED %d checks: %s" % (len(FAILURES), ", ".join(FAILURES)))
        return 1
    print("ALL PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
