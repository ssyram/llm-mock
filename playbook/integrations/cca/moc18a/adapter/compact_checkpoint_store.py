"""静息检查点链文件持久化：原子整链写、读取与回执引用解析。

链文件只追加、从不原地改写；整链写入经临时文件＋fsync＋原子替换，坏 JSON/
坏 schema＝显式故障；缺文件＝None（missing 语义由调用方处理）。回执引用→
唯一链条目，未知/歧义引用 fail closed。身份绑定与按边界的恢复决策在
compact_state。
"""

import json
import os
import tempfile
from pathlib import Path

CHECKPOINT_NAME = "compact-checkpoint.json"
SCHEMA = 4


def _fault(kind, message):
    from cca_bench.suites.mock_results import MockFault
    return MockFault(kind, message)


def write_chain(directory, entries):
    """整链原子落盘（临时文件＋fsync＋替换）；调用方负责先校验既有条目。"""
    document = {"schema": SCHEMA, "entries": entries}
    fd, temp = tempfile.mkstemp(prefix=".compact-checkpoint.", dir=str(directory))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(document, stream, ensure_ascii=False, sort_keys=True)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp, directory / CHECKPOINT_NAME)
    except BaseException:
        try:
            os.unlink(temp)
        except OSError:
            pass
        raise


def read_checkpoint(records_dir):
    """读检查点链；缺文件＝None（missing 语义），坏 JSON/坏形状＝显式故障。"""
    path = Path(records_dir) / CHECKPOINT_NAME
    if not path.is_file():
        return None
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except ValueError:
        raise _fault("compact_checkpoint_corrupt", "checkpoint is not valid JSON")
    if not isinstance(document, dict) or document.get("schema") != SCHEMA \
            or not isinstance(document.get("entries"), list) or not document["entries"]:
        raise _fault("compact_checkpoint_schema", "unsupported checkpoint schema")
    return document["entries"]


def resolve_entry(entries, checkpoint_ref):
    """回执引用 → 唯一链条目；未知/歧义引用 fail closed（不区分缺链与外链）。"""
    matches = [i for i, entry in enumerate(entries) if entry.get("ref") == checkpoint_ref]
    if not matches:
        raise _fault("compact_checkpoint_missing",
                     "compaction receipt references unknown checkpoint %s" % checkpoint_ref)
    if len(matches) > 1:
        raise _fault("compact_checkpoint_corrupt", "checkpoint reference is ambiguous")
    return entries[matches[0]]
