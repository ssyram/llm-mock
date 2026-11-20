#!/usr/bin/env python3
"""cx16 0463 终局续行＋终门时刻诚实性回归（taskbasis：attempt18 真实 0463 请求形状重建）。

复现链（attempt18 首错 464 根因，证据取自真实留痕）：原生 OC 每个工具后压缩
→回执经铸造侧活体补绑进 root 链（54 条 genesis）→恢复侧重放消费全部回执后
派生的终局决策被丢弃→前沿 step resubmit_after_success，终局永远无法送达；
终门回执只在恢复侧被消费，前沿落盘路径永不触发，两终门文件缺失。

终门时刻诚实性（修复 3fe3fc82 缺陷）：恢复侧 on_gate 曾把重放墙钟当原始终门
时刻落盘——cx16 实证原始 81.084 s 终门间隔被压缩成 1.78 ms。现在恢复侧终门
时刻唯一真值＝回执入链时随附的权威宿主完成时刻（OC state.time.end 毫秒→纳秒
显式换算；适配器证明见 compact-receipt-observed-time.test.py）：重放只识别
哪张绑定回执产出终门键，不供应时刻；回执无真值＝终门证据保持缺位（采集器
照旧 missing_timeline 失败），绝不回填。本测试用固定、迥异、极旧的宿主钟断言：
- T1 终局车道：0463 形状续行送达真实终局文本且幂等（同文、无新工具、链不
  增、前沿首写终门不被恢复改写）；
- T2 中切车道（cx16 重铸链形状：前沿从未落盘终门）：绑定回执携带固定极旧
  宿主完成时刻——两终门恰在恢复侧消费各自终门回执时按该绑定时刻落盘，
  逐纳秒存活、81.084 s 间隔不被重放压缩、重复续行逐字节不改写；worker 全
  回程也不能终止 Main；
- T3 缺真值车道：回执无宿主观测时刻——续行正常推进但两终门证据保持缺位，
  重放绝不回填时刻。
"""
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import time
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ADAPTER_DIR = HERE.parent / "adapter"
sys.path.insert(0, str(ADAPTER_DIR))
sys.path.insert(0, str(HERE))
from cca_scripts_path import cca_scripts  # noqa: E402  (loud failure without an explicit CCA root)
os.environ.setdefault("CCA_NEW_CCA_HOME", str(cca_scripts().parent))
_fx = importlib.util.spec_from_file_location("compact_resume_fixture", HERE / "compact-resume-fixture.py")
fx = importlib.util.module_from_spec(_fx)
_fx.loader.exec_module(fx)
import compact_receipt
import compact_state
import compact_genesis
import compact_machine
from timing_capture import load_gate_timeline

MARKER = {"role": "user", "content": fx.MARKER}
CONTINUE = "Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed."
WORKER_KIND = {"w1": "analysis", "w2": "analysis", "w3": "eqclass"}
# 固定、迥异、极旧的宿主完成毫秒钟（2001-09-09 域）：任何重放墙钟都不可能撞上；
# 81.084 s 间隔＝cx16 真实终门间隔（main.s52 end − main.s31 end＝81084 ms）。
GATE_AN_END_MS = 1000000000000
GATE_EQ_END_MS = 1000000081084
GATE_AN_NS, GATE_EQ_NS = GATE_AN_END_MS * 1_000_000, GATE_EQ_END_MS * 1_000_000
GATE_INTERVAL_NS = 81084000000
FAILURES = []


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def continuation_request(anchor_text):
    banner = "<!-- opencode:subagents -->\nYour subagents working right now:\n  %s — bench worker w3 (@general subagent)" \
        % fx.WORKER_SESSIONS["w3"]
    return [fx.main_system(), dict(MARKER),
            {"role": "assistant", "content": [{"type": "text", "text": anchor_text}]},
            {"role": "user", "content": [{"text": CONTINUE}, {"text": banner}]}]


def drive(lane, workspace, stop_call):
    """真实 mount 推进到谓词命中的工具调用；收据按冻结机 expect 契约合成。"""
    prompt = json.loads((lane / "entries.json").read_text(encoding="utf-8"))["analysis"]["prompt"]
    hist = [{"role": "user", "content": prompt}]
    receipts, unreturned = [], list(WORKER_KIND)
    for _ in range(80):
        reply, run = fx.ask(lane, workspace, [fx.main_system()] + hist)
        if reply.get("error"):
            raise AssertionError("mount fault: %s | %s" % (json.dumps(reply)[:300], run.stderr.decode()[-300:]))
        call, text = fx.tool_call(reply), fx.reply_text(reply)
        if call is None:
            if not text.startswith("waiting for worker returns") or not unreturned:
                raise AssertionError("unexpected idle text: " + text[:120])
            hist.append(fx.echo_of(reply))
            label = unreturned.pop(0)
            hist.append(fx.worker_return(label))
            fx.seed_worker_accepted(lane, WORKER_KIND[label], label)
            continue
        hist.append(fx.echo_of(reply))
        receipt = fx.synthesize_receipt(call, workspace)
        hist.append(receipt)
        receipts.append({"call_id": call["id"], "tool": call["name"], "arguments": call.get("arguments") or {},
                         "result": receipt["content"][0]["text"], "result_truncated": False})
        if stop_call(call):
            return hist, receipts
    raise AssertionError("drive did not reach its stop call")


