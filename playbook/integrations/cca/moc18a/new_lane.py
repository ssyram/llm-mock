#!/usr/bin/env python3
"""moc18a 新专用 lane 启动器：真实图/FSM/OC/根与子 session/独立 root+socket+端口，
模型回复全部经新解释器（mock2.mjs + 三管理单元薄剧本 + 冻结 Pilot 业务 adapter）。

用法：python3 new_lane.py LANE_ROOT TAPE|- SPEC_JSON
TAPE 为 old lane 可回放选择带（缺省 '-'）；SPEC 为 pair 共享输入
（nodes/edges/seed/parallel/batch/mock）：图由 spec.nodes/edges 直接构造（真实
生产物化路径），seed 只进 Mock 选择；spec 携带的任何路径字段只当数据读、绝不
当写入目的地，源材料始终写进私有 workspace。服务保持存活供 parent 的原生
TUI 输入 start 触发全自动两阶段；本脚本不投递任何输入。
"""
import json
import os
import shlex
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PROJECT = Path("/Users/ssyram/workspace/work-fv/c-code-verify/.local/analysis-decouple")
# 显式导出环境（固定提交导出根）优先；未设即旧树原行为。显式设置了但路径缺
# 必备布局时在边界硬错——绝不静默回退旧树，否则生成物会混两个框架根。
HOME = Path(os.environ["CCA_MOCK18A_SUT"]) if os.environ.get("CCA_MOCK18A_SUT") else PROJECT / ".local/cca-newtree-sut-20261117"
PILOT = Path(os.environ["CCA_MOCK18A_PILOT"]) if os.environ.get("CCA_MOCK18A_PILOT") else PROJECT / ".pi/research/gate-latency-mock-148"
if os.environ.get("CCA_MOCK18A_SUT") and not (HOME / "scripts").is_dir():
    raise SystemExit("CCA_MOCK18A_SUT missing scripts/ (refusing legacy fallback): %s" % HOME)
if os.environ.get("CCA_MOCK18A_PILOT") and not (PILOT / "pilot").is_dir():
    raise SystemExit("CCA_MOCK18A_PILOT missing pilot/ (refusing legacy fallback): %s" % PILOT)
sys.path[:0] = [str(HOME / "scripts"), str(PILOT), str(HERE.parent)]

from cca_bench import workspace_isolation
from cca_bench.suites import mock_plan
from cca_bench.suites.mock_lane import Lane
from pilot.case_body import pilot_budgets, pilot_level

import adapter.spec_graph as spec_graph
from adapter.collect_terminal import collect_terminal, first_tape_fault, terminal_message

consume_graph_spec, write_sources = spec_graph.consume_graph_spec, spec_graph.write_sources

# 权威意图材料：dispatchable 包必备的 _cca_analysis/intent.md 由 lane 以预备者身份
# 安装（生产中属用户/prepare 材料，产品从不代建）。缺省用本 lane 夹具文本；外部
# 材料经 CCA_NEW_INTENT_MD 显式指定（不可读即硬错，不静默回退）。
FIXTURE_INTENT_MD = ("# Intent (moc18a fixture)\n\n## 用户意图与需求\n"
                     "moc18a 夹具用户条款：按输入 spec 的图完成 Analysis 与 EqClass 两阶段并完成最终交付；"
                     "随机发现（新函数/新边/外部标注/新事实）只允许在 spec.mock 供给的预算之内。\n\n"
                     "## 公开输入域\nspec 声明的函数与边集合，以及 spec.mock 声明的抽样预算。\n")


def install_intent_md(workspace):
    text = FIXTURE_INTENT_MD
    source = os.environ.get("CCA_NEW_INTENT_MD")
    if source:
        text = Path(source).read_text(encoding="utf-8")
    path = workspace / "_cca_analysis" / "intent.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def save(path, document):
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def validate_spec(spec):
    required = {"seed", "parallel", "batch", "nodes", "edges", "mock"}
    missing = sorted(required - set(spec))
    if missing:
        raise SystemExit("input spec missing fields: %s" % missing)
    if spec["parallel"] < 1 or spec["batch"] < 1:
        raise SystemExit("parallel/batch must be positive configured values (para override only via start input)")


