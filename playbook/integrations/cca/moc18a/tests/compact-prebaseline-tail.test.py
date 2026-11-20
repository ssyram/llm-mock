#!/usr/bin/env python3
"""r256c row921 首错回归：锚早于保留尾静息点（pre-baseline retained tail）。

真实证据（CCA_ROOT=.local/analysis-decouple/.pi/npr/r256c，READ ONLY 未改动）：
row921 请求经 OC 压缩重排为 [system, marker, 回执回显, 保留尾(tail_start_id 起),
…]；tail_start（serial95 静息回显 waiting(active=2)）早于回执检查点 d557f3e2
（serial99），故 message 3＝基线前静息回显、其后随 user 而非回执。旧分类
walk=非resume即裸重发：在 pointer3 step 出前沿决策 main.s100 reserve r41，
解释器严格回显核对对 waiting 文本报 playbook_segment_drift(message 3)（沙箱
/tmp/r256c-repro 以未改动 6f493fe 导出＋真实 records 全 mount 精确复现，回包
与 handler-trace 逐字节一致）。全部输入为显式合成（reconstructed）。

裁决映射：锚前全忽略；锚后保留尾中段回显＝已消费（consumed/own 链静息指纹）
跳过绝不重步进，首个未覆盖边界以真实决策应答并在该回显严格核对；全已消费＝
前沿决策＋跳至末尾；未覆盖/篡改回显仍 drift 拒绝；外会话仍拒绝。
"""
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ADAPTER = HERE.parent / "adapter"
sys.path.insert(0, str(ADAPTER))
_fx = importlib.util.spec_from_file_location("compact_resume_fixture", HERE / "compact-resume-fixture.py")
fx = importlib.util.module_from_spec(_fx)
_fx.loader.exec_module(fx)
_rc = importlib.util.spec_from_file_location("compact_receipt", ADAPTER / "compact_receipt.py")
rc = importlib.util.module_from_spec(_rc)
_rc.loader.exec_module(rc)
FAILURES = []


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-prebaseline-tail-"))
    workspace = base / "ws"
    workspace.mkdir()
    lane = fx.build_lane(base, "lane", workspace)
    prompt = json.loads((lane / "entries.json").read_text(encoding="utf-8"))["analysis"]["prompt"]
    hist = [{"role": "user", "content": prompt}]
    waits = []

    def step(trigger=None):
        if trigger:
            hist.append(trigger)
        reply, run = fx.ask(lane, workspace, [fx.main_system()] + hist)
        if reply.get("error"):
            raise AssertionError("mount fault: %s | %s" % (json.dumps(reply)[:300],
                                                            run.stderr.decode()[-300:]))
        hist.append(fx.echo_of(reply))
        call = fx.tool_call(reply)
        if call:
            hist.append(fx.synthesize_receipt(call, workspace))
        return reply, call

    for _ in range(80):
        trigger = fx.worker_return("w1") if len(waits) == 1 else None
        reply, call = step(trigger)
        if call is None and fx.reply_text(reply).startswith("waiting"):
            waits.append(fx.reply_text(reply))
            if len(waits) == 2:
                break
    check("cold 到达两个静息点(active=2→1)", len(waits) == 2, waits)
    chain = fx.checkpoint_entries(lane)
    check("链上两条静息条目", chain is not None and len(chain) == 2,
          [e["rest"]["consumed_tail"] for e in chain or []])
    if len(FAILURES) or chain is None or len(chain) != 2 or len(waits) != 2:
        return finish()

    # 保留尾（R0 静息回显起，含基线前已消费消息）+ 基线后 user 回程：r256c row921 形状。
    tail_start = next(i for i, m in enumerate(hist) if m["role"] == "assistant"
                      and (m.get("content") or [{}])[0].get("text") == waits[0])
    compact_messages = ([fx.main_system(),
                         {"role": "user", "content": fx.MARKER},
                         {"role": "assistant", "content": [{"type": "text", "text": rc.receipt_text(chain[-1]["ref"])}]}]
                        + hist[tail_start:] + [fx.worker_return("w2")])
    check("锚后首回显=基线前静息文本+随user", hist[tail_start + 1]["role"] == "user"
          and waits[0].endswith("active=2)"), "tail shape")

    reply, run = fx.ask(lane, workspace, compact_messages)
    call = fx.tool_call(reply)
    check("921 形状恢复＝前沿真实决策(reserve r3)", bool(call) and call["name"] == "bash"
          and "bench-analysis-r3" in call["arguments"].get("command", ""),
          json.dumps(reply.get("error") or call, ensure_ascii=False)[:260])

    cold_reply, _ = step(fx.worker_return("w2"))
    cold_call = fx.tool_call(cold_reply)
    check("与 cold 前沿逐字节一致", bool(call) and bool(cold_call) and call == cold_call,
          "%r vs %r" % (call, cold_call))

    tampered = json.loads(json.dumps(compact_messages))
    tampered[3]["content"][0]["text"] = waits[0].replace("active=2", "active=7")
    reply_bad, _ = fx.ask(lane, workspace, tampered)
    check("基线前回显篡改仍 drift 拒绝", (reply_bad.get("error") or {}).get("code") == "playbook_segment_drift",
          json.dumps(reply_bad.get("error") or reply_bad, ensure_ascii=False)[:200])

    reply_foreign, _ = fx.ask(lane, workspace, compact_messages, session="ses_foreign_root0x")
    fault = json.dumps(reply_foreign.get("error") or {}, ensure_ascii=False)
    check("外会话仍 fail closed 拒绝", bool(reply_foreign.get("error"))
          and ("compact_checkpoint_foreign" in fault or "session_mismatch" in fault), fault[:160])
    return finish()


def finish():
    if FAILURES:
        print("FAILED %d checks: %s" % (len(FAILURES), ", ".join(FAILURES)))
        return 1
    print("ALL PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
