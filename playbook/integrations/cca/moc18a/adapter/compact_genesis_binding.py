"""genesis 恢复侧：链上已验证回执的确定性重放（own receipts only）。

用户裁决：渲染史（<conversation> 转述）不再是证据——铸造侧不再存在渲染
绑定（bind_receipts/截断重建/渲染对齐已废除）；本模块只剩恢复侧：把链上
已验证回执（own issued trace＋活体 OC 补绑的产物）按序经原冻结机真实消费，
重建 serial/stage/consumed/vars 与待发 pending，每一步都过原机 expect 契约。

idle 等待交叉（cx13 0022 实证）：回执序列要求继续而机推导出等待文本时，
历史继续只能经由机的自有和解事件（压缩后回 SQL 权威再对账）——reconciled_step
在重放时补一次 compacted 再推导（决策唯一且与历史触发方式无关）；桥接后的
决策仍须逐字匹配与 expect 契约，不匹配照旧 drift。
"""


def _fault(kind, message):
    from cca_bench.suites.mock_results import MockFault
    return MockFault(kind, message)


def _receipt_payload(receipt):
    """绑定回执 → 冻结机 step 的合成 payload（仅该机消费的两个键，无臆造字段）。"""
    return {"trailing": [],
            "last_tool_result": {"toolCallId": receipt["call_id"], "toolName": receipt["tool"],
                                 "isError": False, "text": receipt["result"]}}


def reconciled_step(script, payload):
    """idle 等待交叉的确定性和解（cx13 0022 实证）：回执序列要求继续推进而机推
    导出非终周非工具决策（_loop 的等待文本）时，历史继续只能经由机的自有和解
    事件——压缩后一律回到 SQL 权威再对账（compacted→need_reserve；宿主同样把
    保留摘要回显重放为该事件，main-messages 33/34→s9 实证）。被压缩吞掉的回程
    与压缩触发在冻结机上决策等价（同一编号的 reserve），故按机的确定反应补一次
    compacted 再推导即决策精确：不查当下改写过去、不造 worker/门输出、不碰时
    间戳；等待与终周文本不越权推进，桥接后的决策仍须过全部既有严格核对（name+
    args 逐字、expect 契约），否则照旧 drift。"""
    decision = script.step(payload)
    if decision.get("action") != "tool" and not decision.get("terminal"):
        script.compacted()
        decision = script.step(payload)
    return decision


def _report_gates(on_gate, script, payload, before, receipt):
    """本步真实消费（payload 携回执、原机 expect 通过）新产出的终门键上报给落盘方。

    重放只能识别“哪张绑定回执产出了终门键”（键集合差＋回执身份），绝不能供应
    事件时刻——机时间线在重放里是重放墙钟，把它当原始门时刻＝伪造（cx16 实证：
    原始 81s 间隔被压缩成 1.78ms）。唯一真值＝该回执在铸造侧活体绑定时随链保存
    的权威宿主完成时刻 observed_ns（OC state.time.end，毫秒→纳秒显式换算）；
    回执无 observed_ns＝无真实时刻来源，终门证据诚实缺位（采集器照旧失败），
    绝不回填、绝不精测、绝不以观测当下冒充原始事件。前沿 step 落盘路径（清一
    色真实观测时刻）保留不变，两路先写者胜（O_EXCL＋身份核对见 timing_capture）。
    """
    if on_gate is None or not isinstance(receipt, dict) or not isinstance(receipt.get("observed_ns"), int):
        return
    consumed = script.consumed[-1] if payload.get("last_tool_result") and script.consumed else None
    if consumed is None or consumed != receipt.get("call_id"):
        return
    for key in sorted(set(script.stats["timeline"]) - before):
        if key.endswith("_final_gate_ns"):
            on_gate(key, receipt["observed_ns"], consumed)


def replay_receipts(script, entry, on_gate=None):
    """恢复侧：确定性重放绑定回执，重建 serial/stage/consumed/vars 与待发 pending。

    机快照保持初始（genesis 不在 machine 字段里声称进度）；进度全部由链上已
    验证回执重放重建（每张回执都经原机 expect 消费）：回执与机的确定性决策
    逐字一致（id/name/arguments）＝own chain 才是状态权威，任何文本转述都不
    参与恢复。末张回执消费后机产出的下一决策挂到 script.compact_pending_decision
    供请求层判定首发/已发未覆盖；零回执条目同样推导初始决策。终局决策同样挂起
    （cx16 0463 实证：全部回执消费完毕机到 done，终局文本若在此被丢弃，前沿
    step 即 resubmit_after_success，终局永远无法送达）——请求层对已证完局幂等
    重导同一终局文本，不发新工具、无副作用。回放中真实消费出的终门键经 on_gate
    上报，但时刻只取该回执入链时随附的权威宿主观测时刻（observed_ns）；无该
    真值的回执不上报（终门证据保持缺位），机重放时间线绝不外泄为事件时刻
    （前沿 step 落盘路径保留不变，两路先写者胜）。
    """
    receipts = entry.get("receipts") or []
    payload = {"trailing": [], "last_tool_result": None}
    consumed_receipt = None
    for index, receipt in enumerate(receipts):
        before = set(script.stats["timeline"])
        decision = reconciled_step(script, payload)
        _report_gates(on_gate, script, payload, before, consumed_receipt)
        if decision.get("action") != "tool" or decision.get("id") != receipt["call_id"] \
                or decision.get("name") != receipt["tool"] \
                or decision.get("arguments") != receipt["arguments"]:
            raise _fault("compact_history_drift",
                         "bound receipt %d (%s) no longer replays on the frozen machine"
                         % (index, receipt["call_id"]))
        payload = _receipt_payload(receipt)
        consumed_receipt = receipt
    script.compact_pending_decision = None
    before = set(script.stats["timeline"])
    issued = reconciled_step(script, payload)
    _report_gates(on_gate, script, payload, before, consumed_receipt)
    if issued.get("action") == "tool" or issued.get("terminal"):
        script.compact_pending_decision = issued
