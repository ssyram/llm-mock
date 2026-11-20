"""moc18a 测试共用的 CCA 框架根解析（与 adapter/lane_context 同语义）。

CCA_NEW_CCA_HOME / CCA_MOCK18A_SUT / CCA_HOME 显式输入（依次优先），缺即响亮
失败；返回 scripts 目录（含 cca_bench 包）。测试以 `python3 tests/<name>.test.py`
直接运行。
"""
import os
from pathlib import Path


def cca_scripts():
    for key in ("CCA_NEW_CCA_HOME", "CCA_MOCK18A_SUT", "CCA_HOME"):
        value = os.environ.get(key)
        if value:
            scripts = Path(value) / "scripts"
            if not (scripts / "cca_bench").is_dir():
                raise SystemExit("moc18a tests: %s=%s carries no scripts/cca_bench" % (key, value))
            return scripts
    raise SystemExit("moc18a tests: set CCA_NEW_CCA_HOME (or CCA_HOME) to the CCA framework root")
