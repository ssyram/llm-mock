#!/usr/bin/env python3
"""lane 路由优先级回归（cx8 attempt10 0017/0019/0020 根因）。

根因：new_reply.route() 先查内容里的 worker BENCH-TAG、后查 aux 请求形状，
导致 compaction 摘要请求（system=context summarization agent、无 toolsAdded、
无 toolChoice）在会话文本嵌有 worker tag（cx8：main.s8 agent 调用参数内嵌
BENCH-TAG role=worker；worker 自身首条 user 消息也含）时被误路由到 worker
车道，确定性 frontier 回复 w1.s1 fsm_fsm_get_state toolCall，而 OC summary
模式禁 toolCall → 两会话压缩均报 UnknownError → 双循环停摆。

修复＝形状优先：aux 形状（title generator 头 / StructuredOutput / 无
toolsAdded）一律走 aux 文本车道，内容 tag 不再越过请求形状。真实业务请求
（main/worker 恒带 toolsAdded，cx8 0001..0018 实证）路由不变。

全部断言经完整 new_reply.py 挂载（每请求全新子进程）驱动；输入形状 sanitized
自 cx8 捕获（合成值，非原生运行）。
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


def load(name):
    spec = importlib.util.spec_from_file_location(name, HERE / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fx = load("compact-resume-fixture")
sf = load("fsm-slot-fixture")

WORKER_TAG_PROMPT = sf.WORKER_TAG_PROMPT
W1 = fx.WORKER_SESSIONS["w1"]
FAILURES = []


def check(name, ok, detail=""):
    print("%s %s%s" % ("PASS" if ok else "FAIL", name, (" | %s" % (detail,)) if detail else ""))
    if not ok:
        FAILURES.append(name)


def mount_env(lane, workspace):
    # 车道 root 会话恒定；请求会话只进 options.sessionId（真实 lane 同构）。
    return dict(os.environ, CCA_NEW_LANE=str(lane), CCA_NEW_ROOT_SESSION=fx.ROOT_SESSION,
                CCA_NEW_WORKSPACE=str(workspace), PYTHONDONTWRITEBYTECODE="1", PLAYBOOK2_CACHE="0")


def mount(lane, workspace, messages, session):
    payload = {"api": "openai-completions", "model": "bench-model",
               "request": {"options": {"sessionId": session}, "context": {"messages": messages}}}
    run = subprocess.run([sys.executable, str(ADAPTER / "new_reply.py")],
                         input=json.dumps(payload, ensure_ascii=False).encode(),
                         capture_output=True, env=mount_env(lane, workspace), timeout=180)
    try:
        reply = json.loads(run.stdout.decode("utf-8"))
    except ValueError:
        reply = {"error": {"code": "bad_mount_stdout", "message": run.stdout.decode("utf-8", "replace")[:200]}}
    return reply, run


def tool_call(reply):
    for block in reply.get("content") or []:
        if isinstance(block, dict) and block.get("type") == "toolCall":
            return block
    return None


def reply_text(reply):
    return "\n".join(b.get("text", "") for b in reply.get("content") or []
                     if isinstance(b, dict) and b.get("type") == "text")


def locks_of(lane):
    return sorted(p.name for p in (lane / "fsm-slots").glob("*.lock"))


def tape_last(lane):
    return json.loads((lane / "new-lane-tape.jsonl").read_text(encoding="utf-8").splitlines()[-1])


def aux_case(name, lane, workspace, messages, session):
    """新分支：aux 形状（含嵌入 worker tag）→ aux 文本回复、零 toolCall、零锁。"""
    before = locks_of(lane)
    reply, run = mount(lane, workspace, messages, session)
    row = tape_last(lane)
    call = tool_call(reply)
    check("%s: class=aux" % name, row.get("class") == "aux", "class=%r exit=%d" % (row.get("class"), run.returncode))
    check("%s: 回复纯文本、零 toolCall" % name, call is None and bool(reply_text(reply).strip()),
          "call=%r text_head=%r stdout=%r stderr=%r" % (call and call.get("id"), reply_text(reply)[:60],
                                                         run.stdout[:200], run.stderr[-400:]))
    check("%s: 未新增 fsm 锁" % name, locks_of(lane) == before, "locks=%r" % (locks_of(lane),))


def main():
    base = Path(tempfile.mkdtemp(prefix="route-precedence-"))
    workspace = base / "ws"
    workspace.mkdir()
    lane = fx.build_lane(base, "lane", workspace)

    # ============ 新分支：compaction 摘要请求嵌入 worker tag（cx8 0017/0020 形状）============
    # 先经挂载真实签发 main.s1（严格回执链：渲染调用必须与 lane 已发决策一致），
    # 再渲染携带 worker tag（cx8 中由 main.s8 agent 参数带入会话文本）的摘要请求。
    first, _ = mount(lane, workspace, [fx.main_system(), {"role": "user", "content": "start"}], fx.ROOT_SESSION)
    call1 = fx.tool_call(first)
    check("前置: main.s1 enter 经挂载真实签发", call1 and call1.get("id") == "main.s1",
          "call=%r" % (call1 and call1.get("id"),))
    rendered_main = sf.chained_render(
        "start\nDispatched worker: " + WORKER_TAG_PROMPT, call1,
        sf.fsm_result(workspace, "prepare the scope"))
    aux_case("main 会话 compaction 嵌 worker tag (0017/0020 形状)",
             lane, workspace, sf.summarizer_request(rendered_main), fx.ROOT_SESSION)

    # ============ 新分支：worker 会话自身 compaction（cx8 0019 形状）============
    # 消除式设计：身份只从真实 worker 请求注册；无绑定的 worker 摘要＝身份不可
    # 证＝fail closed（渲染 tag 不再是注册点）。先真实注册，摘要才可铸造。
    rendered_worker = "[User]: " + WORKER_TAG_PROMPT
    bare, _ = mount(lane, workspace, sf.summarizer_request(rendered_worker), W1)
    check("无绑定 worker 摘要: 身份不可证＝worker_identity_unknown fail closed",
          (bare.get("error") or {}).get("code") == "playbook_program_error"
          and "worker_identity_unknown" in json.dumps(bare.get("error") or {}))
    reg, _ = mount(lane, workspace, sf.worker_messages(), W1)
    check("前置: 真实 worker 首请求可信注册", tool_call(reg) and tool_call(reg).get("id") == "w1.s1")
    aux_case("worker 会话 compaction (0019 形状)",
             lane, workspace, sf.summarizer_request(rendered_worker), W1)

    # ============ 新分支：title 形状嵌入 worker tag（同优先级结构性保证）============
    aux_case("title generator 形状嵌 worker tag", lane, workspace,
             [{"role": "system", "content": "You are a title generator for this session."},
              {"role": "user", "content": "Session so far:\n" + rendered_main}],
             fx.ROOT_SESSION)

    # ============ 对照：真实 worker 起始（0018 形状）路由不变 ============
    reply, run = mount(lane, workspace, sf.worker_messages(), W1)
    row = tape_last(lane)
    call = tool_call(reply)
    lock = None
    try:
        lock = json.loads((lane / "fsm-slots" / "fsm_fsm_get_state.lock").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    check("对照 worker 起始: class=worker 且 w1.s1 get_state toolCall",
          row.get("class") == "worker" and call and call.get("id") == "w1.s1"
          and call.get("name") == "fsm_fsm_get_state",
          "class=%r call=%r exit=%d" % (row.get("class"), call and call.get("id"), run.returncode))
    check("对照 worker 起始: 锁按请求会话签发",
          lock == {"session": W1, "callId": "w1.s1", "tool": "fsm_fsm_get_state", "arguments": {}},
          "lock=%r" % (lock,))

    # ============ 对照：真实 main 请求路由不变 ============
    reply, run = mount(lane, workspace, [fx.main_system(), {"role": "user", "content": "开始。"}], fx.ROOT_SESSION)
    row = tape_last(lane)
    check("对照 main 请求: class=main", row.get("class") == "main",
          "class=%r exit=%d" % (row.get("class"), run.returncode))

    print()
    if FAILURES:
        print("FAILED: %d checks" % len(FAILURES))
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
