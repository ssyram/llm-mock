"""压缩回执协议：marker 识别与回执载荷解析（纯函数，不含任何恢复逻辑）。

用户裁决：渲染史（<conversation> 转述）不再作为任何证据——本模块不再提供
渲染解析/截断重建；摘要文本只承载一个指向本地静息检查点链条目的不透明
引用，恢复侧只把它当外键解析进本地链（见 compact_state），真实状态与绑定
全在链文件里。root 与 worker 同法。
"""
import json
import re

MARKER_TEXT = "What did we do so far?"
RECEIPT_TYPE = "compact-progress"
_HEX64 = re.compile(r"\A[0-9a-f]{64}\Z")
_PRIOR_SUMMARY = re.compile(r"<prior-summary>\s*(.*?)\s*</prior-summary>", re.DOTALL)


def _fault(kind, message):
    from cca_bench.suites.mock_results import MockFault
    return MockFault(kind, message)


def receipt_text(checkpoint_ref):
    return json.dumps({"type": RECEIPT_TYPE, "checkpoint": checkpoint_ref}, sort_keys=True)


def parse_receipt(text):
    """恰 {"type","checkpoint"} 且 checkpoint 为 64 位小写十六进制；其余 fail closed。"""
    try:
        receipt = json.loads(text)
    except ValueError:
        raise _fault("compact_receipt_invalid", "compaction summary is not valid JSON")
    if (not isinstance(receipt, dict) or set(receipt) != {"type", "checkpoint"}
            or receipt.get("type") != RECEIPT_TYPE
            or not isinstance(receipt.get("checkpoint"), str)
            or not _HEX64.match(receipt["checkpoint"])):
        raise _fault("compact_receipt_invalid",
                     "compaction receipt is not an opaque checkpoint reference")
    return receipt["checkpoint"]


def prior_summary_receipt(text):
    """链式压缩请求携带的 <prior-summary>：宿主转发上一轮回执原文。

    用户裁决：aux 不解析/不绑定/不比较渲染转述里的调用与结果；<prior-summary>
    是摘要请求里唯一被读取的文本，且只接受恰为本协议不透明引用的原文（exact
    own opaque pointer only）。缺块＝None＝首轮压缩形状；非回执形状＝协议损坏
    显式故障。
    """
    found = _PRIOR_SUMMARY.search(text)
    if found is None:
        return None
    return parse_receipt(found.group(1))


def receipt_shaped(message, message_text):
    """恰为本协议结构化回执 JSON（own type/ref）的 assistant 回显 → ref；其余
    一切（畸形 JSON、近似形状、坏 hex、非 assistant）＝None＝丢弃前缀噪声。
    锚判定的唯一形状权威：绝不把渲染文本/子串匹配当作回执，也绝不把任意 JSON
    噪声静默放宽成锚。"""
    if message.get("role") != "assistant":
        return None
    try:
        receipt = json.loads(message_text(message))
    except ValueError:
        return None
    if (not isinstance(receipt, dict) or set(receipt) != {"type", "checkpoint"}
            or receipt.get("type") != RECEIPT_TYPE
            or not isinstance(receipt.get("checkpoint"), str)
            or not _HEX64.match(receipt["checkpoint"])):
        return None
    return receipt["checkpoint"]


def own_anchor(messages, message_text, marker_index):
    """丢弃前缀段扫描（用户裁决的结构法则，root 与 worker 同法）：marker 之后、
    至首条恰为结构化 own 回执回显之间的全部消息（任意角色：旧 assistant 回显/
    旧回执/user 噪声/畸形近似回执文本）＝显式丢弃段——不解析、不匹配、不绑定、
    不触发协议故障。锚＝该首条结构化回显；引用本身仍须由恢复侧经本地链/命名
    空间/会话/spec/adapter 验证（外链/未知/篡改＝fail closed，绝不因还有后候
    选而改试）。无结构化锚＝协议损坏 fail closed，不回落冷重放（绝不把压缩前
    的真实未压缩消息当回退）。"""
    for index in range(marker_index + 1, len(messages)):
        ref = receipt_shaped(messages[index], message_text)
        if ref is not None:
            return index, ref
    raise _fault("compact_echo_missing",
                 "compaction marker present but no structured own compact-progress "
                 "receipt echo follows the discard prefix")
