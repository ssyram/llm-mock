"""Genesis 基线：任何静息点之前到达的原生压缩摘要的诚实应答层。

原生宿主可在首个静息检查点之前触发自动压缩（真实证据 0002：FSM enter 的
巨型 instructions 把上下文顶过阈值）。此时链上没有可引用的静息基线，但
“无基线”不等于“无话可说”：lane 自己的 handler-trace 是已核实观测——本 lane
按序发出过哪些 main 决策。genesis 条目把这份观测绑定进链：

- machine 快照＝全新初始机（不声称任何进度）；receipts＝已发决策中经活体
  OC 严格检索（session/call/tool/args＋原机 expect，见 compact_root_mint）
  补绑的 completed 真实回执，恢复侧重放重建进度并导出待发决策（绑定/重放
  在 compact_genesis_binding）；渲染转述（<conversation>）不再是证据；
- emitted_decisions＝按序的决策指纹（action+id）：已发未覆盖（已送达宿主、
  回执未绑定）＝诚实 pending，绝不伪造进度、绝不重发副作用。

用户裁决：marker 与锚之间的一切＝显式丢弃段——root 不再按保留尾法则核对/
重步进/收养锚前旧回显（verify_retained 已废除）。本模块不含链写盘/身份绑定
（compact_state 职责）：只构造条目与域校验。
"""

import json


def _fault(kind, message):
    from cca_bench.suites.mock_results import MockFault
    return MockFault(kind, message)


def read_emitted_decisions(records_dir, root_session):
    """handler-trace 主会话决策行的按序指纹（lane 自有核实观测，非摘要文本）。

    传输重放/walk 会对同一决策重复记行，但 transcript 只含一条对应回显：被发
    决策按首次出现去重。静息点之前（genesis 生效域）全部决策都是带唯一 id 的
    工具决策；文本决策仅终周可现，不参与去重依据。
    """
    path = records_dir / "handler-trace.jsonl"
    if not path.is_file():
        return []
    emitted, seen = [], set()
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            raise _fault("compact_trace_corrupt", "handler-trace row is not valid JSON")
        decision = row.get("decision") if row.get("session") == root_session else None
        if not isinstance(decision, dict):
            continue
        action, call_id = decision.get("action"), decision.get("id")
        if action not in ("tool", "text"):
            raise _fault("compact_trace_corrupt", "handler-trace decision action out of domain")
        if action == "tool":
            if call_id in seen:
                continue
            seen.add(call_id)
            emitted.append({"action": "tool", "id": call_id})
        else:
            emitted.append({"action": "text", "id": None})
    return emitted


def read_emitted_tools(records_dir, root_session):
    """handler-trace 主会话已发工具决策的 (id, tool) 序列：活体检索的最小属主身份。"""
    path = records_dir / "handler-trace.jsonl"
    if not path.is_file():
        return []
    emitted, seen = [], set()
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            raise _fault("compact_trace_corrupt", "handler-trace row is not valid JSON")
        decision = row.get("decision") if row.get("session") == root_session else None
        if isinstance(decision, dict) and decision.get("action") == "tool" \
                and decision.get("id") not in seen:
            seen.add(decision.get("id"))
            emitted.append({"id": decision.get("id"), "tool": decision.get("name")})
    return emitted


def build_entry(env, machine, receipts=None, receipt_sources=None):
    import compact_state

    if machine.get("stage") != "start" or machine.get("consumed") or machine.get("serial") != 0:
        raise _fault("compact_genesis_invalid", "genesis baseline must snapshot an initial machine")
    entry = {
        "session": env["root_session"],
        "spec_sha256": compact_state.file_sha256(env["root"] / "input-spec.json"),
        "adapters": compact_state.adapter_identities(),
        "genesis": True,
        "emitted_decisions": read_emitted_decisions(env["records"], env["root_session"]),
        "receipts": receipts or [],
        "receipt_sources": list(receipt_sources) if receipt_sources is not None
        else [{"model_visible": True} for _ in (receipts or [])],
        "rest": {"serial": machine["serial"], "consumed_tail": None, "waiting_text_sha256": None},
        "pending": None, "queue": [],
        "machine": machine,
    }
    entry["ref"] = compact_state.entry_ref(entry)
    return entry


def validate(entry):
    """genesis 条目域校验（身份绑定与 ref 自洽由 compact_state.validate_entry 统一做）。"""
    rest = entry.get("rest") or {}
    if rest.get("consumed_tail") is not None or rest.get("waiting_text_sha256") is not None:
        raise _fault("compact_genesis_invalid", "genesis entry must not carry rest anchors")
    emitted = entry.get("emitted_decisions")
    if not isinstance(emitted, list):
        raise _fault("compact_genesis_invalid", "genesis emitted_decisions must be a list")
    receipts = entry.get("receipts") or []
    if not isinstance(receipts, list):
        raise _fault("compact_genesis_invalid", "genesis receipts must be a list")
    sources = entry.get("receipt_sources")
    if sources is not None and (not isinstance(sources, list) or len(sources) != len(receipts)
                                or any(not isinstance(item, dict) for item in sources)):
        raise _fault("compact_genesis_invalid",
                     "genesis receipt sources must be an object list aligned with receipts")
    tool_ids = [item.get("id") for item in emitted if item.get("action") == "tool"]
    base_keys = {"call_id", "tool", "arguments", "result", "result_truncated"}
    observed_keys = {"observed_ns", "observed_source"}
    for index, receipt in enumerate(receipts):
        if not isinstance(receipt, dict) or not base_keys <= set(receipt) \
                or set(receipt) - base_keys - observed_keys:
            raise _fault("compact_genesis_invalid", "genesis bound receipt out of domain")
        if len(observed_keys & set(receipt)) == 1:
            raise _fault("compact_genesis_invalid",
                         "genesis receipt observed time must carry both timestamp and source")
        if "observed_ns" in receipt and (not isinstance(receipt["observed_ns"], int)
                                          or isinstance(receipt["observed_ns"], bool)
                                          or receipt["observed_ns"] <= 0
                                          or not isinstance(receipt["observed_source"], str)
                                          or not receipt["observed_source"]):
            raise _fault("compact_genesis_invalid",
                         "genesis receipt observed time carries invalid field values")
        if not isinstance(receipt.get("call_id"), str) or not isinstance(receipt.get("tool"), str) \
                or not isinstance(receipt.get("arguments"), dict) or not isinstance(receipt.get("result"), str) \
                or not receipt["result"] or not isinstance(receipt.get("result_truncated"), bool):
            raise _fault("compact_genesis_invalid", "genesis bound receipt carries invalid field values")
        if index >= len(tool_ids) or receipt["call_id"] != tool_ids[index]:
            raise _fault("compact_genesis_invalid",
                         "genesis receipts must align with the emitted tool decision prefix")
    for item in emitted:
        if not isinstance(item, dict) or set(item) != {"action", "id"} \
                or item.get("action") not in ("tool", "text"):
            raise _fault("compact_genesis_invalid", "genesis emitted decision out of domain")
        if item.get("action") == "tool" and not isinstance(item.get("id"), str):
            raise _fault("compact_genesis_invalid", "genesis tool decision lacks its call id")
        if item.get("action") == "text" and item.get("id") is not None:
            raise _fault("compact_genesis_invalid", "genesis text decision must not carry an id")
    return entry
