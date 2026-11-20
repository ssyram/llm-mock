"""Compact-resume 静息检查点链：写入/读取/校验/按锚恢复（只追加）。

OC 原生压缩把 head 丢弃——压缩后不存在任何进程能靠重放 head 重建冻结机
状态。因此 Main 每请求本就完成的确定性重放在每个静息决策（idle 等待：
pending=None、queue 空）落一份纯数据状态检查点到本 lane 私有 records
目录，绑定 lane/session/spec/adapter 身份，并携带自洽 ref（条目内容除
ref 与落盘时间外的规范摘要）：ref 是本地链的外键，不承载进度语义。

用户裁决（root 与 worker 同法）：marker 与锚（首条结构化 own 回执回显）
之间的一切＝显式丢弃段；恢复基线＝锚引用自身在已验证 own 链上的条目
（namespace/session/spec/adapters/ref 全验），不再按保留尾位置选择基线、
不再核对/重步进/收养锚前旧回显。链式压缩：检查点只追加、从不替换；静息
决策幂等可重导；恢复绝不采用晚于回执边界的条目。锚后保留尾由恢复基线
之后的正常重放逐条经冻结机 decision_matches 核对。

首个静息点之前的原生压缩由 compact_genesis 的 genesis 基线诚实应答：初始
机快照＋已发决策序列＋活体 OC 补绑回执（见 compact_root_mint）；恢复＝
重放绑定回执重建进度（compact_genesis_binding）。摘要文本只声明压缩发生
过，从不作为恢复依据；恢复路径不反序列化任何对象（见 compact_machine）。
"""
import hashlib
import json
import time
from pathlib import Path

from compact_checkpoint_store import read_checkpoint, resolve_entry, write_chain
from compact_machine import apply_machine, snapshot_script, validate_machine

ADAPTER_FILES = ("lane_context.py", "main_step.py", "aux_step.py", "compact_state.py",
                 "compact_receipt.py", "compact_machine.py", "compact_genesis.py",
                 "compact_genesis_binding.py", "compact_checkpoint_store.py",
                 "compact_root_mint.py", "compact_inflight_wait.py", "main_replay.py")


