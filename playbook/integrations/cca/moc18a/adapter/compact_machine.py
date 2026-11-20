"""冻结机纯数据状态的载荷层：快照/域校验/装配（compact_state 链的 machine 字段）。

链与身份绑定在 compact_state；本模块只负责机器状态本身：MainScript → JSON
安全 dict 的稳定快照、纯数据域校验（越域＝compact_state_invalid fail closed）、
恢复时装配回脚本（只恢复纯数据字段；queue/pending 含未落地闭包，装配路径
不反序列化任何对象）。不读盘、不绑身份、不含链逻辑（单一职责拆分）。
"""
import json

STAGES = ("start", "prepare", "loop", "final", "handoff")
PHASES = ("analysis", "eqclass")
MACHINE_INTS = ("serial", "label_serial", "limbo", "ghost", "returns_at_reserve")
MACHINE_BOOLS = ("need_reserve", "gate_incomplete", "waiting", "done")
MACHINE_LISTS = ("batches", "returned", "inflight", "reserve_ops", "consumed")
MACHINE_DICTS = ("vars", "dispatched", "stats")
MACHINE_FIELDS = ("serial", "label_serial", "stage", "phase", "vars", "batches", "dispatched",
                  "inflight", "limbo", "ghost", "reserve_ops", "returns_at_reserve",
                  "need_reserve", "gate_incomplete", "waiting", "done", "consumed", "stats")


def _fault(kind, message):
    from cca_bench.suites.mock_results import MockFault
    return MockFault(kind, message)


def snapshot_script(script):
    """冻结 MainScript 的纯数据状态（stats 深拷贝为 JSON 安全值）。"""
    return {
        "serial": script.serial, "label_serial": script.label_serial,
        "stage": script.stage, "phase": script.phase, "vars": dict(script.vars),
        "batches": json.loads(json.dumps(script.batches)),
        "dispatched": dict(script.dispatched), "returned": sorted(script.returned),
        "inflight": list(script.inflight), "limbo": script.limbo, "ghost": script.ghost,
        "reserve_ops": list(script.reserve_ops), "returns_at_reserve": script.returns_at_reserve,
        "need_reserve": script.need_reserve, "gate_incomplete": script.gate_incomplete,
        "waiting": script.waiting, "done": script.done, "consumed": list(script.consumed),
        "stats": json.loads(json.dumps(script.stats)),
    }


def validate_machine(machine):
    """纯数据机器状态的域校验；任何字段越域＝compact_state_invalid fail closed。"""
    if not isinstance(machine, dict):
        raise _fault("compact_checkpoint_corrupt", "checkpoint carries no machine state")
    if machine.get("stage") not in STAGES or machine.get("phase") not in PHASES:
        raise _fault("compact_state_invalid", "checkpoint stage/phase out of domain")
    for name in MACHINE_INTS:
        if not isinstance(machine.get(name), int) or isinstance(machine.get(name), bool):
            raise _fault("compact_state_invalid", f"checkpoint field {name} must be int")
    for name in MACHINE_BOOLS:
        if not isinstance(machine.get(name), bool):
            raise _fault("compact_state_invalid", f"checkpoint field {name} must be bool")
    for name in MACHINE_LISTS:
        if not isinstance(machine.get(name), list):
            raise _fault("compact_state_invalid", f"checkpoint field {name} must be list")
    for name in MACHINE_DICTS:
        if not isinstance(machine.get(name), dict):
            raise _fault("compact_state_invalid", f"checkpoint field {name} must be mapping")
    if any(name not in machine for name in MACHINE_FIELDS):
        raise _fault("compact_checkpoint_corrupt", "checkpoint machine state is missing fields")
    return machine


def apply_machine(script, machine):
    for name in MACHINE_FIELDS:
        setattr(script, name, machine[name])
    script.returned = set(machine["returned"])
