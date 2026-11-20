"""root 链压缩铸造：own issued trace＋own 链基线＋活体 OC 有序补绑。

用户裁决：渲染史（<conversation> 转述）不再是证据——本模块不解析、不绑定、
不比较渲染文本里的任何调用/结果。进度只来自两个已核实源：
- 本 lane 私有 root 链（append-only，身份绑定见 compact_state）；
- 本 lane handler-trace 的已发决策指纹（own issued trace，非渲染转述）。

切割前已发未覆盖（已送达宿主、回执未绑定）的决策按有序链经活体 OC 会话 API
只读检索补绑（opencode_tool_receipt.observe：属主会话＋call id＋tool 名＋
exact input 逐字核对，completed 且非 error 才绑；消费侧重放过原机 expect）。
检索 pending/running/不可用/缺件＝该槽位诚实 pending：有序链在此停止，绝不
跳绑后续、绝不伪造进度、绝不重发副作用（恢复侧对该形状走等待/活体检索）。
<prior-summary> 只作为 exact own opaque pointer 验证（须解析进本 root 链）。
与 worker_registry.mint 同构，但只读写 root 链（root/worker 角色隔离）。
"""
import time

import compact_genesis
import compact_state

_PENDING_TRANSPORT = frozenset({"compact_receipt_transport_unavailable",
                                "compact_receipt_transport_missing"})


def _fault(kind, message):
    from cca_bench.suites.mock_results import MockFault
    return MockFault(kind, message)


def _bind_uncovered(env, tools, base_receipts, base_sources):
    """有序活体补绑：从基线未覆盖的首枚已发决策起逐枚检索，遇首枚未完成即停。"""
    import opencode_tool_receipt
    from cca_bench.suites.mock_results import MockFault
    receipts, sources = list(base_receipts), list(base_sources)
    for item in tools[len(receipts):]:
        try:
            transport = opencode_tool_receipt.observe(env, {"id": item["id"], "name": item["tool"]})
        except MockFault as fault:
            if fault.kind in _PENDING_TRANSPORT:
                break
            raise
        if transport.get("kind") != "receipt" or transport["receipt"].get("isError"):
            break
        bound = {"call_id": item["id"], "tool": item["tool"],
                 "arguments": transport.get("arguments"),
                 "result": transport["receipt"]["text"], "result_truncated": False}
        observed = transport.get("observed")
        if isinstance(observed, dict) and isinstance(observed.get("completed_ns"), int):
            # 权威宿主完成时刻（OC state.time.end，毫秒→纳秒已在观测侧显式换算）
            # 随回执一并入链：时间戳＋来源与已验证回执同存，供恢复侧唯一真值使用。
            bound["observed_ns"] = observed["completed_ns"]
            bound["observed_source"] = observed.get("source") or "oc-tool-part.state.time.end"
        receipts.append(bound)
        sources.append(transport["provenance"])
    return receipts, sources


def mint(env, machine, prior_ref=None):
    """root 摘要铸造/幂等答复 root 链条目；绝不读写 worker 链、绝不解析渲染史。

    链尾为静息（rest）条目时它即状态权威（幂等答复其引用，不追加）；否则基线
    ＝链尾 genesis 回执（只增不减），prior 引用经验证后不回退进度（过时 prior
    幂等答复链尾）。零进度重复摘要＝同 ref 幂等，不追加。
    """
    entries = compact_state.read_checkpoint(env["records"])
    if entries is not None:
        for entry in entries:
            compact_state.validate_entry(entry, env)
    if prior_ref is not None:
        if not entries:
            raise _fault("compact_checkpoint_missing",
                         "prior summary references a checkpoint but the lane chain is missing")
        compact_state.resolve_entry(entries, prior_ref)
    if entries and not entries[-1].get("genesis"):
        return entries[-1]
    tools = compact_genesis.read_emitted_tools(env["records"], env["root_session"])
    base_receipts = list((entries[-1].get("receipts") or []) if entries else [])
    if [item.get("call_id") for item in base_receipts] != [item["id"] for item in tools[:len(base_receipts)]]:
        raise _fault("compact_history_drift",
                     "root checkpoint receipts are not a prefix of the lane's emitted decisions")
    base_sources = list((entries[-1].get("receipt_sources") or [])
                        if entries else []) or [{"model_visible": True} for _ in base_receipts]
    receipts, sources = _bind_uncovered(env, tools, base_receipts, base_sources)
    entry = compact_genesis.build_entry(env, machine, receipts, sources)
    if entries and entries[-1].get("ref") == entry.get("ref"):
        return entries[-1]
    compact_state.validate_entry(entry, env)
    entry["written_at_ns"] = time.time_ns()
    compact_state.write_chain(env["records"], (entries or []) + [entry])
    return entry