def main():
    if len(sys.argv) != 4:
        raise SystemExit(__doc__)
    lane_root, tape_arg, spec_path = (Path(sys.argv[1]).resolve(), sys.argv[2], Path(sys.argv[3]).resolve())
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    validate_spec(spec)
    lane_root.mkdir(parents=True)
    workspace = lane_root / "w"
    workspace_isolation.isolate_workspace(workspace, git=True)
    artifact = consume_graph_spec(spec)
    write_stats, source_root = write_sources(artifact, workspace)
    install_intent_md(workspace)
    level = pilot_level(spec["parallel"], spec["batch"], spec["mock"]["max_new_nodes"])
    budgets = pilot_budgets(level, len(artifact.nodes), len(artifact.edges), 1800,
                            spec["mock"]["max_new_nodes"], spec["mock"]["max_new_facts"])
    lane = Lane("moc18a-new", lane_root, workspace, mock_plan.binaries(), spec["parallel"], spec["batch"])
    temp = lane_root / "tmp"
    temp.mkdir()
    lane.env.update(TMPDIR=str(temp), TERM="xterm-256color", OPENCODE_DISABLE_AUTOUPDATE="true",
                    PYTHONDONTWRITEBYTECODE="1",
                    CCA_NEW_LANE=str(lane_root), CCA_NEW_WORKSPACE=str(workspace),
                    CCA_NEW_TAPE="" if tape_arg == "-" else str(Path(tape_arg).resolve()))
    # lane.env 是全部子进程（fsm/mock/oc 与 mount 下的 new_reply.py）的唯一环境：
    # 导出选择必须随之传递，生成脚本（attach.sh）与部署环境才与 launcher 同根。
    lane.env.update({name: os.environ[name] for name in ("CCA_MOCK18A_SUT", "CCA_MOCK18A_PILOT")
                     if os.environ.get(name)})
    lane.prepare_dirs()
    lane.start_fsm()
    lane.deploy(HOME)
    config_path = workspace / ("opencode.cca-v2-" + lane.config.prefix + ".json")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    config["default_agent"] = "main"
    config["agent"]["main"].update(mode="primary", description="Local Mock Pilot Main (new interpreter lane)")
    config_path.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")
    lane.start_oc()
    session = lane.create_root()
    lane.env["CCA_NEW_ROOT_SESSION"] = session
    lane.request("PATCH", "/session/" + session, {"title": "Mock Pilot new Main"})
    save(lane_root / "input-spec.json", spec)
    save(lane_root / "entries.json", {"analysis": lane.entry("analysis")})
    (lane_root / "records").mkdir(exist_ok=True)
    (lane_root / "fsm-slots").mkdir(exist_ok=True)
    mount = lane.start_mock("http://127.0.0.1:1", shlex.join([sys.executable, str(HERE / "adapter" / "new_reply.py")]))
    attach = json.loads((lane_root / "setup.json").read_text(encoding="utf-8"))["launch_command"]
    attach = attach + ["attach", lane.config.server_url, "--dir", str(workspace), "--session", session]
    shell = "#!/bin/sh\nset -eu\n" + "\n".join(
        "export " + key + "=" + shlex.quote(value) for key, value in lane.env.items()
        if key.startswith(("CCA_NEW_", "CCA_MOCK18A_")) or key in ("HOME", "TMPDIR", "TERM", "PATH"))
    shell += "\nexec " + shlex.join(attach) + "\n"
    attach_path = lane_root / "attach.sh"
    attach_path.write_text(shell, encoding="utf-8")
    attach_path.chmod(0o700)
    save(lane_root / "ready.json", {
        "session": session, "workspace": str(workspace), "server": lane.config.server_url,
        "mock_port": lane.mock_port, "mount": mount, "config": str(config_path), "attach": attach,
        "births": lane.births, "prompt": "start", "initial_nodes": len(artifact.nodes),
        "initial_edges": len(artifact.edges), "model": config["model"], "default_agent": config["default_agent"],
        "interpreter": str(HERE.parents[3] / "mock2.mjs"),
        "playbooks": {name: str(HERE / name) for name in ("main.md", "worker.md", "aux.md")},
        "business_adapter": str(HERE / "adapter"), "tape": lane.env["CCA_NEW_TAPE"] or None,
        "input_spec": str(spec_path),
        "graph": {"nodes": list(artifact.nodes), "edges": [list(e) for e in artifact.edges],
                  "sha256": artifact.sha256, "source_write": write_stats},
        "boundary": "model replies only; FSM/OC/task packets/submissions are real; graph consumed from spec"})
    print("Ready (new interpreter lane): native TUI input 'start' runs the full two phases.", flush=True)
    tape_path = lane_root / "new-lane-tape.jsonl"
    started_monotonic = None
    deadline_reached = False
    collected = False
    while True:
        time.sleep(1)
        dead = [name for name, process in lane.processes.items() if not process.alive()]
        if dead:
            save(lane_root / "live.json", {"processes_alive": {n: p.alive() for n, p in lane.processes.items()},
                                           "stopped": dead, "deadline_reached": deadline_reached})
            raise SystemExit("lane process exited mid-run: %s" % dead)
        tape = tape_path.read_text(encoding="utf-8") if tape_path.exists() else ""
        tape_lines = len(tape.splitlines())
        if started_monotonic is None and tape_lines > 0:
            started_monotonic = time.monotonic()
        if (started_monotonic is not None and not deadline_reached
                and time.monotonic() - started_monotonic > budgets["deadline_s"]):
            deadline_reached = True
        if started_monotonic is not None and not collected:
            messages = lane.request("GET", "/session/" + session + "/message", timeout=10)[1]
            main_done = terminal_message(messages)
            fault = first_tape_fault(tape)
            if deadline_reached and not main_done and not fault:
                fault = {"kind": "timed_out", "reason": "interactive Pilot execution deadline reached"}
            if main_done or fault:
                graph = {"mode": spec["mode"], "artifact": artifact, "entries": None,
                         "bridge": None, "unreachable": []}
                collect_terminal(HOME, lane_root, lane, graph, level, budgets, spec["seed"], main_done, fault)
                collected = True
                print("Result saved; OC/FSM/Mock remain available.", flush=True)
        save(lane_root / "live.json", {"processes_alive": {n: p.alive() for n, p in lane.processes.items()},
                                       "tape_lines": tape_lines,
                                       "started": started_monotonic is not None,
                                       "deadline_reached": deadline_reached})


if __name__ == "__main__":
    main()
