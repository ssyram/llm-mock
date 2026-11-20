"""Worker 子会话可信身份注册簿 + worker 专属压缩检查点链（与 root 链分文件）。

身份只在"真 tag 在场"时落定：route 判 worker 车道的真实 worker 请求，或
worker 会话首个摘要请求内仍携的真 BENCH-TAG。压缩后的无 tag 请求只读绑定
恢复角色，绝不据内容重注册。绑定按会话一次性 O_EXCL 创建：root＝foreign、
同会话异任务/相位＝conflict、同值重入幂等。worker 检查点按任务名单独落盘，
条目绑定会话/任务/相位/root/spec/适配器与自洽 ref；worker_step 恢复只认本
命名空间——缺失/异会话/身份不符＝显式阻塞（角色可恢复但机器不可恢复＝诚实
阻塞，绝不伪装成功路由）。
"""
import json
import os
import tempfile
import time
from pathlib import Path

import compact_receipt
from lane_context import extract_tag, message_text
from compact_state import entry_ref, file_sha256

BINDING_DIR = "worker-bindings"
CHAIN_NAME = "compact-worker-checkpoint-%s.json"
ADAPTER_FILES = ("lane_context.py", "aux_step.py", "new_reply.py", "worker_step.py",
                 "compact_receipt.py", "worker_registry.py", "worker_resume.py")


def _fault(kind, message):
    from cca_bench.suites.mock_results import MockFault
    return MockFault(kind, message)


def canon(value):
    import hashlib
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def tag_of(binding):
    return {"role": binding["role"], "phase": binding["phase"],
            "task": binding["task"], "kind": binding["kind"]}


def binding_path(records, session):
    return Path(records) / BINDING_DIR / (canon(session) + ".json")


