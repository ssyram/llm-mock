#!/usr/bin/env python3
"""Compact-resume 链式压缩回归（可移植、自包含；直接 `python3 compact-resume.test.py`）。

证明目标（对照 cold 全量重放 lane）：
1) 单次压缩：marker+tail 恢复后实际下一决策与 cold 全量重放逐字节一致；解释器
   walk/resume/前沿各自的恢复基线随目标边界选择，verified span 恰为 floor 后
   的短后缀（无全量旧史重放）；深切割（tail 只剩静息回显）同样同答。
2) 同一会话第二次压缩：静息检查点在压缩模式内滚动追加（链），第二次切割用
   压缩回执引用的本地检查点恢复（不重放原始历史、不信摘要文本为权限来源），
   仍与 cold 等价；旧形状请求仍从旧基线整段重放（检查点只追加、从不替换）。
   两 lane 的可观决策轨迹按切割点对齐比较同一后缀（comp_hist 切割后重定基，
   整史比较必然误报）。
3) 失败保持（全部全新 mount 进程＋PLAYBOOK2_CACHE=0，缓存命中无法掩盖校验）：
   缺链/坏 JSON/坏 schema/外会话/spec/adapter/携在途/机器域外/条目篡改
   （ref 自洽失配）全部 fail closed；回执侧：未知引用/过时引用（tail 已含
   更新基线收据）/非引用形状载荷同样 fail closed。
4) aux：压缩回执载荷＝最小机器可读 JSON——指向本地静息检查点链最新条目的
   不透明引用（无 continue_from 裸进度权限）；门禁裁决仍读 handler-trace
   活记录（本 mount 的 aux 契约＝单条 user 请求，不带主 transcript）。

压缩请求形状取自 r256b 真实保留证据（/tmp/compact-probe/run_e2e2.py + stream.json：
auto/overflow marker、tail + user 消息 + summary 回显 + 新触发；summary 回显前必有
user 消息隔开相邻文本回显）。全部输入为显式合成（reconstructed），不读取原始
transcript/spec/workspace；回执由 harness 按冻结机 expect 契约合成（honest
unit-protocol evidence，不是真实 OC/门禁证据——那需 a688 原生 overflow 与真实
工具/门禁闭环）。
"""
import importlib.util
import json
import shutil
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
_state_spec = importlib.util.spec_from_file_location("compact_state", ADAPTER_DIR / "compact_state.py")
cs = importlib.util.module_from_spec(_state_spec)
_state_spec.loader.exec_module(cs)

MARKER = {"role": "user", "content": fx.MARKER}
POLL = {"role": "user", "content": "status: continue when ready"}
FAILURES = []


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def reserve_command(operation, phase, workspace):
    return ("python3 \"$CCV_HOME/scripts/cca_state.py\" reserve --session %s --agent main "
            "--workspace %s --phase:%s --operation %s"
            % (fx.ROOT_SESSION, workspace, phase, operation))


