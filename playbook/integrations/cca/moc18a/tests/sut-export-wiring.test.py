#!/usr/bin/env python3
"""adapter CCA 根解析与运行时加载一致性回归（真实子进程环境，非 monkeypatch）。

显式根（CCA_NEW_CCA_HOME > CCA_MOCK18A_SUT > CCA_HOME）设置时：lane_context
必须解析出同一 scripts 目录，cca_bench/case_body 真从所选根加载（非仅测试改
路径），代表性生成命令（setup_cca_v2 部署命令、cca_state 提交命令）路径全部
落所选根；显式指向缺失布局时在边界硬错（明确报错、绝不静默回退）。
固定提交导出（CCA_MOCK18A_SUT）是被测契约的一部分：提供即直断导出绑定；
未提供任何 CCA 根时本文件显式 skip（外部输入即环境变量，不造数据、无任何
开发机默认路径）。launcher 侧一致性以源断言覆盖（new_lane 把 CCA_NEW_CCA_HOME
写进 lane.env，attach.sh 导出 CCA_NEW_*，全部子进程与 launcher 同根）。
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
DOMAIN = HERE.parent
ADAPTER = DOMAIN / "adapter"
EXPORT = os.environ.get("CCA_MOCK18A_SUT")
FAILURES = []

PROBE = """
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, %(adapter)r)
import lane_context
import cca_bench
import case_body
from cca_bench.native_lane import LaneConfig
from cca_bench.unit_runner import ProductCLI
base = Path(tempfile.mkdtemp(prefix="sut-wiring-"))
ws = base / "ws"
ws.mkdir()
config = LaneConfig(run_id="wiring-probe", lane_root=base, opencode_binary="opencode",
                    server_url="http://127.0.0.1:1", source_root=ws / "src", workspace=ws, para=2)
cli = ProductCLI(lane_context.cca_scripts_path().parent, ws, "ses-wiring")
print(json.dumps({
    "resolved": str(lane_context.cca_scripts_path()),
    "cca_bench": cca_bench.__file__, "case_body": case_body.__file__,
    "setup_command": config.setup_command(lane_context.cca_scripts_path().parent),
    "submit_script": str(cli.script),
    "submit_command": cli._argv("finish", ["--task-id", "t-wiring"], "main", "wiring-op")}))
""" % {"adapter": str(ADAPTER)}


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def clean_env(**extra):
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("CCA_MOCK18A_", "CCA_NEW_")) and k != "CCA_HOME"}
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env.update(extra)
    return env


def run_probe(code, **env_extra):
    run = subprocess.run([sys.executable, "-c", code], env=clean_env(**env_extra),
                         capture_output=True, text=True, timeout=180)
    try:
        return json.loads(run.stdout), run
    except ValueError:
        return None, run


def import_lane_context():
    return ("import sys; sys.path.insert(0, %r); import lane_context"
            % str(ADAPTER))


def main():
    export = Path(EXPORT)
    check("固定导出根在场（scripts/cca_bench + scripts/cca_state.py）",
          (export / "scripts" / "cca_bench").is_dir()
          and (export / "scripts" / "cca_state.py").is_file(), "export=%s" % EXPORT)

    result, run = run_probe(PROBE, CCA_MOCK18A_SUT=str(export))
    check("导出环境子进程 import 成功", result is not None, (run.stderr or "")[-300:])
    if result:
        check("解析到固定导出根：cca_scripts_path == 导出 scripts",
              result["resolved"] == str(export / "scripts"),
              "resolved=%s" % result["resolved"])
        check("运行时真从导出加载（非仅测试改路径）",
              result["cca_bench"].startswith(str(export))
              and result["case_body"].startswith(str(ADAPTER)),
              "cca_bench=%s case_body=%s" % (result["cca_bench"], result["case_body"]))
        generated = json.dumps([result["setup_command"], result["submit_script"], result["submit_command"]])
        check("代表性生成命令落导出：setup/submit 路径 == 导出 scripts",
              result["setup_command"][1] == str(export / "scripts" / "setup_cca_v2.py")
              and result["submit_script"] == str(export / "scripts" / "cca_state.py"),
              "setup=%s submit=%s" % (result["setup_command"][1], result["submit_script"]))

    fallback = Path(tempfile.mkdtemp(prefix="sut-wiring-fallback-"))
    _, fallback_run = run_probe(PROBE, CCA_HOME=str(fallback))
    check("缺布局的 CCA_HOME 在边界硬错（不静默回退）",
          fallback_run.returncode != 0 and "CCA_HOME" in fallback_run.stderr
          and "cca_bench" in fallback_run.stderr,
          "exit=%d stderr=%s" % (fallback_run.returncode,
                                 fallback_run.stderr.strip().splitlines()[-1] if fallback_run.stderr.strip() else ""))
    for env_name in ("CCA_NEW_CCA_HOME", "CCA_MOCK18A_SUT"):
        _, miss_run = run_probe(import_lane_context(), **{env_name: str(fallback / "no-such-root")})
        check("显式缺失路径在边界硬错（%s）" % env_name,
              miss_run.returncode != 0 and env_name in miss_run.stderr
              and "cca_bench" in miss_run.stderr,
              "exit=%d stderr=%s" % (miss_run.returncode,
                                     miss_run.stderr.strip().splitlines()[-1] if miss_run.stderr.strip() else ""))
    _, none_run = run_probe(import_lane_context())
    check("未设任何 CCA 根时响亮失败并指明输入",
          none_run.returncode != 0 and "CCA_NEW_CCA_HOME" in none_run.stderr and "CCA_HOME" in none_run.stderr,
          "exit=%d" % none_run.returncode)

    source = (DOMAIN / "new_lane.py").read_text(encoding="utf-8")
    check("launcher 把 CCA_NEW_CCA_HOME 写进 lane.env（全部子进程同根）",
          'CCA_NEW_CCA_HOME=str(home)' in source)
    check("生成的 attach.sh 导出 CCA_NEW_*（部署环境与 launcher 同根）",
          'key.startswith(("CCA_NEW_", "CCA_MOCK18A_"))' in source)

    print()
    if FAILURES:
        print("FAILED: %d checks" % len(FAILURES))
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    if not EXPORT:
        print("SKIP: set CCA_MOCK18A_SUT to the fixed commit export root (external input, not in repo)")
        raise SystemExit(0)
    raise SystemExit(main())
