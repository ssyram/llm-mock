"""输入 spec → 运行等级/预算（原 pilot.case_body 的入库重建）。

原实现位于不可入库的私有实验域（.pi/research/gate-latency-mock-148），已丢失；
这里按 cca_bench 的 LevelParams 契约重建等价构造。确定性对偶模式
（lane_context.DETERMINISTIC_MOCK）下 fixed_default_level 会把 delta_p / 点边
上限 / 等待窗口全部压成 0/0/0/0/(0.5,0.5)，因此本模块的字段取值只影响普通
随机模式，且选择已在 README「随机模式重建」一节逐项记录。
"""
from cca_bench.scenarios import LevelParams


def pilot_level(parallel, batch, max_new_nodes):
    armed = max_new_nodes > 0
    return LevelParams(
        name=f"moc18a-p{parallel}b{batch}", initial_v=0, core_k=0,
        core_k_note="reconstructed from input spec (pilot.case_body is not in any repo)",
        para=parallel, max_in_one_batch=batch,
        delta_p=1.0 if armed else 0.0,
        new_node_cap=max_new_nodes,
        new_edge_cap=max_new_nodes if armed else 0,
        retract_edge_cap=0,
        node_budget_frac=1.0, edge_budget_frac=1.0,
        compaction_interval_tasks=8, compaction_transcript_bytes=64_000,
        rate429_main=0.0)


def pilot_budgets(level, nodes, edges, deadline_s, max_new_nodes, max_new_facts):
    """全 run 预算：任务数上界沿 mock_plan.budgets 的公式，但以显式输入替代等级推导。"""
    tasks = 2 * (nodes // max(1, level.max_in_one_batch) + 8) + int(max_new_nodes) + 16
    requests = tasks * 40 + 400
    return {"deadline_s": int(deadline_s), "max_requests": requests, "max_worker_steps": requests,
            "max_new_nodes": int(max_new_nodes), "max_new_facts": int(max_new_facts)}
