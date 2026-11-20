"""输入 spec → 运行等级/预算（原 pilot.case_body 的入库重建）。

随机参数由 spec.mock 显式治理，字段即旧 pilot 固定常量的既有含义：
delta_p=delta_probability、每任务点/边/extern 上限=max_*_per_task、等待窗口
=wait_seconds。r128c 实跑 spec（.pi/npr/r128c/input-spec.json）逐字段为
0.5/1/1/0/(0.5,3.0)，与旧 pilot_level 的恒参（LEVELS["mock-0"] 之上 replace
delta_p=0.5, new_node_cap=1, new_edge_cap=1, retract_edge_cap=0）完全一致，
故按 spec 取值即恢复旧随机行为；本模块不得发明 spec 之外的默认概率/上限
（合并期 armed→delta 1.0、run 预算误作每任务上限的映射即此类未经请求的
默认变更，已撤销）。确定性对偶模式（lane_context.DETERMINISTIC_MOCK）声明
全零上限+(0.5,0.5)，fixed_default_level 在其上再压平一次，双保险不变。
initial_v/core_k 在本 lane 运行时无消费方（仅 mock_plan 使用），保持 0。
"""
from cca_bench.scenarios import LevelParams


def pilot_level(parallel, batch, mock):
    return LevelParams(
        name=f"moc18a-p{parallel}b{batch}", initial_v=0, core_k=0,
        core_k_note="spec-governed random fields (old pilot: LEVELS['mock-0'] + fixed 0.5/1/1/0)",
        para=parallel, max_in_one_batch=batch,
        delta_p=float(mock["delta_probability"]),
        new_node_cap=int(mock["max_new_nodes_per_task"]),
        new_edge_cap=int(mock["max_new_edges_per_task"]),
        retract_edge_cap=int(mock["max_external_marks_per_task"]),
        sleep_s_range=tuple(float(v) for v in mock["wait_seconds"]),
        node_budget_frac=1.0, edge_budget_frac=1.0,
        compaction_interval_tasks=8, compaction_transcript_bytes=64_000,
        rate429_main=0.0)


def pilot_budgets(level, nodes, edges, deadline_s, max_new_nodes, max_new_facts):
    """全 run 预算：任务数上界沿 mock_plan.budgets 的公式，但以显式输入替代等级推导。"""
    tasks = 2 * (nodes // max(1, level.max_in_one_batch) + 8) + int(max_new_nodes) + 16
    requests = tasks * 40 + 400
    return {"deadline_s": int(deadline_s), "max_requests": requests, "max_worker_steps": requests,
            "max_new_nodes": int(max_new_nodes), "max_new_facts": int(max_new_facts)}
