"""Worker Segment 业务程序：按已入库 WorkerBook（cca_bench mock_worker +
adapter/worker_wait 等待语义）确定性重放本 worker 会话的已回显决策并核对，
然后给出下一步真实决策。

- 期望表由 transcript 内真实 BENCH-TAG 重建（label→phase），业务步/命令/最小
  材料全部来自入库 WorkerBook（读真实任务包编译）。
- 等待窗口：认领并读包之后、首次写稿之前，真实 sleep planned_sleep_ns
  （adapter/worker_wait.py 重建的等待语义；种子化抽样对同 (label, attempt)
  是纯函数，不重抽）。
- choice tape：old lane 的可回放选择按语义键命中时覆盖抽样（findings 与
  planned sleep），未命中回落 seed 抽样并如实记录。契约看包形不看带：携带
  intent_head 的 staged 包即使带内取抽样，也先真实读本任务 intent.md 再产出
  合规材料；仅无 intent_head 的真正旧归档包才逐字重放、不读不注。
"""
import json
import os
import sys
import time

sys.path[:0] = [os.path.dirname(os.path.abspath(__file__))]
import compact_inflight_wait
import worker_registry
import worker_resume
from lane_context import (build_payload, fixed_default_level, lane_env,
                          message_text, request_boundaries, TapeLedger, trace_handler)
from intent_material import intent_compliance, intent_read_note, read_intent_material
from timing_capture import (capture_wait_window, frontier_submit_issuance, frontier_wait_issuance,
                            persist_worker_observation, worker_timing_path)

from case_body import pilot_budgets, pilot_level
from worker_wait import WaitDeltaBook, WaitWorkerBook
from cca_bench.suites.mock_faults import Injection
from cca_bench.suites.mock_results import MockFault
from cca_bench.suites.mock_worker import task_kind


