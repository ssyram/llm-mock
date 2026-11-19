#!/usr/bin/env python3
"""moc18a 新专用 lane 启动器：真实图/FSM/OC/根与子 session/独立 root+socket+端口，
模型回复全部经新解释器（mock2.mjs + 三管理单元薄剧本 + 入库 cca_bench 业务 adapter）。

用法：python3 new_lane.py [--cca-home PATH] LANE_ROOT TAPE|- SPEC_JSON
CCA 框架根由 --cca-home 或环境变量 CCA_HOME 显式给出（缺即响亮失败）；
本脚本把部署所需框架树（scripts/、third_party/callgraph、skills/cca、
skills/cca-v2）复制进 LANE_ROOT/framework 并在其根上落实 .version（源有则
原样复制，源无则按 git 修订生成）——绝不写 CCA 仓库。TAPE 为 old lane 可回放
选择带（缺省 '-'）；SPEC 为 pair 共享输入（nodes/edges/seed/parallel/batch/mock）：
图由 spec.nodes/edges 直接构造（真实生产物化路径），seed 只进 Mock 选择；spec
携带的任何路径字段只当数据读、绝不当写入目的地，源材料始终写进私有 workspace。
服务保持存活供 parent 的原生 TUI 输入 start 触发全自动两阶段；本脚本不投递任何输入。
"""
import json
import os
import shlex
import shutil
import site
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
FRAMEWORK_PARTS = ("scripts", "third_party/callgraph", "skills/cca", "skills/cca-v2")
FRAMEWORK_FILES = ("scripts/setup_cca_v2.py", "scripts/cca_state.py", "scripts/cca_bench")


def save(path, document):
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def validate_spec(spec):
    required = {"seed", "parallel", "batch", "nodes", "edges", "mock"}
    missing = sorted(required - set(spec))
    if missing:
        raise SystemExit("input spec missing fields: %s" % missing)
    if spec["parallel"] < 1 or spec["batch"] < 1:
        raise SystemExit("parallel/batch must be positive configured values (para override only via start input)")


def parse_args(argv):
    cca_source = None
    if argv and argv[0] == "--cca-home":
        if len(argv) < 2:
            raise SystemExit(__doc__)
        cca_source, argv = argv[1], argv[2:]
    if len(argv) != 3:
        raise SystemExit(__doc__)
    if cca_source is None:
        cca_source = os.environ.get("CCA_HOME") or ""
    if not cca_source:
        raise SystemExit("moc18a: pass --cca-home PATH or set CCA_HOME to the CCA framework root")
    source = Path(cca_source).resolve()
    missing = [name for name in FRAMEWORK_FILES if not (source / name).exists()]
    if missing:
        raise SystemExit("moc18a: CCA framework root %s lacks: %s" % (source, missing))
    return source, (Path(argv[0]).resolve(), argv[1], Path(argv[2]).resolve())


def framework_version(source):
    marker = source / ".version"
    if marker.is_file():
        return marker.read_text(encoding="utf-8").strip()
    try:
        revision = subprocess.run(["git", "-C", str(source), "rev-parse", "--short", "HEAD"],
                                  capture_output=True, text=True, timeout=30).stdout.strip()
    except (OSError, subprocess.TimeoutExpired):
        revision = ""
    return "moc18a-copy-%s" % (revision or "unversioned-source")