def main():
    base = Path(tempfile.mkdtemp(prefix="pb2-compact-resume-"))
    workspace = base / "ws"
    workspace.mkdir()
    cold, comp = fx.build_lane(base, "cold", workspace), fx.build_lane(base, "compact", workspace)
    prompt = json.loads((cold / "entries.json").read_text(encoding="utf-8"))["analysis"]["prompt"]
    cold_hist = [{"role": "user", "content": prompt}]
    comp_hist = [{"role": "user", "content": prompt}]
    obs_cold, obs_comp = [], []

    def observe(reply):
        call = fx.tool_call(reply)
        if call:
            return ("call", call["id"], call["name"], call.get("arguments"))
        return ("text", fx.reply_text(reply))

    def step(lane, hist, obs, trigger=None, cache="0"):
        if trigger:
            hist.append(trigger)
        reply, run = fx.ask(lane, workspace, [fx.main_system()] + hist, cache=cache)
        if reply.get("error"):
            raise AssertionError("mount fault: %s | stderr: %s"
                                 % (json.dumps(reply)[:400], run.stderr.decode()[-400:]))
        hist.append(fx.echo_of(reply))
        call = fx.tool_call(reply)
        if call:
            hist.append(fx.synthesize_receipt(call, workspace))
        obs.append(observe(reply))
        return reply, call

    def run_until(lane, hist, obs, predicate):
        for _ in range(60):
            reply, call = step(lane, hist, obs)
            if call is None and predicate(fx.reply_text(reply)):
                return fx.reply_text(reply)
        raise AssertionError("session did not reach predicate")

    def gate(lane):
        reply, _ = fx.ask(lane, workspace, [fx.gate_system(), {"role": "user", "content": "should we stop?"}])
        call = fx.tool_call(reply)
        return (call or {}).get("arguments") if call else reply.get("error")

    def calls_of(hist):
        return [(b["id"], b["name"], b.get("arguments"))
                for m in hist if m["role"] == "assistant" for b in m["content"]
                if isinstance(b, dict) and b.get("type") == "toolCall"]

    waiting = lambda active: "waiting for worker returns (active=%d)" % active

    # ---- Phase 0：推进到首个静息点 R0（两 lane 全量 transcript） ----
    text0 = run_until(cold, cold_hist, obs_cold, lambda t: t.startswith("waiting"))
    check("cold 静息 R0(active=2)", text0 == waiting(2), text0)
    check("compact(未压缩)同静息点", run_until(comp, comp_hist, obs_comp, lambda t: t.startswith("waiting")) == text0)
    chain = fx.checkpoint_entries(comp)
    check("静息点 R0 落链", chain and len(chain) == 1 and chain[0]["rest"]["consumed_tail"] == "main.s9",
          [e["rest"]["consumed_tail"] for e in chain or []])
    verdict_c, verdict_x = gate(cold), gate(comp)
    check("aux gate 活读一致(wait 2 workers)",
          verdict_c == verdict_x == {"action": "wait_for_async_work",
                                     "reason": "2 dispatched worker session(s) have not reported back yet"},
          json.dumps(verdict_c))

    # ---- Phase 1：w1 回程 → reserve r2 → 静息点 R1 ----
    for lane in (comp, cold):
        fx.seed_worker_accepted(lane, "analysis", "w1")
    step(comp, comp_hist, obs_comp, fx.worker_return("w1"))
    text1 = run_until(comp, comp_hist, obs_comp, lambda t: t.startswith("waiting"))
    check("compact 静息 R1(active=1)", text1 == waiting(1), text1)
    step(cold, cold_hist, obs_cold, fx.worker_return("w1"))
    check("cold 同文到 R1", run_until(cold, cold_hist, obs_cold, lambda t: t.startswith("waiting")) == text1)
    chain = fx.checkpoint_entries(comp)
    check("静息点 R1 追加(不替换)", len(chain) == 2 and chain[1]["rest"]["consumed_tail"] == "main.s10",
          [e["rest"]["consumed_tail"] for e in chain])
    reply, _ = fx.ask(comp, workspace, [fx.main_system()] + comp_hist[:-1])
    check("R1 幂等重导同答且不增链", fx.reply_text(reply) == text1 and len(fx.checkpoint_entries(comp)) == 2,
          fx.reply_text(reply))

    # ---- CUT #1：tail 止于 R1 静息回显；user 消息隔开；S1；w2 回程触发 ----
    for lane in (comp, cold):
        fx.seed_worker_accepted(lane, "analysis", "w2")
    cut1 = len(obs_comp)
    check("切割点前两 lane 决策轨迹一致", obs_cold[:cut1] == obs_comp[:cut1])
    aux_reply, _ = fx.ask(comp, workspace, [{"role": "user", "content": "Summarize the conversation so far."}])
    summary1 = fx.reply_text(aux_reply)
    chain = fx.checkpoint_entries(comp)
    try:
        payload1 = json.loads(summary1)
    except ValueError:
        payload1 = {}
    check("S1=不透明本地检查点引用(=链最新条目 R1, 无 continue_from)",
          payload1 == {"type": "compact-progress", "checkpoint": chain[-1]["ref"]}
          and chain[-1]["rest"]["consumed_tail"] == "main.s10"
          and payload1.get("checkpoint", "") != chain[0]["ref"]
          and len(payload1.get("checkpoint", "")) == 64, summary1[:160])
    s1_echo = {"role": "assistant", "content": [{"type": "text", "text": summary1}]}
    tail1 = comp_hist[-5:]
    cut1_at = len(cold_hist) - len(tail1)
    check("tail1 形状(wait2 → R1 静息回显)",
          fx.reply_text({"content": tail1[0]["content"]}) == waiting(2)
          and fx.reply_text({"content": tail1[-1]["content"]}) == waiting(1))
    trig1 = fx.worker_return("w2")

    oracle_reply, oracle_call = step(cold, cold_hist, obs_cold, trig1)
    check("cold 前沿=reserve r3", oracle_call["id"] == "main.s11"
          and oracle_call["arguments"]["command"] == reserve_command("bench-analysis-r3", "analysis", workspace),
          json.dumps(oracle_call))

    c1 = [fx.main_system(), dict(MARKER)] + [dict(m) for m in tail1] + [dict(POLL), s1_echo, dict(trig1)]
    reply, run = fx.ask(comp, workspace, c1)
    check("C1(对齐floor,cache=0,新进程)逐字节等价 cold", reply.get("content") == oracle_reply.get("content"),
          json.dumps(reply)[:300] if reply.get("error") else "ok")
    trace = fx.trace_rows(comp)[-1]
    check("C1 trace: floor 对齐 r2 收据之后, span 恰为 [R1静息,S1]",
          trace.get("compact") is True and trace.get("compact_floor") == 6
          and trace.get("verified_call_ids") == [None, None], json.dumps(trace)[:240])
    reply_fill, _ = fx.ask(comp, workspace, c1, cache="1")
    reply_warm, _ = fx.ask(comp, workspace, c1, cache="1")
    check("C1 暖缓存填充与命中均同答", reply_fill.get("content") == oracle_reply.get("content")
          and reply_warm.get("content") == oracle_reply.get("content"))

    comp_hist = [dict(MARKER)] + [dict(m) for m in tail1] + [dict(POLL), s1_echo, dict(trig1),
                  fx.echo_of(reply), fx.synthesize_receipt(fx.tool_call(reply), workspace)]
    obs_comp.append(observe(reply))
    reply_dup, _ = fx.ask(comp, workspace, c1)
    check("C1 旧形状重复(cache=0)仍同答", reply_dup.get("content") == oracle_reply.get("content"))

    c1_fb = [fx.main_system(), dict(MARKER), dict(tail1[-1]), dict(POLL), s1_echo, dict(trig1)]
    reply_fb, _ = fx.ask(comp, workspace, c1_fb)
    check("C1 深切割回退floor(静息回显定位)仍同答", reply_fb.get("content") == oracle_reply.get("content"),
          json.dumps(reply_fb)[:300] if reply_fb.get("error") else "ok")
    trace_fb = fx.trace_rows(comp)[-1]
    check("C1-fb trace: floor=marker+1", trace_fb.get("compact_floor") == 2, json.dumps(trace_fb)[:240])

    # ---- Phase 2：压缩模式内推进到 eqclass 静息点 R2（链式基线） ----
    text2 = run_until(comp, comp_hist, obs_comp, lambda t: t.startswith("waiting"))
    check("compact 静息 R2(active=1,eqclass)", text2 == waiting(1), text2)
    check("cold 同文到 R2", run_until(cold, cold_hist, obs_cold, lambda t: t.startswith("waiting")) == text2)
    chain = fx.checkpoint_entries(comp)
    check("R2 在压缩模式内追加(链式基线)",
          [e["rest"]["consumed_tail"] for e in chain] == ["main.s9", "main.s10", "main.s25"],
          [e["rest"]["consumed_tail"] for e in chain])
    cold_chain = fx.checkpoint_entries(cold)
    check("两 lane 静息链 consumed 完全一致",
          [e["rest"]["consumed_tail"] for e in cold_chain] == [e["rest"]["consumed_tail"] for e in chain])
    verdict = gate(comp)
    check("压缩会话 aux gate 活读不变(wait 1 worker)",
          verdict == {"action": "wait_for_async_work",
                      "reason": "1 dispatched worker session(s) have not reported back yet"},
          json.dumps(verdict))
    check("两 lane 决策轨迹按切割点对齐逐字节一致(cut1 后)",
          obs_cold[cut1:] == obs_comp[cut1:], "%d vs %d" % (len(obs_cold), len(obs_comp)))
    check("两 lane 调用序列按切割点对齐一致(cut1 后)",
          calls_of(cold_hist[cut1_at:]) == calls_of(comp_hist[1:]))
    check("analysis 终门时序文件在场(两 lane)",
          (cold / "records/timing-main-gate-analysis.json").is_file()
          and (comp / "records/timing-main-gate-analysis.json").is_file())

    # ---- CUT #2：tail2 = R2 静息回显（链式最小尾巴；旧 summary 已随重定基丢弃） ----
    for lane in (comp, cold):
        fx.seed_worker_accepted(lane, "eqclass", "w3")
    cut2 = len(obs_comp)
    check("第二次切割前决策轨迹仍一致", obs_cold[:cut2] == obs_comp[:cut2])
    aux_reply, _ = fx.ask(comp, workspace, [{"role": "user", "content": "Summarize the conversation so far."}])
    summary2 = fx.reply_text(aux_reply)
    chain = fx.checkpoint_entries(comp)
    try:
        payload2 = json.loads(summary2)
    except ValueError:
        payload2 = {}
    check("S2=不透明引用(=链最新条目 R2, 不同于 S1 引用)",
          payload2 == {"type": "compact-progress", "checkpoint": chain[-1]["ref"]}
          and chain[-1]["rest"]["consumed_tail"] == "main.s25"
          and payload2.get("checkpoint") != payload1.get("checkpoint")
          and len(payload2.get("checkpoint", "")) == 64, summary2[:160])
    s2_echo = {"role": "assistant", "content": [{"type": "text", "text": summary2}]}
    e_w3, r_w3 = comp_hist[-3], comp_hist[-2]
    tail2 = [dict(comp_hist[-1])]
    check("tail2 = R2 静息回显且不含旧 summary/收据头",
          fx.reply_text({"content": tail2[0]["content"]}) == text2
          and tail2[0]["role"] == "assistant"
          and not any("compact-progress" in fx.reply_text({"content": m["content"]}) for m in tail2))
    trig2 = fx.worker_return("w3")

    oracle2_reply, oracle2_call = step(cold, cold_hist, obs_cold, trig2)
    check("cold 前沿=reserve r5(eqclass)", oracle2_call["id"] == "main.s26"
          and oracle2_call["arguments"]["command"] == reserve_command("bench-eqclass-r5", "eqclass", workspace),
          json.dumps(oracle2_call))

    c2 = [fx.main_system(), dict(MARKER)] + tail2 + [dict(POLL), s2_echo, dict(trig2)]
    reply2, _ = fx.ask(comp, workspace, c2)
    check("C2 恢复回执引用的 R2 基线逐字节等价 cold", reply2.get("content") == oracle2_reply.get("content"),
          json.dumps(reply2)[:300] if reply2.get("error") else "ok")
    trace2 = fx.trace_rows(comp)[-1]
    check("C2 trace: floor=R2 静息回显处, span 恰为 [R2静息,S2]",
          trace2.get("compact") is True and trace2.get("compact_floor") == 2
          and trace2.get("verified_call_ids") == [None, None], json.dumps(trace2)[:240])

    reply_dup2, _ = fx.ask(comp, workspace, c1)
    check("C1 旧形状在 R2 存在后仍同答(基线未被替换, 引用未过时)",
          reply_dup2.get("content") == oracle_reply.get("content"))

    comp_hist = [dict(MARKER)] + tail2 + [dict(POLL), s2_echo, dict(trig2),
                fx.echo_of(reply2), fx.synthesize_receipt(fx.tool_call(reply2), workspace)]
    obs_comp.append(observe(reply2))

    # ---- Phase 3：跑到 terminal，两 lane 终局可观测一致 ----
    terminal_c = run_until(comp, comp_hist, obs_comp, lambda t: t.startswith("campaign complete"))
    terminal_x = run_until(cold, cold_hist, obs_cold, lambda t: t.startswith("campaign complete"))
    check("终局文本一致", terminal_c == terminal_x, terminal_c[:80])
    for phase, call_id in (("analysis", "main.s19"), ("eqclass", "main.s30")):
        rows = []
        for lane in (cold, comp):
            path = lane / "records" / ("timing-main-gate-%s.json" % phase)
            rows.append(json.loads(path.read_text()) if path.is_file() else None)
        check("%s 终门 call_id 两 lane 一致(%s)" % (phase, call_id),
              bool(rows[0] and rows[1]) and rows[0].get("call_id") == rows[1].get("call_id") == call_id,
              json.dumps(rows)[:200])
    check("终局请求 floor 仍为短后缀(=2)", fx.trace_rows(comp)[-1].get("compact_floor") == 2,
          json.dumps(fx.trace_rows(comp)[-1])[:160])

    def counts(lane):
        return sorted({(r.get("phase"), r.get("label")) for r in
                       (json.loads(line) for line in (lane / "records/ledger.jsonl").read_text().splitlines())
                       if r.get("event") == "count"})
    check("两 lane 账本进度一致", counts(cold) == counts(comp)
          == [("analysis", "w1"), ("analysis", "w2"), ("eqclass", "w3")])
    check("两 lane 决策轨迹按切割点对齐逐字节一致(cut2 后)",
          obs_cold[cut2:] == obs_comp[cut2:], "%d vs %d" % (len(obs_cold), len(obs_comp)))
    check("cut1 后全程决策轨迹对齐一致(含两次切割)", obs_cold[cut1:] == obs_comp[cut1:])

    # ---- Phase 4：失败保持（全部全新 mount 进程 + PLAYBOOK2_CACHE=0 显式） ----
    # 回执侧伪造（链保持完好：证明拒绝来自引用校验本身）
    s_unknown = {"role": "assistant", "content": [{"type": "text", "text": json.dumps(
        {"type": "compact-progress", "checkpoint": "f" * 64}, sort_keys=True)}]}
    c2_unknown = [fx.main_system(), dict(MARKER)] + [dict(m) for m in tail2] \
        + [dict(POLL), s_unknown, dict(trig2)]
    reply, _ = fx.ask(comp, workspace, c2_unknown, cache="0")
    check("拒绝: 回执引用缺失(compact_checkpoint_missing)", bool(reply.get("error"))
          and "compact_checkpoint_missing" in json.dumps(reply), json.dumps(reply)[:220])

    c_outdated = [fx.main_system(), dict(MARKER), dict(e_w3), dict(r_w3), dict(tail2[0]),
                  dict(POLL), s1_echo, dict(trig2)]
    reply, _ = fx.ask(comp, workspace, c_outdated, cache="0")
    check("拒绝: 回执过时(tail 已含更新基线收据)", bool(reply.get("error"))
          and "compact_checkpoint_outdated" in json.dumps(reply), json.dumps(reply)[:220])

    s_shape = {"role": "assistant", "content": [{"type": "text", "text": json.dumps(
        {"type": "compact-progress", "continue_from": 3}, sort_keys=True)}]}
    c2_shape = [fx.main_system(), dict(MARKER)] + [dict(m) for m in tail2] \
        + [dict(POLL), s_shape, dict(trig2)]
    reply, _ = fx.ask(comp, workspace, c2_shape, cache="0")
    check("拒绝: 回执非引用形状(compact_receipt_invalid)", bool(reply.get("error"))
          and "compact_receipt_invalid" in json.dumps(reply), json.dumps(reply)[:220])

    # 链侧篡改（每项破坏后恢复原字节；全部 fail closed）
    chain_path = comp / "records" / "compact-checkpoint.json"
    original = chain_path.read_bytes()

    def with_chain(mutate, kind):
        document = json.loads(original)
        mutate(document)
        chain_path.write_bytes(json.dumps(document).encode())
        reply, _ = fx.ask(comp, workspace, c2, cache="0")
        check("拒绝: %s" % kind, bool(reply.get("error")) and kind in json.dumps(reply),
              json.dumps(reply)[:220])
        chain_path.write_bytes(original)

    def tamper_last(field, value):
        return lambda document: document["entries"][-1].__setitem__(field, value)

    def tamper_machine(field, value):
        return lambda document: document["entries"][-1]["machine"].__setitem__(field, value)

    with_chain(tamper_machine("serial", 5), "compact_checkpoint_tampered")
    with_chain(tamper_last("session", "ses_other"), "compact_checkpoint_foreign")
    with_chain(tamper_last("spec_sha256", "0" * 64), "compact_checkpoint_spec")
    with_chain(lambda d: d["entries"][-1].pop("adapters"), "compact_checkpoint_adapters")

    # adapter 版本哈希失配：模拟检查点落盘后 adapter 文件升级（内容变化→哈希变化）。
    # 名称集合不变、条目重算 ref 保持自洽、收据指向重算后的 ref——能拒绝它的
    # 只能是版本哈希绑定本身，而非通用篡改（ref 失配）或引用缺失。
    document = json.loads(original)
    upgraded = document["entries"][-1]
    upgraded["adapters"][sorted(upgraded["adapters"])[0]] = "e" * 64
    upgraded["ref"] = cs.entry_ref(upgraded)
    chain_path.write_bytes(json.dumps(document).encode())
    s_upgraded = {"role": "assistant", "content": [{"type": "text", "text": json.dumps(
        {"type": "compact-progress", "checkpoint": upgraded["ref"]}, sort_keys=True)}]}
    c2_upgraded = [fx.main_system(), dict(MARKER)] + [dict(m) for m in tail2] \
        + [dict(POLL), s_upgraded, dict(trig2)]
    reply, _ = fx.ask(comp, workspace, c2_upgraded, cache="0")
    check("拒绝: adapter 版本哈希失配(条目自洽, compact_checkpoint_adapters)",
          bool(reply.get("error")) and "compact_checkpoint_adapters" in json.dumps(reply),
          json.dumps(reply)[:220])
    chain_path.write_bytes(original)

    with_chain(tamper_last("pending", {"call": 1}), "compact_cut_unsupported")
    chain_path.write_bytes(b"{ not json")
    reply, _ = fx.ask(comp, workspace, c2, cache="0")
    check("拒绝: compact_checkpoint_corrupt", bool(reply.get("error"))
          and "compact_checkpoint_corrupt" in json.dumps(reply), json.dumps(reply)[:220])
    chain_path.write_bytes(json.dumps({"schema": 2, "entries": []}).encode())
    reply, _ = fx.ask(comp, workspace, c2, cache="0")
    check("拒绝: compact_checkpoint_schema", bool(reply.get("error"))
          and "compact_checkpoint_schema" in json.dumps(reply), json.dumps(reply)[:220])
    chain_path.write_bytes(original)
    chain_path.unlink()
    reply, _ = fx.ask(comp, workspace, c2, cache="0")
    check("拒绝: compact_checkpoint_missing", bool(reply.get("error"))
          and "compact_checkpoint_missing" in json.dumps(reply), json.dumps(reply)[:220])
    chain_path.write_bytes(original)
    reply, _ = fx.ask(comp, workspace, c2, cache="0")
    check("恢复原链后 C2 仍同答", reply.get("content") == oracle2_reply.get("content"))

    print("workdir:", base)
    if FAILURES:
        print("FAILED %d checks: %s" % (len(FAILURES), ", ".join(FAILURES)))
        return 1
    print("ALL CHECKS PASSED")
    shutil.rmtree(base, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
