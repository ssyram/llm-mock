"""FSM 槽位真实回执对账：带内回执被 compaction 抹掉后的泄漏锁，按锁内签发
记录做一次有界只读活体 OC GET 观测，仅凭已验证的终态真实回执释放该唯一锁。

- 释放身份判据（全部满足才释放，缺一不可）：锁内记录的 (session, callId,
  tool, exact arguments) 与活库唯一原生 tool part 逐字绑定——callID 唯一、
  tool 名一致、state.input 与签发参数一致、part/info 属主会话一致——且
  status=completed（exit 缺省或 0）或 error 终态。判定复用
  opencode_tool_receipt.match_tool_part，不从 SQL/门状态/archive/年龄推断。
- pending/running＝仍在飞（不释放）；缺失/重复/错名/错参/异主/畸形/传输不可
  用/旧形状锁（未记 arguments）＝证据不可得（不释放）——一律回落既有等待与
  20s 超时语义，不加时、不盲重置、不触碰其他锁。
- GET 目标会话＝锁内记录的属主会话：那是本 mount 签发时自己写入的记录（非
  外来输入），与 ready.json 同一 loopback 服务器、同样的 http/无凭据/拒绝
  重定向/单次/固定超时/零重试边界（lane_endpoint）。释放前重读锁文件核对
  属主仍为对账对象（session+callId 逐字一致）才 unlink。
- provenance 如实标注 model_visible=False（旁路观测，非模型可见 transcript）。
"""
import json
from pathlib import Path

import opencode_tool_receipt as live_receipt


def _holder_unchanged(lock_path, holder):
    try:
        current = json.loads(Path(lock_path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return (isinstance(current, dict)
            and current.get("session") == holder.get("session")
            and current.get("callId") == holder.get("callId"))


def reconcile(lane_root, lock_path, holder, tool):
    """→ {"outcome": "released"|"pending"|"blocked", ...}；绝不抛出、绝不推进。"""
    if not isinstance(holder, dict) or not isinstance(holder.get("session"), str) \
            or not holder.get("session") or not isinstance(holder.get("callId"), str) \
            or not holder.get("callId") or "arguments" not in holder:
        return {"outcome": "blocked", "reason": "unrecorded-owner-identity"}
    pending = {"id": holder["callId"], "name": tool, "arguments": holder.get("arguments")}
    try:
        host, port, _ready_session = live_receipt.lane_endpoint(Path(lane_root))
        url = "http://%s:%d/session/%s/message" % (
            host, port, live_receipt.quote(holder["session"], safe=""))
        endpoint = "%s:%d" % (host, port)
        matched = live_receipt.match_tool_part(pending, live_receipt._get_messages(url),
                                               holder["session"], endpoint)
    except Exception as error:  # noqa: BLE001  观测失败＝证据不可得＝不释放
        return {"outcome": "blocked", "reason": getattr(error, "kind", "observation-failed")}
    if matched["kind"] == "pending":
        return {"outcome": "pending", "provenance": matched["provenance"]}
    if not _holder_unchanged(lock_path, holder):
        return {"outcome": "blocked", "reason": "holder-changed-during-observation"}
    Path(lock_path).unlink()
    return {"outcome": "released", "provenance": matched["provenance"]}