def canon(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def file_sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def _fault(kind, message):
    from cca_bench.suites.mock_results import MockFault
    return MockFault(kind, message)


def entry_ref(entry):
    """不透明引用＝条目内容（除 ref 与落盘时间）的规范摘要：内容篡改即失配。"""
    body = {key: entry[key] for key in entry if key not in ("ref", "written_at_ns")}
    return canon(body)


def adapter_identities():
    here = Path(__file__).resolve().parent
    return {name: file_sha256(here / name) for name in ADAPTER_FILES}


def _entry_rest_key(entry):
    rest, machine = entry.get("rest") or {}, entry.get("machine") or {}
    return (bool(entry.get("genesis")), entry.get("session"), entry.get("spec_sha256"),
            rest.get("consumed_tail"), rest.get("waiting_text_sha256"),
            machine.get("serial"), machine.get("stage"), machine.get("phase"),
            len(machine.get("consumed") or []))


def write_rest_checkpoint(env, script, decision):
    """静息决策（idle 等待、无未落地调用）后原子追加最近可恢复状态。

    非 idle（含 verbatim 重发与 terminal）不落盘：pending 未落地，切割跨过它
    必然丢回执，属不支持形状。已存在同一静息点（同身份同基线）＝幂等不追加；
    链上任何既有条目不再通过身份校验＝fail closed（不向坏链追加）。磁盘失败
    ＝故障（fail closed，不静默续跑）。
    """
    if decision.get("action") != "text" or decision.get("verbatim") or decision.get("terminal") \
            or script.pending is not None or script.queue or script.done:
        return None
    entry = {
        "session": env["root_session"],
        "spec_sha256": file_sha256(env["root"] / "input-spec.json"),
        "adapters": adapter_identities(),
        "rest": {"serial": script.serial,
                 "consumed_tail": (script.consumed[-1] if script.consumed else None),
                 "waiting_text_sha256": canon(decision.get("text"))},
        "pending": None, "queue": [],
        "machine": snapshot_script(script),
    }
    entry["ref"] = entry_ref(entry)
    entry["written_at_ns"] = time.time_ns()
    directory = Path(env["records"])
    directory.mkdir(parents=True, exist_ok=True)
    existing = read_checkpoint(directory)
    if existing is not None:
        for old in existing:
            validate_entry(old, env)
        if any(_entry_rest_key(old) == _entry_rest_key(entry) for old in existing):
            return None
        entries = existing + [entry]
    else:
        entries = [entry]
    write_chain(directory, entries)
    return entry


def validate_entry(entry, env):
    """单条静息点条目的全部身份绑定；任何不满足＝对应 MockFault fail closed。"""
    if not isinstance(entry, dict):
        raise _fault("compact_checkpoint_corrupt", "checkpoint entry is not an object")
    if entry.get("session") != env["root_session"]:
        raise _fault("compact_checkpoint_foreign",
                     "checkpoint session %r is not this lane root session" % (entry.get("session"),))
    if entry.get("spec_sha256") != file_sha256(env["root"] / "input-spec.json"):
        raise _fault("compact_checkpoint_spec", "input-spec fingerprint mismatch")
    adapters = entry.get("adapters")
    if not isinstance(adapters, dict) or adapters != adapter_identities():
        raise _fault("compact_checkpoint_adapters",
                     "adapter identity mismatch (name or version hash)")
    if any(entry.get(name) for name in ("pending", "queue")):
        raise _fault("compact_cut_unsupported",
                     "checkpoint carries in-flight work (pending=%r queue=%d)"
                     % (entry.get("pending"), len(entry.get("queue") or [])))
    validate_machine(entry.get("machine"))
    if entry.get("genesis"):
        import compact_genesis
        compact_genesis.validate(entry)
    if entry.get("ref") != entry_ref(entry):
        raise _fault("compact_checkpoint_tampered",
                     "checkpoint entry content does not match its own reference")
    return entry


def verified_entries(env):
    """读取并整链身份校验（session/spec/adapters/ref＋域校验）＝own 链唯一入口。"""
    entries = read_checkpoint(env["records"])
    if entries is None:
        raise _fault("compact_checkpoint_missing",
                     "compaction marker present but no rest checkpoint in lane records")
    for entry in entries:
        validate_entry(entry, env)
    return entries


def verify_ref(env, checkpoint_ref):
    """回执引用解析进本 root 链的唯一条目（未知/歧义/外链＝fail closed）。"""
    return resolve_entry(verified_entries(env), checkpoint_ref)


def restore_anchor(env, script, checkpoint_ref, anchor_index):
    """按锚恢复（与 worker verify_ref＋replay 同构）：引用条目经全链身份校验后
    装配纯数据机；genesis 条目再按序重放绑定回执重建进度与待发决策。状态只
    来自已验证 own 链（own issued trace＋活体补绑），任何文本转述不参与。"""
    entry = verify_ref(env, checkpoint_ref)
    apply_machine(script, entry["machine"])
    if entry.get("genesis"):
        import compact_genesis_binding
        import timing_capture

        def persist_gate(gate, at_ns, call_id):
            # at_ns 只能是回执入链时随附的权威宿主完成时刻（observed_ns，OC
            # state.time.end 毫秒→纳秒）：重放仅识别哪张回执产出终门键，不供
            # 应时刻；无真值＝不落盘，终门证据诚实缺位，采集器照旧失败。
            timing_capture.persist_main_gate(env["records"], gate[:-len("_final_gate_ns")],
                                             at_ns, call_id, env["root_session"])

        compact_genesis_binding.replay_receipts(script, entry, on_gate=persist_gate)
    phase = entry["machine"]["phase"]
    path = env["records"] / ("phase-entry-%s.json" % phase)
    if path.is_file():
        record = json.loads(path.read_text(encoding="utf-8"))
        if record.get("phase") != phase or record.get("session") != env["root_session"]:
            raise _fault("compact_checkpoint_phase", "authoritative phase entry disagrees with checkpoint")
    return entry, anchor_index
