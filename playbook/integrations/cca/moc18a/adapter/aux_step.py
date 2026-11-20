"""aux Segment 业务程序：title / Stop 门 / compaction 三类旁路模型请求。

分类逐字对齐入库 ScenarioMachine._classify；Main 状态由本会话 transcript 重放
已入库 MainScript（cca_bench mock_main + adapter/main_intent）重建（gate 的
waiting/active 与 compaction 的账本计数同源）。

用户裁决：压缩请求里的渲染史（<conversation> 转述）不解析、不绑定、不比较
——root 链铸造只经 compact_root_mint（own trace＋own 链＋活体 OC 有序补绑）；
worker 子会话摘要经 worker_registry 属主实现。<prior-summary> 只接受恰为
本协议不透明引用的原文（exact own opaque pointer only）。
"""
import json
import os
import sys

sys.path[:0] = [os.path.dirname(os.path.abspath(__file__))]
import compact_machine
import compact_receipt
import compact_root_mint
import worker_registry
from lane_context import (build_payload, decision_matches, fixed_default_level, lane_env, message_text, request_boundaries, TapeLedger)
from phase_entry import phase_entry

from case_body import pilot_budgets, pilot_level
from worker_wait import WaitDeltaBook, WaitWorkerBook
from main_intent import IntentMainScript
from cca_bench.suites.mock_faults import Injection
from cca_bench.suites.mock_results import MockFault


def build_script(env, ledger):
    spec, mock = env["spec"], env["spec"]["mock"]
    level = fixed_default_level(spec, pilot_level(spec["parallel"], spec["batch"], mock["max_new_nodes"]))
    nodes, edges = len(spec["nodes"]), len(spec["edges"])
    budgets = pilot_budgets(level, nodes, edges, 1800, mock["max_new_nodes"], mock["max_new_facts"])
    deltas = WaitDeltaBook(level, spec["seed"], nodes, edges, budgets)
    workers = WaitWorkerBook(level.name, deltas, ledger, env["workspace"], env["root_session"], "product", Injection())
    return IntentMainScript(workers, lambda phase: phase_entry(env, phase, replay=True),
                           "BENCH-TAG role=main phase=analysis task=main kind=main", Injection())


def latest_main_verdict(env, script):
    path = env["records"] / "handler-trace.jsonl"
    if path.exists():
        for line in reversed(path.read_text(encoding="utf-8").splitlines()):
            row = json.loads(line)
            if row.get("session") == env["root_session"] and "gate_verdict" in row:
                return row["gate_verdict"]
    return script.gate_verdict()


def prior_summary_ref(messages):
    """<prior-summary> 的 exact own opaque pointer；缺块＝None＝首轮压缩形状。"""
    for message in messages:
        if message.get("role") == "user" and "<prior-summary>" in message_text(message):
            return compact_receipt.prior_summary_receipt(message_text(message))
    return None


def main():
    envelope = json.loads(sys.stdin.read())
    raw = json.loads(open(envelope["transcript"], encoding="utf-8").read())
    messages = ((raw.get("request") or {}).get("context") or {}).get("messages") or []
    payload = build_payload(raw, len(messages))
    env = lane_env()
    ledger = TapeLedger(env["records"])
    script = build_script(env, ledger)
    kind = "title"
    if "title generator" not in (payload.get("system_head") or ""):
        if "StructuredOutput" in (payload.get("tool_names") or ()):
            kind = "gate"
        elif not payload.get("tools_count"):
            kind = "compaction"
    session = ((raw.get("request") or {}).get("options") or {}).get("sessionId") or ""
    bound = worker_registry.binding(env["records"], session) if session else None
    if bound is None:
        try:
            for boundary, echo in zip(request_boundaries(messages),
                                      [m for m in messages if m.get("role") == "assistant"]):
                content = echo.get("content") or []
                if any(isinstance(b, dict) and b.get("type") == "toolCall" and b.get("name") == "StructuredOutput"
                       for b in content):
                    continue
                decision = script.step(build_payload(raw, boundary))
                if not decision_matches(decision, echo):
                    raise MockFault("replay_drift", "aux replay diverged at message %d" % boundary)
        except MockFault as fault:
            # 段程序失败契约与 main_step/worker_step 一致：stderr＋非零退出，由解释器
            # 转 playbook_program_error（含根因）；stdout 顶层 error 键不在段 ABI 白名单。
            sys.stderr.write(f"aux_step {fault.kind}: {fault}\n")
            raise SystemExit(3)
    if kind == "title":
        print(json.dumps({"assistant": {"content": [{"type": "text", "text": "bench mock run"}],
                                        "stopReason": "stop"}}, ensure_ascii=False))
        return
    if kind == "gate":
        verdict = latest_main_verdict(env, script)
        print(json.dumps({"assistant": {"content": [
            {"type": "toolCall", "id": "gate.%d" % len(script.stats["gate_verdicts"]),
             "name": "StructuredOutput", "arguments": verdict}], "stopReason": "toolUse"}},
            ensure_ascii=False))
        return
    # 压缩回执＝最小机器可读 JSON：一个指向本地检查点链条目的不透明引用。渲染
    # 转述（<conversation>）不是证据：铸造只来自 own 链＋own handler-trace＋
    # 活体 OC 有序补绑（completed 才绑；pending/running/不可用＝诚实 pending，
    # 不伪造进度、不重发副作用）；链缺失的诚实应答＝零回执 genesis 条目。
    try:
        if kind == "compaction" and session != env["root_session"]:
            # worker 子会话自身的压缩：身份/注册/链式 prior 由 worker_registry
            # 属主实现；应答只引用 worker 专属链，绝不读写/铸造 root 链。
            entry = worker_registry.summary_entry(env, session, bound, messages)
        else:
            machine = compact_machine.snapshot_script(build_script(env, ledger))
            entry = compact_root_mint.mint(env, machine, prior_summary_ref(messages))
        text = compact_receipt.receipt_text(entry["ref"])
    except MockFault as fault:
        sys.stderr.write(f"aux_step {fault.kind}: {fault}\n")
        raise SystemExit(3)
    script.compacted()
    print(json.dumps({"assistant": {"content": [{"type": "text", "text": text}],
                                    "stopReason": "stop"}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
