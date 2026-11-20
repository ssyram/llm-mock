#!/usr/bin/env python3
"""launcher/adapter SUT 导出环境绑定回归（真实子进程环境，非 monkeypatch）。

CCA_MOCK18A_SUT/CCA_MOCK18A_PILOT 显式设置时：new_lane（launcher）与
adapter/lane_context（挂载子进程）必须解析出同一 HOME/PILOT（固定提交导出根），
cca_bench/pilot 真从导出加载，代表性生成命令（setup_cca_v2 部署命令、
cca_state 提交命令）路径落导出而绝不落旧 SUT；未设环境时旧树默认行为不变；
显式指向缺失路径时在边界硬错（明确报错、绝不静默回退旧树）。导出根本体缺失
本测试直接失败而非跳过——固定导出是被测契约的一部分。
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
EXPORT = Path("/Users/ssyram/workspace/ai-tools/mock-with-pi/.pi/research/intent-deployment-d0fa23d41")
PILOT = Path("/Users/ssyram/workspace/work-fv/c-code-verify/.local/analysis-decouple/.pi/research/gate-latency-mock-148")
OLD_SUT = "/Users/ssyram/workspace/work-fv/c-code-verify/.local/analysis-decouple/.local/cca-newtree-sut-20261117"
FAILURES = []

PROBE = """
import json, sys, tempfile
from pathlib import Path
sys.path.insert(0, %(domain)r)
sys.path.insert(0, %(adapter)r)
import new_lane
import lane_context
import cca_bench
import pilot.case_body
from cca_bench.native_lane import LaneConfig
from cca_bench.unit_runner import ProductCLI
base = Path(tempfile.mkdtemp(prefix="sut-wiring-"))
ws = base / "ws"
ws.mkdir()
config = LaneConfig(run_id="wiring-probe", lane_root=base, opencode_binary="opencode",
                    server_url="http://127.0.0.1:1", source_root=ws / "src", workspace=ws, para=2)
cli = ProductCLI(new_lane.HOME, ws, "ses-wiring")
print(json.dumps({
    "new_lane_home": str(new_lane.HOME), "lane_home": str(lane_context.HOME),
    "new_lane_pilot": str(new_lane.PILOT), "lane_pilot": str(lane_context.PILOT),
    "cca_bench": cca_bench.__file__, "pilot": pilot.case_body.__file__,
    "setup_command": config.setup_command(new_lane.HOME),
    "submit_script": str(cli.script),
    "submit_command": cli._argv("finish", ["--task-id", "t-wiring"], "main", "wiring-op")}))
""" % {"domain": str(DOMAIN), "adapter": str(DOMAIN / "adapter")}


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def clean_env(**extra):
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(("CCA_MOCK18A_", "CCA_NEW_", "CCA_ANALYSIS_PROJECT"))}
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


def import_code(module):
    return ("import sys; sys.path.insert(0, %r); sys.path.insert(0, %r); import %s"
            % (str(DOMAIN), str(DOMAIN / "adapter"), module))


def main():
    check("固定导出根在场（scripts/ + cca_state.py）", EXPORT.is_dir()
          and (EXPORT / "scripts").is_dir() and (EXPORT / "scripts" / "cca_state.py").is_file()
          and PILOT.is_dir(), "export=%s pilot=%s" % (EXPORT, PILOT))

    result, run = run_probe(PROBE, CCA_MOCK18A_SUT=str(EXPORT), CCA_MOCK18A_PILOT=str(PILOT))
    check("导出环境子进程 import 成功", result is not None, (run.stderr or "")[-300:])
    if result:
        check("同一 HOME：new_lane.HOME == lane_context.HOME == 固定导出根",
              result["new_lane_home"] == result["lane_home"] == str(EXPORT),
              "new_lane=%s lane=%s" % (result["new_lane_home"], result["lane_home"]))
        check("同一 PILOT：new_lane.PILOT == lane_context.PILOT", result["new_lane_pilot"] == result["lane_pilot"])
        check("运行时真从导出加载（非仅测试改 HOME）",
              result["cca_bench"].startswith(str(EXPORT)) and result["pilot"].startswith(str(PILOT)),
              "cca_bench=%s pilot=%s" % (result["cca_bench"], result["pilot"]))
        generated = json.dumps([result["setup_command"], result["submit_script"], result["submit_command"]])
        check("代表性生成命令落导出：setup/submit 路径 == 导出 scripts",
              result["setup_command"][1] == str(EXPORT / "scripts" / "setup_cca_v2.py")
              and result["submit_script"] == str(EXPORT / "scripts" / "cca_state.py"),
              "setup=%s submit=%s" % (result["setup_command"][1], result["submit_script"]))
        check("生成命令/使用路径不含旧 SUT 根", OLD_SUT not in generated
              and OLD_SUT not in (result["new_lane_home"], result["lane_home"]), generated[:300])

    legacy, legacy_run = run_probe(PROBE)
    check("默认（未设环境）子进程 import 成功", legacy is not None, (legacy_run.stderr or "")[-300:])
    if legacy:
        check("默认行为不变：HOME/PILOT/生成命令仍为旧树",
              legacy["new_lane_home"] == legacy["lane_home"] == OLD_SUT
              and legacy["new_lane_pilot"] == legacy["lane_pilot"] == str(PILOT)
              and legacy["submit_script"] == OLD_SUT + "/scripts/cca_state.py",
              "home=%s submit=%s" % (legacy["new_lane_home"], legacy["submit_script"]))

    missing = Path(tempfile.mkdtemp(prefix="sut-wiring-missing-"))
    for module, env_name, value in (("new_lane", "CCA_MOCK18A_SUT", str(missing / "no-such-sut")),
                                    ("lane_context", "CCA_MOCK18A_SUT", str(missing / "no-such-sut")),
                                    ("new_lane", "CCA_MOCK18A_PILOT", str(missing / "no-such-pilot")),
                                    ("lane_context", "CCA_MOCK18A_PILOT", str(missing / "no-such-pilot"))):
        _, fail_run = run_probe(import_code(module), **{env_name: value})
        check("显式缺失路径在边界硬错（%s + %s）" % (module, env_name),
              fail_run.returncode != 0 and env_name in fail_run.stderr
              and "refusing legacy fallback" in fail_run.stderr,
              "exit=%d stderr=%s" % (fail_run.returncode, fail_run.stderr.strip().splitlines()[-1] if fail_run.stderr.strip() else ""))

    source = (DOMAIN / "new_lane.py").read_text(encoding="utf-8")
    check("launcher 把导出选择写进 lane.env（全部子进程同源）",
          '("CCA_MOCK18A_SUT", "CCA_MOCK18A_PILOT")' in source)
    check("生成的 attach.sh 导出 CCA_MOCK18A_*（部署环境与 launcher 同根）",
          'key.startswith(("CCA_NEW_", "CCA_MOCK18A_"))' in source)

    print()
    if FAILURES:
        print("FAILED: %d checks" % len(FAILURES))
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
