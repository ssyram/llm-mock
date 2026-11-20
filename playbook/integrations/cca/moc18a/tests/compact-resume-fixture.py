#!/usr/bin/env python3
"""Compact-resume 回归的可移植夹具与挂载驱动（无任何 /Users 路径内嵌）。

证据标注（reconstructed vs real preserved OC evidence）：
- 真实保留证据＝/tmp/compact-probe/run_e2e2.py 及 stream.json（r256b 归档的自然
  OC 压缩：auto/overflow marker、tail+notif+summary+notif 形状、回执/回程文本
  形状）。本夹具按同一形状“重建”，但全部输入为显式合成物：spec/entries/setup
  在临时目录生成，回执与 worker 回程由 harness 按冻结机 expect 契约合成（真实
  闭环中它们来自产品 cca_state.py SQL 权威与真实 worker lane）。
- harness 从不读取原始 transcript；两 lane（cold 全量重放 / compact 压缩）共享
  同一 workspace 与 root session，使两侧决策可逐字节比对。
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
DOMAIN = Path(__file__).resolve().parents[1]
ADAPTER = DOMAIN / "adapter"

ROOT_SESSION = "ses_compactfixturemain"
FIXTURE_INTENT_MD = ("# Intent (compact fixture)\n\n## 用户意图与需求\n"
                     "合成夹具用户条款：按 spec 图完成两阶段交付；随机发现只在 spec.mock 预算内。\n")
MARKER = "What did we do so far?"
MAIN_TOOLS = ("agent", "bash", "fsm_enter_fsm", "fsm_exit_fsm", "fsm_fsm_get_state",
              "fsm_fsm_submit_self_check", "fsm_fsm_try_transition", "write")
WORKER_SESSIONS = {"w1": "ses_fixw1aaaa11", "w2": "ses_fixw2bbbb22", "w3": "ses_fixw3cccc33"}
RESERVE_PLAN = {  # operation -> (batch labels, authority active)
    "bench-analysis-r1": (["w1", "w2"], 2),
    "bench-analysis-r2": ([], 1),
    "bench-analysis-r3": ([], 0),
    "bench-eqclass-r4": (["w3"], 1),
    "bench-eqclass-r5": ([], 0),
}


def main_system():
    return {"role": "system", "content": "regression system head (synthesized)",
            "toolsAdded": [{"name": name} for name in MAIN_TOOLS]}


def gate_system():
    return {"role": "system", "content": "bench gate head (synthesized)",
            "toolsAdded": [{"name": "StructuredOutput"}]}


def initial_vars(workspace):
    return {"para_default": "2", "max_in_one_batch": "16",
            "cca_framework_home": str(workspace / "framework"),
            "cca_workspace": str(workspace),
            "cca_source_root": str(workspace / "src"),
            "cca_sql_path": str(workspace / "_cca_analysis" / "callgraph.db"),
            "cca_analysis_batch_fsm": "bench-fx-analyze-batch",
            "cca_eqclass_batch_fsm": "bench-fx-eqclass-batch"}


def const_vars(session, workspace):
    return {"session_id": session, "cca_workspace": str(workspace),
            "cca_source_root": str(workspace / "src")}


def build_lane(base, name, workspace):
    """临时 lane：input-spec/entries/setup + 预签发 eqclass phase-entry（可移植合成）。"""
    lane = base / name
    (lane / "records").mkdir(parents=True)
    (lane / "fsm-slots").mkdir()
    # 与生产 lane 同契约：预备者身份安装权威 intent.md（IntentMainScript prepare
    # write 与 worker 实读都消费它；缺失即 MockFault，不降级）。
    (workspace / "_cca_analysis").mkdir(parents=True, exist_ok=True)
    (workspace / "_cca_analysis" / "intent.md").write_text(FIXTURE_INTENT_MD, encoding="utf-8")
    vars_ = initial_vars(workspace)
    spec = {"mode": "fullset", "seed": 202611190, "graph_size": 4, "entries": None,
            "parallel": 2, "batch": 16, "nodes": ["n0", "n1", "n2", "n3"],
            "edges": [["n0", "n1"], ["n1", "n2"]],
            "mock": {"delta_probability": 0.0, "max_new_nodes_per_task": 0,
                     "max_new_edges_per_task": 0, "max_external_marks_per_task": 0,
                     "max_new_nodes": 0, "max_new_facts": 0, "wait_seconds": [0.5, 0.5]}}
    (lane / "input-spec.json").write_text(json.dumps(spec, indent=1), encoding="utf-8")
    prompt = "调用 fsm_enter_fsm 进入 analysis，然后按当前 FSM 完成任务。"
    (lane / "entries.json").write_text(json.dumps(
        {"analysis": {"phase": "analysis", "session": ROOT_SESSION,
                      "enter_fsm": {"name": "bench-fx-CCodeAnalyze", "vars": vars_},
                      "prompt": prompt}}, ensure_ascii=False, indent=1), encoding="utf-8")
    (lane / "setup.json").write_text(json.dumps(
        {"version": 2, "prefix": "bench-fx", "workspace": str(workspace),
         "names": {"CCodeAnalyze-decoupled": "bench-fx-CCodeAnalyze",
                   "CCodeEqClass-decoupled": "bench-fx-CCodeEqClass"},
         "initial_vars": vars_,
         "entry_command": ["python3", "not-run-in-fixture", "--phase"]}, indent=1), encoding="utf-8")
    (lane / "records" / "phase-entry-eqclass.json").write_text(json.dumps(
        {"phase": "eqclass", "session": ROOT_SESSION,
         "enter_fsm": {"name": "bench-fx-CCodeEqClass", "vars": vars_}}), encoding="utf-8")
    return lane


def ask(lane, workspace, messages, cache="0", session=ROOT_SESSION):
    """fresh mount process：每次请求都是全新 new_reply.py 子进程（无跨请求状态）。"""
    env = dict(os.environ, CCA_NEW_LANE=str(lane), CCA_NEW_ROOT_SESSION=session,
               CCA_NEW_WORKSPACE=str(workspace), PYTHONDONTWRITEBYTECODE="1",
               PLAYBOOK2_CACHE=cache)
    payload = {"api": "openai-completions", "model": "bench-model",
               "request": {"options": {"sessionId": session},
                           "context": {"messages": messages}}}
    run = subprocess.run([sys.executable, str(ADAPTER / "new_reply.py")],
                         input=json.dumps(payload, ensure_ascii=False).encode(),
                         capture_output=True, env=env, timeout=180)
    try:
        reply = json.loads(run.stdout.decode("utf-8"))
    except ValueError:
        reply = {"error": {"code": "bad_mount_stdout", "message": run.stdout.decode("utf-8", "replace")[:300]}}
    return reply, run


def tool_call(reply):
    for block in reply.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "toolCall":
            return block
    return None


def reply_text(reply):
    return "\n".join(b.get("text", "") for b in reply.get("content") or []
                     if isinstance(b, dict) and b.get("type") == "text")


def echo_of(reply):
    return {"role": "assistant", "content": reply.get("content") or []}


def synthesize_receipt(call, workspace):
    """按冻结机 expect 契约合成回执（reconstructed：真实闭环由产品命令产出）。"""
    name, args = call["name"], call.get("arguments") or {}
    if name in ("fsm_enter_fsm", "fsm_fsm_get_state"):
        text = json.dumps({"const_vars": const_vars(ROOT_SESSION, workspace)})
    elif name == "fsm_fsm_submit_self_check":
        text = json.dumps({"status": "ready"})
    elif name == "fsm_fsm_try_transition":
        text = json.dumps({"current_state": args.get("target")})
    elif name == "fsm_exit_fsm":
        text = json.dumps({"current_state": "S_default"})
    elif name == "write":
        text = "written"
    elif name == "agent":
        label = re.search(r"task=(w\d+)", args.get("prompt", "")).group(1)
        text = "Started general agent.\nsession_id: " + WORKER_SESSIONS[label]
    elif name == "bash":
        command = args.get("command", "")
        if " init " in command:
            text = json.dumps({"nodes": 4})
        elif " reserve " in command:
            operation = re.search(r"--operation (\S+)", command).group(1)
            labels, active = RESERVE_PLAN[operation]
            text = json.dumps({"phase": operation.split("-")[1], "para": 2, "active": active,
                               "free_slots": 0, "batches": [{"cwd": str(workspace / "src")} for _ in labels],
                               "status": "ok", "in_flight": [], "blocked": []})
        elif " complete " in command:
            text = json.dumps({"complete": True})
        else:
            raise AssertionError("unknown bash command in decision: " + command)
    else:
        raise AssertionError("unknown tool in decision: " + name)
    return {"role": "toolResult", "toolCallId": call["id"], "toolName": name,
            "content": [{"type": "text", "text": text}]}


def worker_return(label):
    return {"role": "user",
            "content": '<agent id="%s" state="completed">\n<summary>Agent completed: bench worker %s</summary>'
                       % (WORKER_SESSIONS[label], label)}


def seed_worker_accepted(lane, phase, label):
    """worker 完成即向 main lane 账本落 count 行（真实闭环由 worker lane 写入）。"""
    with (lane / "records" / "ledger.jsonl").open("a", encoding="utf-8") as stream:
        stream.write(json.dumps({"event": "count", "phase": phase, "kind": "accepted",
                                 "label": label}) + "\n")


def trace_rows(lane):
    path = lane / "records" / "handler-trace.jsonl"
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()] \
        if path.exists() else []


def checkpoint_entries(lane):
    path = lane / "records" / "compact-checkpoint.json"
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))["entries"]
