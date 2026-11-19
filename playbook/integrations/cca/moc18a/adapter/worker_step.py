"""Worker Segment 业务程序：按已入库 WorkerBook（cca_bench mock_worker +
adapter/worker_wait 等待语义）确定性重放本 worker 会话的已回显决策并核对，
然后给出下一步真实决策。

- 期望表由 transcript 内真实 BENCH-TAG 重建（label→phase），业务步/命令/最小
  材料全部来自入库 WorkerBook（读真实任务包编译）。
- 等待窗口：认领并读包之后、首次写稿之前，真实 sleep planned_sleep_ns
  （adapter/worker_wait.py 重建的等待语义；种子化抽样对同 (label, attempt)
  是纯函数，不重抽）。
- choice tape：old lane 的可回放选择按语义键命中时覆盖抽样（findings 与
  planned sleep），未命中回落 seed 抽样并如实记录。
"""
import json
import os
import sys
import time

sys.path[:0] = [os.path.dirname(os.path.abspath(__file__))]
from lane_context import (build_payload, decision_matches, fault_reply, fixed_default_level, lane_env,
                          request_boundaries, TapeLedger, trace_handler)
from timing_capture import (capture_wait_window, frontier_submit_issuance, frontier_wait_issuance,
                            persist_worker_observation)

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
        outcome = super().draw(package, held)
        if self.tape is None:
            return outcome
        phase = package.get("phase")
        targets = sorted(target["id"] for target in package.get("targets") or ())
        for choice in self.tape.get("choices", []):
            semantic = choice["semantic"]
            if semantic["phase"] != phase or sorted(semantic["targets"]) != targets:
                continue
            if semantic["kind"] != task_kind(package) and semantic.get("cycle") != bool(package.get("is_cycle")):
                continue
            self.notes.append({"matched": semantic["attempt"], "planned_sleep_ns": choice["plannedSleepNs"]})
            outcome["record"] = dict(choice["record"], label=outcome["record"]["label"])
            outcome["findings"] = choice["findings"]
            self.taped_sleep_ns = choice["plannedSleepNs"]
            return outcome
        self.notes.append({"matched": None, "reason": "no semantic tape entry"})
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
    for message in messages:
        if message.get("role") == "user":
            from lane_context import extract_tag
            tag = extract_tag(messages)
            break
    if tag is None or tag.get("role") != "worker":
        print(json.dumps(fault_reply("worker_step: transcript carries no worker BENCH-TAG"), ensure_ascii=False))
        return
    workers.expect(tag["task"], tag["phase"])
    pointer = envelope["pointer"]
    boundaries = request_boundaries(messages)
    resume = (pointer < len(messages) and messages[pointer].get("role") == "assistant"
              and pointer + 1 < len(messages) and messages[pointer + 1].get("role") == "toolResult")
    walk = (pointer < len(messages) and messages[pointer].get("role") == "assistant" and not resume)
    upto = pointer if resume else pointer - 1
    try:
        for boundary in [b for b in boundaries if b <= upto]:
            payload = build_payload(raw, boundary)
            payload["tag"] = tag
            decision = workers.step(payload, tag)
            if not decision_matches(decision, messages[boundary]):
                raise MockFault("replay_drift", "replayed %r but transcript has %r"
                                % (decision.get("id"),
                                   json.dumps(messages[boundary].get("content"), ensure_ascii=False)[:300]))
        jump = None
        if resume:
            jump = pointer + 1
            while jump < len(messages) and messages[jump].get("role") == "toolResult":
                jump += 1
        boundary = pointer if walk else (jump if resume else len(messages))
        payload = build_payload(raw, boundary)
        payload["tag"] = tag
        decision = workers.step(payload, tag)
        state = workers.by_session.get(payload.get("session_id")) or \
            next(iter([s for s in workers.by_session.values() if s.label == tag["task"]]), None)
        pending = state.record.pop("pending_wait_ns", None) if (state and not walk) else None
        session = payload.get("session_id")
        if not boundaries:
            persist_worker_observation(env["records"], tag["task"], tag["phase"], session,
                                       {"first_request_ns": entered_ns})
        if boundary == len(messages) and frontier_submit_issuance(state, decision):
            persist_worker_observation(env["records"], tag["task"], tag["phase"], session,
                                       {"submit_start_ns": time.time_ns(), "submit_call_id": decision.get("id")})
        trace_handler(env, session, {
            "tag": tag, "case": "resume" if resume else "walk" if walk else "frontier",
            "pointer": pointer, "boundary": boundary, "jump": jump,
            "verified_call_ids": [messages[b].get("content", [{}])[0].get("id")
                                  for b in request_boundaries(messages) if b <= upto],
            "tape_notes": notes, "planned_wait_ns": pending,
            "decision": {"action": decision.get("action"), "id": decision.get("id"),
                         "name": decision.get("name")}})
    except MockFault as fault:
        sys.stderr.write(f"worker_step {fault.kind}: {fault}\n")
        raise SystemExit(3)
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
        window = capture_wait_window(lambda: time.sleep(pending / 1e9), pending)
        persist_worker_observation(env["records"], tag["task"], tag["phase"], session,
                                   {**window, "wait_call_id": decision.get("id")})
    print(json.dumps(assistant_reply(decision, jump), ensure_ascii=False))


if __name__ == "__main__":
    main()