class TapedDeltaBook(WaitDeltaBook):
    def __init__(self, *args, tape=None, notes=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.tape = tape
        self.notes = notes if notes is not None else []

    def draw(self, package, held=()):
        phase = package.get("phase")
        targets = sorted(target["id"] for target in package.get("targets") or ())
        replay = None
        if self.tape is not None:
            for choice in self.tape.get("choices", []):
                semantic = choice["semantic"]
                if semantic["phase"] != phase or sorted(semantic["targets"]) != targets:
                    continue
                if semantic["kind"] != task_kind(package) and semantic.get("cycle") != bool(package.get("is_cycle")):
                    continue
                replay = choice
                break
        # 契约看包形，不看带：带命中只供选择，不隐含旧产品契约。staged 包形（包内
        # 携带 intent_head）即便取带内抽样，也先真实读本任务 intent.md，再把带内
        # findings 以拷贝注入当下读得的 intent_compliance（旧句若在带内则不保留——
        # 那是对旧任务读取的陈述，不是本任务的）；真正的旧归档包（无 intent_head）
        # 才逐字重放，不读不注（旧回放工作区无此材料）。
        staged = "intent_head" in package
        material = read_intent_material(package) if replay is None or staged else None
        outcome = super().draw(package, held)
        if replay is None:
            if self.tape is not None:
                self.notes.append({"matched": None, "reason": "no semantic tape entry"})
            outcome["findings"]["intent_compliance"] = intent_compliance(material, outcome["findings"])
            self.notes.append(intent_read_note(material))
            return outcome
        self.notes.append({"matched": replay["semantic"]["attempt"], "planned_sleep_ns": replay["plannedSleepNs"]})
        outcome["record"] = dict(replay["record"], label=outcome["record"]["label"])
        if staged:
            outcome["findings"] = dict(replay["findings"])
            outcome["findings"]["intent_compliance"] = intent_compliance(material, outcome["findings"])
            self.notes.append(intent_read_note(material))
        else:
            outcome["findings"] = replay["findings"]
        self.taped_sleep_ns = replay["plannedSleepNs"]
        return outcome


def assistant_reply(decision, jump):
    if decision.get("action") == "text":
        content = [{"type": "text", "text": decision["text"]}]
        stop_reason = "stop"
    else:
        content = [{"type": "toolCall", "id": decision["id"], "name": decision["name"],
                    "arguments": decision["arguments"]}]
        stop_reason = "toolUse"
    reply = {"assistant": {"content": content, "stopReason": stop_reason}}
    if jump is not None:
        reply["pointer"] = jump
    return reply


def main():
    entered_ns = time.time_ns()
    envelope = json.loads(sys.stdin.read())
    raw = json.loads(open(envelope["transcript"], encoding="utf-8").read())
    messages = ((raw.get("request") or {}).get("context") or {}).get("messages") or []
    env = lane_env()
    spec, mock = env["spec"], env["spec"]["mock"]
    level = fixed_default_level(spec, pilot_level(spec["parallel"], spec["batch"], mock["max_new_nodes"]))
    nodes, edges = len(spec["nodes"]), len(spec["edges"])
    budgets = pilot_budgets(level, nodes, edges, 1800, mock["max_new_nodes"], mock["max_new_facts"])
    ledger = TapeLedger(env["records"])
    notes = []
    deltas = TapedDeltaBook(level, spec["seed"], nodes, edges, budgets, tape=env["tape"], notes=notes)
    workers = WaitWorkerBook(level.name, deltas, ledger, env["workspace"], env["root_session"], "product", Injection())
    tag = None
    session = ((raw.get("request") or {}).get("options") or {}).get("sessionId")
    bound = worker_registry.binding(env["records"], session) if session else None
    if bound is not None:
        # 持久绑定是唯一身份权威：压缩后续行绝不从转录文本（含锚前渲染转述）取 tag。
        tag = worker_registry.tag_of(bound)
    if tag is None:
        from lane_context import extract_tag
        tag = extract_tag(messages)
        if tag is not None and tag.get("role") != "worker":
            tag = None
    if tag is None:
        tag = worker_registry.binding_tag(env["records"], session)
    if tag is None:
        sys.stderr.write("worker_step untagged_request: transcript carries no worker BENCH-TAG"
                         " and the session has no registered worker identity\n")
        raise SystemExit(3)
    workers.expect(tag["task"], tag["phase"])
    pointer = envelope["pointer"]
    boundaries = request_boundaries(messages)
    resume = (pointer < len(messages) and messages[pointer].get("role") == "assistant"
              and pointer + 1 < len(messages) and messages[pointer + 1].get("role") == "toolResult")
    walk = (pointer < len(messages) and messages[pointer].get("role") == "assistant" and not resume)
    upto = pointer if resume else pointer - 1
    try:
        # 丢弃前缀段法则与 main 同法（唯一形状/验证权威在 worker_resume.discard_floor）：
        # marker 与锚之间的一切＝显式丢弃段；锚引用经 worker 命名空间验证。
        floor, base = worker_resume.discard_floor(env, messages, bound)
        restore_decision, restore_pending = None, False
        if floor and pointer < floor:
            # 合法解释器续行：指针跳至锚＋idle 逐字重导锚回执（引擎经 say 回环
            # 在锚位采纳）；被丢弃的旧回显/回执绝不由引擎逐条匹配采纳，也不驱动机。
            print(json.dumps({"pointer": floor, "result": "idle",
                              "values": {"idle_text": message_text(messages[floor])}},
                             ensure_ascii=False))
            return
        covered = {item["call_id"]: item for item in ((base or {}).get("receipts") or [])}
        if base is not None:
            restore_decision, restore_pending = worker_registry.replay_receipts(workers, tag, session, base)
        suffix_stepped = worker_resume.replay_suffix(workers, tag, session, raw, messages, boundaries,
                                                     floor, upto, bound, covered,
                                                     restore_decision, restore_pending)
        if walk:
            idle_echo = worker_resume.walk_compaction_echo(env, bound, messages, pointer)
            if idle_echo is not None:
                print(json.dumps({"result": "idle", "values": {"idle_text": idle_echo}},
                                  ensure_ascii=False))
                return
        jump = None
        if resume:
            jump = pointer + 1
            while jump < len(messages) and messages[jump].get("role") == "toolResult":
                jump += 1
        boundary = pointer if walk else (jump if resume else len(messages))
        payload = build_payload(raw, boundary)
        payload["tag"] = tag
        state = workers.by_session.get(payload.get("session_id")) or \
            next(iter([s for s in workers.by_session.values() if s.label == tag["task"]]), None)
        decision, receipt_via, waiting = worker_resume.frontier_decision(
            workers, tag, env, session, messages, pointer, boundary, payload, walk, floor,
            suffix_stepped, covered, restore_decision, restore_pending, state)
        pending = state.record.pop("pending_wait_ns", None) if (state and not walk) else None
        session = payload.get("session_id")
        if not boundaries:
            persist_worker_observation(env["records"], tag["task"], tag["phase"], session,
                                       {"first_request_ns": entered_ns})
        if boundary == len(messages) and frontier_submit_issuance(state, decision):
            persist_worker_observation(env["records"], tag["task"], tag["phase"], session,
                                       {"submit_start_ns": time.time_ns(), "submit_call_id": decision.get("id")})
        trace = {
            "tag": tag, "case": "resume" if resume else "walk" if walk else "frontier",
            "pointer": pointer, "boundary": boundary, "jump": jump, "compact_floor": floor,
            "verified_call_ids": [messages[b].get("content", [{}])[0].get("id")
                                  for b in request_boundaries(messages) if floor < b <= upto],
            "tape_notes": notes, "planned_wait_ns": pending,
            "decision": None if waiting else {"action": decision.get("action"), "id": decision.get("id"),
                                               "name": decision.get("name")}}
        if receipt_via is not None:
            trace["receipt_via"] = receipt_via
        if waiting is not None:
            trace["waiting_receipt"] = waiting
        trace_handler(env, session, trace)
    except MockFault as fault:
        sys.stderr.write(f"worker_step {fault.kind}: {fault}\n")
        raise SystemExit(3)
    if decision.get("wait_receipt"):
        # 等待应答＝idle 逐字重导（引擎经 say 采纳）：不终局、不落盘、无副作用。
        print(json.dumps({"result": "idle", "values": {"idle_text": compact_inflight_wait.wait_text(decision["wait_receipt"])}},
                          ensure_ascii=False))
        return
    if decision.get("action") == "text":
        if boundary == len(messages):
            persist_worker_observation(env["records"], tag["task"], tag["phase"], session,
                                       {"terminal_ns": time.time_ns()})
        (env["records"] / ("worker-%s.json" % tag["task"])).write_text(json.dumps(
            {"tag": tag, "records": workers.records(), "tape_notes": notes}, ensure_ascii=False, indent=1),
            encoding="utf-8")
        with (env["records"] / "tape-consumption.jsonl").open("a", encoding="utf-8") as stream:
            for note in notes:
                stream.write(json.dumps({"task": tag["task"], "phase": tag["phase"], **note},
                                        ensure_ascii=False) + "\n")
    elif pending and boundary == len(messages) and frontier_wait_issuance(state, decision):
        # wait-once：同 (task, session) 已记录过真实等待窗口＝不再重复睡眠。
        timing_path = worker_timing_path(env["records"], tag["task"])
        timing = {}
        if timing_path.is_file():
            try:
                timing = json.loads(timing_path.read_text(encoding="utf-8"))
            except ValueError:
                timing = {}
        if not (timing.get("session_id") == session and timing.get("wait_end_ns") is not None):
            window = capture_wait_window(lambda: time.sleep(pending / 1e9), pending)
            persist_worker_observation(env["records"], tag["task"], tag["phase"], session,
                                       {**window, "wait_call_id": decision.get("id")})
    print(json.dumps(assistant_reply(decision, jump), ensure_ascii=False))


if __name__ == "__main__":
    main()
