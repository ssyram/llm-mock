"""终态采集器的入库重建（原 .pi/moc18a/collect_run.py 已不可用）。

按 moc18a 的可观察契约重建：消费 collect_terminal 组装的证据（workers 记录＋
前沿时序观测、门时间线、机器故障），经真实产品 resident service 取终态快照，
产出 final-state.json 与 result.json。判据与旧采集器的离线回归
（collector-feed.test.py）逐字对齐：缺证据即 attempt_incomplete、窗口失序即
wait_window_out_of_order、计划等待与 worker 记录的种子化计划不一致即
planned_wait_out_of_range、缺门时间线即 missing_timeline；全齐才 ok。
原实现的内部细节不可考，此处只重建上述可观察行为，并在 README 记录差异。
"""
import json
from pathlib import Path

from cca_bench.unit_runner import ProductCLI  # noqa: F401  (patch point for offline tests)

REQUIRED_WAIT_FIELDS = ("wait_planned_ns", "wait_start_ns", "wait_end_ns",
                        "wait_actual_mono_ns", "submit_start_ns", "terminal_ns")
REQUIRED_GATES = ("analysis_final_gate_ns", "eqclass_final_gate_ns")
OVERSHOOT_TOLERANCE_NS = 50_000_000


def _write(path, document):
    path.write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def _wait_problems(records):
    problems, waits = [], []
    for record in sorted(records, key=lambda item: str(item.get("logical_task_tag")
                                                       or item.get("logical_label"))):
        label = record.get("logical_task_tag") or record.get("logical_label")
        missing = [field for field in REQUIRED_WAIT_FIELDS if not isinstance(record.get(field), int)]
        if missing:
            problems.append({"attempt_incomplete": label, "missing": missing})
            continue
        if record["wait_start_ns"] >= record["wait_end_ns"]:
            problems.append({"wait_window_out_of_order": label})
            continue
        if record.get("wait_planned_ns") != record.get("planned_sleep_ns"):
            problems.append({"planned_wait_out_of_range": label, "planned_ns": record["wait_planned_ns"]})
            continue
        waits.append(record)
    return problems, waits


def _wait_counts(waits):
    overlap = 0
    for index, first in enumerate(waits):
        for second in waits[index + 1:]:
            overlap = max(overlap, min(first["wait_end_ns"], second["wait_end_ns"])
                          - max(first["wait_start_ns"], second["wait_start_ns"]))
    overshoots = [record.get("logical_task_tag") for record in waits
                  if (record["wait_end_ns"] - record["wait_start_ns"]) - record["wait_planned_ns"]
                  > OVERSHOOT_TOLERANCE_NS or record["wait_actual_mono_ns"] - record["wait_planned_ns"]
                  > OVERSHOOT_TOLERANCE_NS]
    return {"wait_count": len(waits), "max_pairwise_overlap_ns": max(0, overlap),
            "overshoots": overshoots}


def _dispatch_counts(records):
    accepted = [record for record in records if record.get("terminal_outcome") == "accepted"]
    distinct = {(record.get("phase"), target) for record in records
                for target in record.get("targets") or ()}
    return {"worker_count": len(records),
            "submitted": sum(1 for record in records if record.get("submitted")),
            "terminal_accepted": len(accepted),
            "distinct_phase_target_count": len(distinct)}


def collect(home, staging, lane, graph, machine, deltas):
    staging = Path(staging)
    snapshot = ProductCLI(home, lane.workspace, lane.root_session).service_snapshot()
    _write(staging / "final-state.json", {"state": snapshot})
    timeline = dict(machine.main.stats.get("timeline") or {})
    records = list(machine.workers.records())
    problems = []
    if not machine.main.done:
        problems.append({"main_incomplete": True})
    if snapshot is None:
        problems.append({"service_snapshot_missing": True})
    for fault in machine.faults or []:
        problems.append({"machine_fault": fault})
    wait_problems, waits = _wait_problems(records)
    problems += wait_problems
    problems += [{"missing_timeline": gate} for gate in REQUIRED_GATES if gate not in timeline]
    artifact = graph.get("artifact")
    result = {"status": "failed" if problems else "ok", "problems": problems,
              "timeline": {gate: timeline[gate] for gate in timeline if gate in REQUIRED_GATES},
              "counts": {"waits": _wait_counts(waits), "dispatch": _dispatch_counts(records),
                         "ledger": dict(machine.ledger.counts or {})},
              "graph": {"nodes": len(list(artifact.nodes)), "edges": len(list(artifact.edges))},
              "deltas": deltas.usage()}
    _write(staging / "result.json", result)
    return result
