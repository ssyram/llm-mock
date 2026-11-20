#!/usr/bin/env python3
"""worker 子会话压缩—无 tag 续行全链回归（cx12 attempt14 0020→0021 首错修复）。

【fixture HTTP 仅适配器协议，不代表原生 OC】全部经 new_reply.py 挂载（HTTP
mount 适配器协议、每请求全新子进程）驱动；请求形状 sanitized 自 cx12 捕获
（0020 摘要、0021 无 tag 续行），回执/身份值为 fixture 合作物，绝不冒充原生
OC 行为（原生验证由 attempt15 负责）。正路径：真 worker 首请求可信注册→
worker 摘要只答 worker 命名空间引用、root 链不诞生→无 tag 续行按绑定恢复
角色、消费保留 tail 的 w1.s1 真回执、产出真实下一步 w1.s2 read（不重复
get_state、不触发等待、无新 fsm 锁）。负路径：异命名空间引用＝显式阻塞；
未知会话＝main 车道原 session_mismatch；同会话异任务＝conflict；root 冒充
worker＝foreign；root/main 路由不变。
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
ADAPTER = HERE.parent / "adapter"
sys.path.insert(0, str(ADAPTER))


def load(name, target, directory=None):
    spec = importlib.util.spec_from_file_location(target, (directory or HERE) / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fx = load("compact-resume-fixture", "compact_resume_fixture_w")
sf = load("fsm-slot-fixture", "fsm_slot_fixture_w")
wr = load("worker_registry", "worker_registry_adapter_w", ADAPTER)
W1, W2, W3 = fx.WORKER_SESSIONS["w1"], fx.WORKER_SESSIONS["w2"], "ses_fixw3cccc33"
CONTEXT = "pkg/context.json"
FAILURES = []


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def mount(lane, workspace, messages, session):
    payload = {"api": "openai-completions", "model": "bench-model",
               "request": {"options": {"sessionId": session}, "context": {"messages": messages}}}
    env = dict(os.environ, CCA_NEW_LANE=str(lane), CCA_NEW_ROOT_SESSION=fx.ROOT_SESSION,
               CCA_NEW_WORKSPACE=str(workspace), PYTHONDONTWRITEBYTECODE="1", PLAYBOOK2_CACHE="0")
    run = subprocess.run([sys.executable, str(ADAPTER / "new_reply.py")],
                         input=json.dumps(payload, ensure_ascii=False).encode(),
                         capture_output=True, env=env, timeout=180)
    try:
        return json.loads(run.stdout.decode("utf-8")), run
    except ValueError:
        return {"error": {"code": "bad_mount_stdout"}}, run


def tool_call(reply):
    return next((b for b in reply.get("content") or []
                 if isinstance(b, dict) and b.get("type") == "toolCall"), None)


def reply_text(reply):
    return "\n".join(b.get("text", "") for b in reply.get("content") or []
                     if isinstance(b, dict) and b.get("type") == "text")


def ref_of(reply):
    try:
        return json.loads(reply_text(reply))["checkpoint"]
    except (ValueError, KeyError, TypeError):
        return None


def tape_last(lane):
    return json.loads((lane / "new-lane-tape.jsonl").read_text(encoding="utf-8").splitlines()[-1])


def system():
    return {"role": "system", "content": "worker system head (synthesized)",
            "toolsAdded": [{"name": name} for name in fx.MAIN_TOOLS]}


def prompt(task):
    return sf.WORKER_TAG_PROMPT.replace("task=w1", "task=%s" % task)


def summary_request(task):
    rendered = "[User]: Your working directory: fixture\n%s\n先 fsm_fsm_get_state({})。" % prompt(task)
    tail = ("Here is the conversation so far:\n\n<conversation>\n%s\n</conversation>\n\n"
            "Create a new anchored summary from the conversation history in the <conversation> "
            "tags above so another coding agent can continue the work." % rendered)
    return [sf.SUMMARIZER_SYSTEM, {"role": "user", "content": tail}]


def continuation(ref_text, workspace, session):
    const = {"session_id": fx.ROOT_SESSION, "agent_cli": "opencode", "agent_id": session,
             "task_id": "task-fx-%s" % session[-4:], "context_file": str(workspace / CONTEXT)}
    return [system(), {"role": "user", "content": fx.MARKER},
            {"role": "assistant", "content": [{"type": "text", "text": ref_text}]},
            {"role": "assistant", "content": [{"type": "toolCall", "id": "w1.s1",
                                               "name": "fsm_fsm_get_state", "arguments": {}}]},
            {"role": "toolResult", "toolCallId": "w1.s1",
             "content": [{"type": "text", "text": json.dumps({"const_vars": const})}]},
            {"role": "user", "content": sf.CONTINUE}]


def progress(ref):
    return json.dumps({"checkpoint": ref, "type": "compact-progress"}, sort_keys=True)


def main():
    base = Path(tempfile.mkdtemp(prefix="worker-resume-"))
    workspace = base / "ws"
    workspace.mkdir()
    lane = fx.build_lane(base, "lane", workspace)
    timing = lane / "records" / "timing-worker-w1.json"

    reply, _ = mount(lane, workspace, [system(), {"role": "user", "content": prompt("w1")}], W1)
    bound = wr.binding(lane / "records", W1)
    check("w1 真首请求: w1.s1 且可信注册绑定", tool_call(reply) and tool_call(reply).get("id") == "w1.s1"
          and tape_last(lane).get("class") == "worker" and bound
          and bound.get("task") == "w1" and bound.get("phase") == "analysis" and bound.get("session") == W1)
    timing_before = timing.read_text(encoding="utf-8") if timing.exists() else ""

    reply, _ = mount(lane, workspace, summary_request("w1"), W1)
    ref = ref_of(reply)
    chain = wr.read_chain(lane / "records", "w1")
    check("w1 摘要(0020 形状): aux 纯回执零 toolCall，引用入 worker 命名空间，root 链不诞生",
          tape_last(lane).get("class") == "aux" and ref and tool_call(reply) is None
          and chain and chain[-1].get("ref") == ref and chain[-1].get("session") == W1
          and chain[-1].get("emitted") == [{"id": "w1.s1", "tool": "fsm_fsm_get_state"}]
          and not (lane / "records" / "compact-checkpoint.json").exists())

    reply, _ = mount(lane, workspace, continuation(reply_text(reply), workspace, W1), W1)
    call, row = tool_call(reply), tape_last(lane)
    check("w1 无 tag 续行(0021 形状): 绑定恢复 worker 角色，真回执推出 w1.s2 read(context_file)",
          row.get("class") == "worker" and (row.get("tag") or {}).get("task") == "w1"
          and call and call.get("id") == "w1.s2" and call.get("name") == "read"
          and call.get("arguments", {}).get("filePath") == str(workspace / CONTEXT))
    check("w1 无 tag 续行: 不重复 get_state/首 request、无新 fsm 锁、不触发等待窗口",
          (timing.read_text(encoding="utf-8") if timing.exists() else "") == timing_before
          and json.loads(timing_before).get("first_request_ns")
          and not any((lane / "fsm-slots").glob("read.lock")))

    mount(lane, workspace, [system(), {"role": "user", "content": prompt("w2")}], W2)
    reply, _ = mount(lane, workspace, summary_request("w2"), W2)
    w2ref = ref_of(reply)
    check("w2 隔离: 独立绑定与独立命名空间链，w1 链不变",
          wr.binding(lane / "records", W2).get("task") == "w2" and w2ref
          and len(wr.read_chain(lane / "records", "w1")) == 1
          and wr.read_chain(lane / "records", "w2")[-1].get("session") == W2)

    reply, _ = mount(lane, workspace, continuation(progress(w2ref), workspace, W1), W1)
    check("异命名空间引用(实录 cac21efc 同类): 显式阻塞不伪装成功路由",
          (reply.get("error") or {}).get("code") == "playbook_program_error"
          and "compact_worker_checkpoint" in json.dumps(reply.get("error") or {}))

    first, _ = mount(lane, workspace, [fx.main_system(), {"role": "user", "content": "start"}], fx.ROOT_SESSION)
    reply, _ = mount(lane, workspace, sf.summarizer_request(
        sf.chained_render("start", fx.tool_call(first), sf.fsm_result(workspace, "prepare the scope"))), fx.ROOT_SESSION)
    root_ref = ref_of(reply)
    check("root 摘要照旧: root 链与 worker 链分文件", root_ref
          and (lane / "records" / "compact-checkpoint.json").is_file()
          and root_ref not in [e.get("ref") for e in wr.read_chain(lane / "records", "w1")])
    reply, _ = mount(lane, workspace, continuation(progress(root_ref), workspace, W1), W1)
    check("root 链引用进 worker 续行: 角色已恢复但机器不可恢复＝显式阻塞",
          (reply.get("error") or {}).get("code") == "playbook_program_error"
          and "compact_worker_checkpoint_missing" in json.dumps(reply.get("error") or {}))

    reply, _ = mount(lane, workspace, continuation(
        reply_text(mount(lane, workspace, summary_request("w1"), W1)[0]), workspace, W1), W3)
    check("未知会话无 tag: 不猜 worker，main 车道原 session_mismatch 失败保持",
          (reply.get("error") or {}).get("code") == "playbook_program_error"
          and "session_mismatch" in json.dumps(reply.get("error") or {})
          and tape_last(lane).get("class") == "main")
    conflict, c_run = mount(lane, workspace, [system(), {"role": "user", "content": prompt("w2")}], W1)
    foreign, f_run = mount(lane, workspace, [system(), {"role": "user", "content": prompt("w1")}], fx.ROOT_SESSION)
    check("拒绝: 同会话异任务＝conflict、root 冒充 worker＝foreign",
          (conflict.get("error") or {}).get("code") == "worker_identity_conflict" and c_run.returncode == 1
          and (foreign.get("error") or {}).get("code") == "worker_identity_foreign" and f_run.returncode == 1)
    reply, _ = mount(lane, workspace, [fx.main_system(), {"role": "user", "content": "开始。"}], fx.ROOT_SESSION)
    check("对照: root main 请求路由不变", tape_last(lane).get("class") == "main")

    print()
    if FAILURES:
        print("FAILED: %d checks" % len(FAILURES))
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
