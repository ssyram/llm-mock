#!/usr/bin/env python3
"""compact_state 进程内已验证快照缓存契约（聚焦单一契约，直接 python3 运行）。

证明目标：同进程同身份（records/root/session＋spec＋检查点 stat）重复读取
只整链校验一次，命中复用不变快照的严格拷贝（装配别名写穿不污染缓存）；
own 写入/外部同长篡改（还原 mtime，靠 ctime/inode 抓获）/外来 session/
spec 变更都不得复用缓存且按原检查 fail closed；外来路径（aux/他 lane）
不命中缓存、首读新鲜校验。不缓存 aux 裁决/活体 GET/proof——本测试只覆盖
verified_entries 缓存本身，其余路径未触碰。
"""
import importlib.util
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ADAPTER_DIR = HERE.parent / "adapter"
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ADAPTER_DIR))
import cca_scripts_path

sys.path.insert(0, str(cca_scripts_path.cca_scripts()))
_spec = importlib.util.spec_from_file_location("compact_state", ADAPTER_DIR / "compact_state.py")
cs = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cs)

FAILURES = []
VALIDATIONS = {"n": 0}
_real_validate = cs.validate_entry


def counting_validate(entry, env):
    VALIDATIONS["n"] += 1
    return _real_validate(entry, env)


cs.validate_entry = counting_validate


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def fault_kind(fn):
    try:
        fn()
    except Exception as exc:
        return getattr(exc, "kind", None) or type(exc).__name__
    return None


class Script:
    def __init__(self, serial):
        self.serial = serial
        self.label_serial = 0
        self.stage = "loop"
        self.phase = "analysis"
        self.vars = {}
        self.batches = []
        self.dispatched = {}
        self.returned = set()
        self.inflight = []
        self.limbo = 0
        self.ghost = 0
        self.reserve_ops = []
        self.returns_at_reserve = 0
        self.need_reserve = False
        self.gate_incomplete = False
        self.waiting = True
        self.done = False
        self.consumed = ["call.s%d" % serial]
        self.stats = {}
        self.pending = None
        self.queue = []


def make_lane(base, name, session="ses_cachetestmain"):
    root = base / name
    records = root / "records"
    records.mkdir(parents=True)
    (root / "input-spec.json").write_text(json.dumps({"mode": "fullset", "seed": 1,
                                                      "graph_size": 4, "entries": None,
                                                      "parallel": 2, "batch": 16,
                                                      "nodes": ["n0"], "edges": [],
                                                      "mock": {}}), encoding="utf-8")
    return {"records": records, "root": root, "root_session": session}


def mint(env, serial):
    decision = {"action": "text", "text": "idle wait %d" % serial}
    entry = cs.write_rest_checkpoint(env, Script(serial), decision)
    assert entry is not None, "mint %d" % serial
    return entry


base = Path(tempfile.mkdtemp(prefix="compact-cache-contract."))
env = make_lane(base, "lane-a")
for i in (1, 2, 3):
    mint(env, i)
chain_path = env["records"] / "compact-checkpoint.json"

mark = VALIDATIONS["n"]
first = cs.verified_entries(env)
v_first = VALIDATIONS["n"] - mark
second = cs.verified_entries(env)
v_second = VALIDATIONS["n"] - v_first - mark
check("fresh read validates all entries once", v_first == 3, "validations=%d" % v_first)
check("repeat same env validates nothing", v_second == 0, "validations=%d" % v_second)
check("hit returns equal content", cs.canon(second) == cs.canon(first) and second is not first)

first[0]["machine"]["consumed"].append("poison")
first[0]["session"] = "poison"
mark = VALIDATIONS["n"]
third = cs.verified_entries(env)
check("cached snapshot immune to aliasing writes",
      VALIDATIONS["n"] - mark == 0 and third[0]["session"] == env["root_session"]
      and third[0]["machine"]["consumed"] == ["call.s1"],
      "validations=%d session=%r" % (VALIDATIONS["n"] - mark, third[0]["session"]))

mark = VALIDATIONS["n"]
kind = fault_kind(lambda: cs.verify_ref(env, "0" * 64))
check("unknown ref rejected on cached hit", kind == "compact_checkpoint_missing"
      and VALIDATIONS["n"] - mark == 0, "kind=%r validations=%d" % (kind, VALIDATIONS["n"] - mark))