def bind_genesis(lane, workspace, receipts, observed_ms=None):
    """按真实 mint 产物形状把回执绑成链上 genesis 条目（reconstructed，机器数据真实）。

    observed_ms＝{call_id: 宿主完成毫秒}（OC state.time.end 形状）时为对应回执附
    observed_ns/observed_source——与铸造侧活体补绑携带的权威宿主时刻同形。
    """
    bound = []
    for receipt in receipts:
        end_ms = (observed_ms or {}).get(receipt["call_id"])
        bound.append(dict(receipt, **({"observed_ns": end_ms * 1_000_000,
                                       "observed_source": "oc-tool-part.state.time.end"} if end_ms else {})))
    backup = dict(os.environ)
    os.environ.update(CCA_NEW_LANE=str(lane), CCA_NEW_WORKSPACE=str(workspace),
                      CCA_NEW_ROOT_SESSION=fx.ROOT_SESSION, CCA_NEW_TAPE="")
    try:
        import main_step
        from lane_context import TapeLedger, lane_env
        env = lane_env()
        machine = compact_machine.snapshot_script(main_step.build_script(env, TapeLedger(env["records"])))
        entry = compact_genesis.build_entry(env, machine, bound, [{"model_visible": False} for _ in bound])
        compact_state.validate_entry(entry, env)
        entry["written_at_ns"] = time.time_ns()
        entries = compact_state.read_checkpoint(env["records"]) or []
        compact_state.write_chain(env["records"], entries + [entry])
    finally:
        os.environ.clear()
        os.environ.update(backup)
    return compact_receipt.receipt_text(entry["ref"])


def gate_document(lane, phase):
    path = lane / "records" / ("timing-main-gate-%s.json" % phase)
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


def gate_file(lane, phase):
    return lane / "records" / ("timing-main-gate-%s.json" % phase)


def gate_receipt(receipts, target):
    return next(r["call_id"] for r in receipts
                if r["tool"] == "fsm_fsm_try_transition" and r["arguments"].get("target") == target)