def binding(records, session):
    try:
        return json.loads(binding_path(records, session).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def binding_tag(records, session):
    found = binding(records, session)
    return tag_of(found) if found else None


def register(records, root_session, session, tag):
    """真 tag 在场的可信注册：拒绝 root 冒充与同会话异身份；同值幂等。"""
    if not session:
        raise _fault("worker_identity_invalid", "worker request carries no session id")
    if session == root_session:
        raise _fault("worker_identity_foreign", "root session must not register as a worker")
    existing = binding(records, session)
    if existing is not None:
        if tag_of(existing) != tag:
            raise _fault("worker_identity_conflict", "session %r is bound to %r, request claims %r"
                         % (session, tag_of(existing), tag))
        return tag
    entry = dict(tag, session=session, root_session=root_session, registered_at_ns=time.time_ns())
    path = binding_path(records, session)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(entry, stream, ensure_ascii=False, sort_keys=True)
    return tag


def adapter_identities():
    here = Path(__file__).resolve().parent
    return {name: file_sha256(here / name) for name in ADAPTER_FILES}


def read_chain(records, task):
    path = Path(records) / (CHAIN_NAME % task)
    if not path.is_file():
        return []
    try:
        entries = json.loads(path.read_text(encoding="utf-8"))
    except ValueError:
        raise _fault("compact_worker_checkpoint_corrupt", "worker checkpoint chain is not valid JSON")
    if not isinstance(entries, list) or not entries:
        raise _fault("compact_worker_checkpoint_corrupt", "worker checkpoint chain is not an entry list")
    return entries


def emitted_decisions(records, session):
    """handler-trace 内该 worker 会话的按序已发工具决策（lane 自有核实观测）。"""
    path = Path(records) / "handler-trace.jsonl"
    if not path.is_file():
        return []
    emitted, seen = [], set()
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            row = json.loads(line)
        except ValueError:
            raise _fault("compact_trace_corrupt", "handler-trace row is not valid JSON")
        decision = row.get("decision") if row.get("session") == session else None
        if isinstance(decision, dict) and decision.get("action") == "tool" and decision.get("id") not in seen:
            seen.add(decision.get("id"))
            emitted.append({"id": decision.get("id"), "tool": decision.get("name")})
    return emitted


def summary_entry(env, session, bound, messages):
    """worker 摘要请求的身份/绑定/铸造（aux_step 压缩分支的 worker 属主实现）。

    身份只认本注册簿持久绑定（真 tag 注册点＝route 的真实 worker 请求）。
    压缩渲染文本（<conversation> 转述）不解析、不绑定、不推断身份：进度只
    来自链上已验证回执（append-only）＋活体 OC 对未覆盖已发决策的只读检索
    （issued ≠ success：无 completed 回执＝pending，不铸造、不回退、不 fault）。
    """
    if bound is None:
        raise _fault("worker_identity_unknown",
                     "compaction on non-root session %r without a registered worker identity" % session)
    prior_ref = None
    for message in messages:
        if message.get("role") == "user" and "<conversation>" in message_text(message):
            prior_ref = compact_receipt.prior_summary_receipt(message_text(message))
            break
    return mint(env, bound, prior_ref)


def mint(env, bound, prior_ref=None):
    """worker 摘要铸造/幂等答复本命名链条目；绝不读写 root 链。

    链式（重复）摘要：prior 引用仍经 verify_ref 解析进本命名空间（缺失/外链/
    异适配器＝fail closed），但进度基线＝链尾已验证回执（只增不减，过时 prior
    幂等答复链尾）。未覆盖已发决策经活体 OC 只读检索补绑（completed＋唯一
    part＋属主会话）；pending/missing/不可用＝不绑（诚实 pending）；身份不匹配/
    重复/foreign＝严格 fault。渲染转述不是证据（cx15 0029：旧调用重渲染＋
    [truncated] 曾致假 compact_history_drift）。
    """
    import opencode_tool_receipt
    entries = read_chain(env["records"], bound["task"])
    if any(old.get("ref") != entry_ref(old) for old in entries):
        raise _fault("compact_worker_checkpoint_tampered", "worker entry content does not match its ref")
    emitted = emitted_decisions(env["records"], bound["session"])
    base_receipts = (entries[-1].get("receipts") or []) if entries else []
    if prior_ref is not None:
        verify_ref(env, bound, prior_ref)
    if [item.get("call_id") for item in base_receipts] != \
            [item["id"] for item in emitted[:len(base_receipts)]]:
        raise _fault("compact_history_drift",
                     "worker checkpoint receipts are not a prefix of the lane's emitted decisions")
    receipts = list(base_receipts)
    for item in emitted[len(receipts):]:
        pending = {"id": item["id"], "name": item["tool"]}
        try:
            transport = opencode_tool_receipt.observe_worker(env, pending, bound["session"])
        except Exception as fault:
            if getattr(fault, "kind", None) not in _PENDING_TRANSPORT:
                raise
            continue
        if transport.get("kind") == "receipt" and not transport["receipt"].get("isError"):
            receipts.append({"call_id": item["id"], "tool": item["tool"],
                             "arguments": transport.get("arguments"),
                             "result": transport["receipt"]["text"], "result_truncated": False,
                             "provenance": transport["provenance"]})
    entry = {"session": bound["session"], "root_session": bound["root_session"],
             "task": bound["task"], "phase": bound["phase"], "kind": bound["kind"],
             "spec_sha256": file_sha256(env["root"] / "input-spec.json"),
             "adapters": adapter_identities(), "emitted": emitted, "receipts": receipts}
    entry["ref"] = entry_ref(entry)
    if entries and entries[-1]["ref"] == entry["ref"]:
        return entries[-1]
    entry["written_at_ns"] = time.time_ns()
    entries.append(entry)
    fd, temp = tempfile.mkstemp(prefix=".compact-worker.", dir=str(env["records"]))
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        json.dump(entries, stream, ensure_ascii=False, sort_keys=True)
    os.replace(temp, Path(env["records"]) / (CHAIN_NAME % bound["task"]))
    return entry


_PENDING_TRANSPORT = frozenset({"compact_receipt_transport_unavailable", "compact_receipt_transport_missing"})


def replay_receipts(workers, tag, session, base):
    """恢复＝把链上已验证回执按序经原簿真实消费（非核对引用即止）。

    每步签发决策须与已发指纹一致（id/tool；回执在场时 actualargs 亦逐字一致
    ＝严格同会话/任务/相位/实参身份，不做位置配对）。返回末次签发决策与
    其是否为已发未覆盖（已送达宿主、回执未绑定）的 pending。
    """
    receipts, emitted = base.get("receipts") or [], base.get("emitted") or []
    decision, pending = None, False
    for index in range(len(receipts) + 1):
        payload = {"tag": tag, "session_id": session, "last_tool_result": None}
        if index:
            held = receipts[index - 1]
            payload["last_tool_result"] = {"toolCallId": held["call_id"], "toolName": held["tool"],
                                           "isError": False, "text": held["result"]}
        decision = workers.step(payload, tag)
        record = emitted[index] if index < len(emitted) else None
        if record is None:
            pending = False
            break
        if decision.get("id") != record.get("id") or decision.get("name") != record.get("tool"):
            raise _fault("compact_history_drift",
                         "restored replay diverges from the verified checkpoint at step %d" % index)
        if index < len(receipts) and decision.get("arguments") != receipts[index].get("arguments"):
            raise _fault("compact_history_drift",
                         "restored decision arguments differ from the bound receipt at step %d" % index)
        pending = index == len(receipts)
    return decision, pending


def verify_ref(env, bound, ref):
    """无 tag 续行的压缩回执引用必须解析进本 worker 命名空间且身份相符。"""
    for entry in read_chain(env["records"], bound["task"]):
        if entry.get("ref") == ref:
            if entry.get("session") != bound["session"]:
                raise _fault("compact_worker_checkpoint_foreign", "checkpoint belongs to another worker session")
            if entry.get("spec_sha256") != file_sha256(env["root"] / "input-spec.json") \
                    or entry.get("adapters") != adapter_identities():
                raise _fault("compact_worker_checkpoint_adapters", "worker checkpoint identity mismatch")
            return entry
    raise _fault("compact_worker_checkpoint_missing",
                 "worker continuation references checkpoint %s outside the worker namespace" % ref)