mark = VALIDATIONS["n"]
mint(env, 4)
v_write = VALIDATIONS["n"] - mark
mark = VALIDATIONS["n"]
after_own = cs.verified_entries(env)
v_after = VALIDATIONS["n"] - mark
check("own write invalidates snapshot (full revalidation)",
      v_write == 3 and v_after == 4 and len(after_own) == 4,
      "write-path=%d after=%d len=%d" % (v_write, v_after, len(after_own)))

raw = chain_path.read_text(encoding="utf-8")
before_stat = chain_path.stat()
last_ref = after_own[-1]["ref"]
forged = ("1" if last_ref[0] != "1" else "0") + last_ref[1:]
assert len(forged) == len(last_ref)
chain_path.write_bytes(raw.replace(last_ref, forged, 1).encode("utf-8"))
os.utime(chain_path, ns=(before_stat.st_atime_ns, before_stat.st_mtime_ns))
tampered_stat = chain_path.stat()
mark = VALIDATIONS["n"]
kind = fault_kind(lambda: cs.verified_entries(env))
v_tamper = VALIDATIONS["n"] - mark
check("external same-len tamper with restored mtime caught",
      kind == "compact_checkpoint_tampered" and v_tamper == 4
      and tampered_stat.st_mtime_ns == before_stat.st_mtime_ns
      and tampered_stat.st_size == before_stat.st_size
      and (tampered_stat.st_ctime_ns != before_stat.st_ctime_ns
           or tampered_stat.st_ino != before_stat.st_ino),
      "kind=%r validations=%d mtime_eq=%s ctime_changed=%s" %
      (kind, v_tamper, tampered_stat.st_mtime_ns == before_stat.st_mtime_ns,
       tampered_stat.st_ctime_ns != before_stat.st_ctime_ns))

chain_path.write_bytes(raw.encode("utf-8"))
os.utime(chain_path, ns=(before_stat.st_atime_ns, before_stat.st_mtime_ns))
mark = VALIDATIONS["n"]
restored = cs.verified_entries(env)
check("restored chain revalidates and succeeds",
      VALIDATIONS["n"] - mark == 4 and [e["ref"] for e in restored][-1] == last_ref)

foreign = dict(env, root_session="ses_foreigne000")
mark = VALIDATIONS["n"]
kind = fault_kind(lambda: cs.verified_entries(foreign))
check("foreign session cannot reuse cache and is rejected",
      kind == "compact_checkpoint_foreign" and VALIDATIONS["n"] - mark == 1,
      "kind=%r validations=%d" % (kind, VALIDATIONS["n"] - mark))

spec_path = env["root"] / "input-spec.json"
spec_raw = spec_path.read_text(encoding="utf-8")
spec_path.write_text(spec_raw.replace('"seed": 1', '"seed": 2'), encoding="utf-8")
mark = VALIDATIONS["n"]
kind = fault_kind(lambda: cs.verified_entries(env))
check("changed spec cannot reuse cache and is rejected",
      kind == "compact_checkpoint_spec" and VALIDATIONS["n"] - mark == 1,
      "kind=%r validations=%d" % (kind, VALIDATIONS["n"] - mark))
spec_path.write_text(spec_raw, encoding="utf-8")

env_b = make_lane(base, "lane-b")
shutil.copy(chain_path, env_b["records"] / "compact-checkpoint.json")
mark = VALIDATIONS["n"]
cs.verified_entries(env_b)
v_b_first = VALIDATIONS["n"] - mark
mark = VALIDATIONS["n"]
cs.verified_entries(env_b)
v_b_second = VALIDATIONS["n"] - mark
check("foreign path (aux/other lane) fresh-validated then cached independently",
      v_b_first == 4 and v_b_second == 0, "first=%d second=%d" % (v_b_first, v_b_second))

shutil.rmtree(base, ignore_errors=True)
print("RESULT %s (%d failures)" % ("PASS" if not FAILURES else "FAIL", len(FAILURES)))
sys.exit(1 if FAILURES else 0)