def drive_mid(name, workspace, lanes):
    """中切车道：推进到 E_DONE 决策；随后重铸 cx16 沙箱形状（前沿从未落盘终门）。"""
    hist, receipts = drive(lanes[name], workspace,
                           lambda c: c["name"] == "fsm_fsm_try_transition"
                           and c["arguments"].get("target") == "E_DONE")
    for phase in ("analysis", "eqclass"):
        if gate_file(lanes[name], phase).is_file():
            gate_file(lanes[name], phase).unlink()
    return hist, receipts, gate_receipt(receipts, "A_DONE"), gate_receipt(receipts, "E_DONE")


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-terminal-continuation-"))
    workspace = base / "ws"
    workspace.mkdir()
    lanes = {name: fx.build_lane(base, name, workspace) for name in ("cold", "term", "mid", "notime")}
    def second_fsm_exit_factory():
        exits = {"n": 0}
        def stop(call):
            if call["name"] == "fsm_exit_fsm":
                exits["n"] += 1
                return exits["n"] == 2
            return False
        return stop

    hist_c, _ = drive(lanes["cold"], workspace, second_fsm_exit_factory())
    reply, run = fx.ask(lanes["cold"], workspace, [fx.main_system()] + hist_c)
    if reply.get("error"):
        raise AssertionError("cold terminal fault: " + json.dumps(reply)[:300])
    cold_terminal = fx.reply_text(reply)
    cold_gates = {phase: (gate_document(lanes["cold"], phase) or {}).get("call_id")
                  for phase in ("analysis", "eqclass")}
    check("cold 终局文本(前沿路径)", cold_terminal.startswith("campaign complete"), cold_terminal[:80])
    check("cold 两终门 call_id", all(cold_gates.values()), json.dumps(cold_gates))

    hist_t, receipts_t = drive(lanes["term"], workspace, second_fsm_exit_factory())
    anchor = bind_genesis(lanes["term"], workspace, receipts_t)
    cont = continuation_request(anchor)
    reply1, run1 = fx.ask(lanes["term"], workspace, cont)
    check("T1 0463 续行送达终局(修复前=422 resubmit_after_success)",
          not reply1.get("error") and fx.reply_text(reply1) == cold_terminal
          and fx.tool_call(reply1) is None and reply1.get("stopReason") == "stop",
          json.dumps(reply1)[:220] if reply1.get("error") else fx.reply_text(reply1)[:80])
    gates_at = {phase: (gate_document(lanes["term"], phase) or {}).get("at_ns") for phase in ("analysis", "eqclass")}
    check("T1 两终门在场且 call_id 与 cold 一致(前沿真实观测时刻)",
          all(gate_document(lanes["term"], p) for p in ("analysis", "eqclass"))
          and {p: gate_document(lanes["term"], p)["call_id"] for p in ("analysis", "eqclass")} == cold_gates,
          json.dumps({p: gate_document(lanes["term"], p) for p in ("analysis", "eqclass")})[:220])
    chain_len = len(compact_state.read_checkpoint(lanes["term"] / "records"))
    reply2, _ = fx.ask(lanes["term"], workspace, cont)
    reply3, _ = fx.ask(lanes["term"], workspace, cont)
    rows = [r for r in fx.trace_rows(lanes["term"]) if r.get("session") == fx.ROOT_SESSION]
    check("T1 重复终局请求幂等：同文、无新工具、链不增、前沿首写终门不被恢复改写",
          fx.reply_text(reply2) == cold_terminal and fx.reply_text(reply3) == cold_terminal
          and all(r.get("decision", {}).get("action") != "tool" for r in rows[-4:])
          and any(r.get("case") == "restore-terminal" for r in rows[-4:])
          and len(compact_state.read_checkpoint(lanes["term"] / "records")) == chain_len
          and {p: (gate_document(lanes["term"], p) or {}).get("at_ns") for p in ("analysis", "eqclass")} == gates_at
          and set(gates_at.values()).isdisjoint({GATE_AN_NS, GATE_EQ_NS}),
          "|".join(r.get("case", "?") for r in rows[-4:]))

    hist_m, receipts_m, an_call, eq_call = drive_mid("mid", workspace, lanes)
    check("T2 重铸链形状：绑定前两终门缺位＝时序证据不完整(不得计成功)",
          all(gate_document(lanes["mid"], p) is None for p in ("analysis", "eqclass"))
          and load_gate_timeline(lanes["mid"] / "records") == {},
          json.dumps(sorted(load_gate_timeline(lanes["mid"] / "records"))))
    anchor_m = bind_genesis(lanes["mid"], workspace, receipts_m,
                            {an_call: GATE_AN_END_MS, eq_call: GATE_EQ_END_MS})
    reply_m, _ = fx.ask(lanes["mid"], workspace, continuation_request(anchor_m))
    call_m = fx.tool_call(reply_m)
    check("T2 worker 全回程也不能终止 Main：续行回下一真实工具",
          not reply_m.get("error") and call_m is not None
          and "campaign complete" not in fx.reply_text(reply_m),
          json.dumps(reply_m)[:220])
    gate_an, gate_eq = gate_document(lanes["mid"], "analysis"), gate_document(lanes["mid"], "eqclass")
    timeline_m = load_gate_timeline(lanes["mid"] / "records")
    check("T2 两终门恰在恢复侧消费各自终门回执时按绑定宿主时刻落盘",
          gate_an is not None and gate_eq is not None
          and gate_an["call_id"] == an_call and gate_eq["call_id"] == eq_call
          and timeline_m.get("analysis_final_gate_ns") == GATE_AN_NS
          and timeline_m.get("eqclass_final_gate_ns") == GATE_EQ_NS,
          json.dumps([gate_an, gate_eq]))
    check("T2 固定极旧宿主门时刻逐纳秒存活、81.084s 间隔不被重放压缩",
          gate_an["at_ns"] == GATE_AN_NS and gate_eq["at_ns"] == GATE_EQ_NS
          and gate_eq["at_ns"] - gate_an["at_ns"] == GATE_INTERVAL_NS
          and max(gate_an["at_ns"], gate_eq["at_ns"]) < time.time_ns() - 10 * 365 * 86400 * 10**9,
          "an=%d eq=%d Δ=%dns" % (gate_an["at_ns"], gate_eq["at_ns"], gate_eq["at_ns"] - gate_an["at_ns"]))
    files_m = {p: gate_file(lanes["mid"], p).read_bytes() for p in ("analysis", "eqclass")}
    fx.ask(lanes["mid"], workspace, continuation_request(anchor_m))
    check("T2 重复续行不改写终门文件(先写者胜、逐字节稳定)",
          {p: gate_file(lanes["mid"], p).read_bytes() for p in ("analysis", "eqclass")} == files_m)

    hist_n, receipts_n, _, _ = drive_mid("notime", workspace, lanes)
    anchor_n = bind_genesis(lanes["notime"], workspace, receipts_n)
    reply_n, _ = fx.ask(lanes["notime"], workspace, continuation_request(anchor_n))
    check("T3 回执无宿主观测时刻：续行正常但终门证据保持缺位(重放绝不回填)",
          not reply_n.get("error") and fx.tool_call(reply_n) is not None
          and gate_document(lanes["notime"], "analysis") is None
          and gate_document(lanes["notime"], "eqclass") is None
          and load_gate_timeline(lanes["notime"] / "records") == {},
          json.dumps(reply_n)[:160])

    print("workdir:", base)
    if FAILURES:
        print("FAILED %d checks: %s" % (len(FAILURES), ", ".join(FAILURES)))
        return 1
    print("ALL CHECKS PASSED")
    shutil.rmtree(base, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