def framework_copy(source, lane_root):
    """把部署所需框架树复制进 lane（CCA 仓库只读；.version 在副本根上落实）。"""
    target = lane_root / "framework"
    for part in FRAMEWORK_PARTS:
        if not (source / part).is_dir():
            raise SystemExit("moc18a: CCA framework root %s lacks directory: %s" % (source, part))
        shutil.copytree(source / part, target / part,
                        ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"))
    (target / ".version").write_text(framework_version(source) + "\n", encoding="utf-8")
    return target


def write_fsm_register_shim(lane_root, real_binary):
    """lane 私有 PATH shim：当前 dev 版 mcp-server-fsm 只把技能写进 store.db，
    而冻结 CCA setup（deployment_snapshot.register）还要求 <FSM_DATA_DIR>/skills/
    落一份 YAML 镜像（存在即跳过注册、逐字段比对镜像）。本 shim 让真实 CLI
    成功后按 register() 同一条替换规则（{{ skill_dir }} → YAML 所在目录）落镜像；
    其余子命令原样透传，不改变任何 FSM 行为。"""
    shim_dir = lane_root / "bin"
    shim_dir.mkdir(parents=True, exist_ok=True)
    script = ("#!/bin/sh\n"
              "set -eu\n"
              "real=__REAL__\n"
              'if [ "$#" -lt 1 ] || [ "$1" != "register-skill" ]; then\n'
              '  exec "$real" "$@"\n'
              "fi\n"
              'yaml=$2\n'
              'out=$("$real" "$@") || exit $?\n'
              "name=$(sed -n 's/^name:[[:space:]]*//p' \"$yaml\" | head -n 1)\n"
              'dir=$(dirname "$yaml")\n'
              'mkdir -p "${FSM_DATA_DIR:?}/skills"\n'
              'tmp=$(mktemp)\n'
              'sed "s|{{ skill_dir }}|$dir|g" "$yaml" > "$tmp"\n'
              'mv "$tmp" "${FSM_DATA_DIR:?}/skills/${name}.yaml"\n'
              "printf '%s\\n' \"$out\"\n").replace("__REAL__", shlex.quote(str(real_binary)))
    path = shim_dir / "mcp-server-fsm"
    path.write_text(script, encoding="utf-8")
    path.chmod(0o755)
    return shim_dir


def main():
    source, (lane_root, tape_arg, spec_path) = parse_args(sys.argv[1:])
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    validate_spec(spec)
    lane_root.mkdir(parents=True)
    home = framework_copy(source, lane_root)
    sys.path[:0] = [str(home / "scripts"), str(HERE)]

    from cca_bench import workspace_isolation
    from cca_bench.suites import mock_plan
    from cca_bench.suites.mock_lane import Lane
    from adapter.case_body import pilot_budgets, pilot_level
    import adapter.spec_graph as spec_graph
    from adapter.collect_terminal import collect_terminal, first_tape_fault, terminal_message

    consume_graph_spec, write_sources = spec_graph.consume_graph_spec, spec_graph.write_sources
    workspace = lane_root / "w"
    workspace_isolation.isolate_workspace(workspace, git=True)
    artifact = consume_graph_spec(spec)
    write_stats, source_root = write_sources(artifact, workspace)
    level = pilot_level(spec["parallel"], spec["batch"], spec["mock"]["max_new_nodes"])
    budgets = pilot_budgets(level, len(artifact.nodes), len(artifact.edges), 1800,
                            spec["mock"]["max_new_nodes"], spec["mock"]["max_new_facts"])
    lane = Lane("moc18a-new", lane_root, workspace, mock_plan.binaries(), spec["parallel"], spec["batch"])
    temp = lane_root / "tmp"
    temp.mkdir()
    lane.env.update(TMPDIR=str(temp), TERM="xterm-256color", OPENCODE_DISABLE_AUTOUPDATE="true",
                    PYTHONDONTWRITEBYTECODE="1",
                    CCA_NEW_LANE=str(lane_root), CCA_NEW_WORKSPACE=str(workspace),
                    CCA_NEW_CCA_HOME=str(home),
                    CCA_NEW_TAPE="" if tape_arg == "-" else str(Path(tape_arg).resolve()))
    lane.prepare_dirs()
    shim_dir = write_fsm_register_shim(lane_root, lane.binaries["fsm"])
    lane.env["PATH"] = str(shim_dir) + os.pathsep + lane.env["PATH"]
    user_site = site.getusersitepackages()
    if Path(user_site).is_dir():
        # FSM 硬检查子进程以 PYTHONNOUSERSITE=1 运行（如 cca_gate prepare 里的
        # gen_funclist 需要 tree_sitter），user site 对其不可见；显式并入 PYTHONPATH。
        lane.env["PYTHONPATH"] = os.pathsep.join(
            filter(None, [lane.env.get("PYTHONPATH"), str(user_site)]))
    if os.environ.get("CCA_NEW_DUMP_DIR"):
        lane.env["CCA_NEW_DUMP_DIR"] = os.environ["CCA_NEW_DUMP_DIR"]
    lane.start_fsm()
    lane.deploy(home)
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
        if key.startswith("CCA_NEW_") or key in ("HOME", "TMPDIR", "TERM", "PATH"))
    shell += "\nexec " + shlex.join(attach) + "\n"
    attach_path = lane_root / "attach.sh"
    attach_path.write_text(shell, encoding="utf-8")
    attach_path.chmod(0o700)
    save(lane_root / "ready.json", {
        "session": session, "workspace": str(workspace), "server": lane.config.server_url,
        "mock_port": lane.mock_port, "mount": mount, "config": str(config_path), "attach": attach,
        "births": lane.births, "prompt": "start", "initial_nodes": len(artifact.nodes),
        "initial_edges": len(artifact.edges), "model": config["model"], "default_agent": config["default_agent"],
        "interpreter": str(HERE.parents[2] / "mock2.mjs"),
        "playbooks": {name: str(HERE / name) for name in ("main.md", "worker.md", "aux.md")},
        "business_adapter": str(HERE / "adapter"), "tape": lane.env["CCA_NEW_TAPE"] or None,
        "input_spec": str(spec_path), "cca_home": str(home), "cca_home_source": str(source),
        "fsm_register_shim": str(shim_dir / "mcp-server-fsm"),
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
                graph = {"mode": spec.get("mode", "fullset"), "artifact": artifact, "entries": None,
                         "bridge": None, "unreachable": []}
                collect_terminal(home, lane_root, lane, graph, level, budgets, spec["seed"], main_done, fault)
                collected = True
                print("Result saved; OC/FSM/Mock remain available.", flush=True)
        save(lane_root / "live.json", {"processes_alive": {n: p.alive() for n, p in lane.processes.items()},
                                       "tape_lines": tape_lines,
                                       "started": started_monotonic is not None,
                                       "deadline_reached": deadline_reached})


if __name__ == "__main__":
    main()
