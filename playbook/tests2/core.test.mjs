// 管理单元原子性/批语义/affine/label 编译约束的挂载级测试（真实 spawn mock2.mjs）。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { callsOf, errorOf, session, textOf } from "./helpers/run-mock2.mjs";

function fixture(name, text) {
	const dir = mkdtempSync(join(tmpdir(), "pb2-"));
	const path = join(dir, name);
	writeFileSync(path, text);
	return { path, dir };
}

test("空 say 保留为独立 Response；无 say 的 call 用隐式空 say；相邻 call 同回复", () => {
	const { path } = fixture("a.md", [
		"```user", "- any: true", "```",
		"```say", "```",
		"```call bash", "command: echo one", "```",
		"```call bash", "command: echo two", "```",
		"```say", "收尾", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("go");
	const first = s.call().reply;
	assert.equal(first.stopReason, "toolUse");
	assert.deepEqual(callsOf(first).map((c) => c.arguments.command), ["echo one", "echo two"]);
	assert.equal(textOf(first), "");
	s.pushToolResults(first, {});
	const second = s.call().reply;
	assert.equal(second.stopReason, "stop");
	assert.equal(textOf(second), "收尾");
});

test("缺省 toolResult=otherwise 预测；乱序回执按 callId 归属；缺结果 playbook_state", () => {
	const { path } = fixture("a.md", [
		"```user", "- any: true", "```",
		"```call bash", "command: echo a", "```",
		"```expect", "contains: out", "```",
		"```call bash", "command: echo b", "```",
		"```say", "两步完成", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("go");
	const reply = s.call().reply;
	const ids = callsOf(reply).map((c) => c.id);
	s.messages.push({ role: "assistant", content: reply.content });
	s.messages.push({ role: "toolResult", toolCallId: ids[1], toolName: "bash", content: [{ type: "text", text: "out:b" }] });
	const partial = s.call();
	assert.equal(errorOf(partial), "playbook_state");
	s.messages.push({ role: "toolResult", toolCallId: ids[0], toolName: "bash", content: [{ type: "text", text: "out:a" }] });
	const done = s.call().reply;
	assert.equal(done.stopReason, "stop");
});

test("AFFINE 按 RV：两个独立 RV 各持一个 to 合法（$label 首行）", () => {
	const { path } = fixture("a.md", [
		"```user", "- any: true", "```",
		"```call bash", "command: echo a", "```",
		"```toolResult", "- contains: out", "  pass:", "    to: mid", "```",
		"```say", "$label: mid", "mid!", "```",
		"```call bash", "command: echo b", "```",
		"```toolResult", "- contains: out", "  pass:", "    to: end-label", "```",
		"```say", "$label: end-label", "done", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("go");
	const first = s.call().reply;
	s.pushToolResults(first, {});
	const mid = s.call().reply;
	assert.equal(textOf(mid), "mid!");
	s.pushToolResults(mid, {});
	const done = s.call();
	assert.equal(textOf(done.reply), "done");
});

test("AFFINE：单 RV 两个 to 块（同目标）编译拒", () => {
	const { path } = fixture("a.md", [
		"```user", "- any: true", "```",
		"```call bash", "command: echo a", "```",
		"```toolResult", "- contains: out", "  pass:", "    to: same", "```",
		"```call bash", "command: echo b", "```",
		"```toolResult", "- contains: out", "  pass:", "    to: same", "```",
		"```say", "$label: same", "x", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("go");
	const rejected = s.call();
	assert.equal(errorOf(rejected), "playbook_invalid");
	assert.match(rejected.reply.error?.message ?? "", /AFFINE/);
});

test("label 编译约束：重复/未知目标/RV 内部 label 拒绝", () => {
	const dup = fixture("dup.md", [
		"```say", "$label: x", "one", "```",
		"```say", "$label: x", "two", "```",
	].join("\n"));
	assert.equal(errorOf(session({ playbook: dup.path }).call()), "playbook_invalid");
	const unknown = fixture("u.md", [
		"```user", "- any: true", "  pass:", "    to: nowhere", "```",
	].join("\n"));
	const su = session({ playbook: unknown.path });
	su.pushUser("go");
	assert.equal(errorOf(su.call()), "playbook_invalid");
	const interior = fixture("i.md", [
		"```user", "- any: true", "```",
		"```call bash", "command: echo a", "```",
		"```call bash", "$label: inside", "command: echo b", "```",
	].join("\n"));
	const si = session({ playbook: interior.path });
	si.pushUser("go");
	assert.equal(errorOf(si.call()), "playbook_invalid");
	assert.match(si.call().reply.error?.message ?? "", /RV 内部|label/);
});

test("旧作者语法直接拒绝：goto/end/独立 label 块/match-system 围栏", () => {
	for (const [name, body] of [
		["g.md", ["```user", "- any: true", "```", "```goto", "to: x", "```"].join("\n")],
		["e.md", ["```user", "- any: true", "```", "```end", "```"].join("\n")],
		["l.md", ["```label", "x", "```"].join("\n")],
		["m.md", ["```match system", "- otherwise: true", "```"].join("\n")],
	]) {
		const { path } = fixture(name, body);
		assert.equal(errorOf(session({ playbook: path }).call()), "playbook_invalid", `${name} 必须解析拒绝`);
	}
});

test("User 新语义：工具批后 User 强制空回复停止；纯 say 后等待新用户", () => {
	const { path } = fixture("u2.md", [
		"```user", "- exact: go", "```",
		"```call bash", "command: echo a", "```",
		"```user", "- exact: next", "```",
		"```say", "after", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("go");
	const batch = s.call().reply;
	assert.equal(batch.stopReason, "toolUse");
	s.pushToolResults(batch, {});
	const stop = s.call().reply;
	assert.equal(stop.stopReason, "stop");
	assert.deepEqual(stop.content, [{ type: "text", text: "" }]);
	s.messages.push({ role: "assistant", content: stop.content });
	const again = s.call();
	assert.equal(errorOf(again), "playbook_state");
	s.pushUser("next");
	const after = s.call().reply;
	assert.equal(textOf(after), "after");
});

test("连续 User 等价中间有 empty say；各自需要新消息", () => {
	const { path } = fixture("u3.md", [
		"```user", "- exact: one", "```",
		"```user", "- exact: two", "```",
		"```say", "done", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("one");
	const first = s.call().reply;
	assert.deepEqual(first.content, [{ type: "text", text: "" }]);
	s.messages.push({ role: "assistant", content: first.content });
	s.pushUser("two");
	const second = s.call().reply;
	assert.equal(textOf(second), "done");
});

test("无显式 User 的纯 say 后，新用户直接激活下一管理单元", () => {
	const { path } = fixture("u4.md", [
		"```user", "- exact: go", "```",
		"```say", "第一段", "```",
		"```say", "第二段", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("go");
	const first = s.call().reply;
	assert.equal(textOf(first), "第一段");
	s.messages.push({ role: "assistant", content: first.content });
	s.pushUser("anything");
	assert.equal(textOf(s.call().reply), "第二段");
});

test("重复请求不能冒充新用户：纯 say 后无新输入再请求 = playbook_state", () => {
	const { path } = fixture("u5.md", [
		"```user", "- exact: go", "```",
		"```say", "第一段", "```",
		"```say", "第二段", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("go");
	assert.equal(textOf(s.call().reply), "第一段");
	s.messages.push({ role: "assistant", content: [{ type: "text", text: "第一段" }] });
	assert.equal(errorOf(s.call()), "playbook_state");
});

test("call 两种等价写法；长形式 tool/args 不与原生参数混淆", () => {
	const { path } = fixture("c.md", [
		"```user", "- any: true", "```",
		"```call bash", "command: echo short", "```",
		"```call", "tool: bash", "args:", "  command: echo long", "  tool: keep-me", "```",
	].join("\n"));
	const s = session({ playbook: path });
	s.pushUser("go");
	const reply = s.call().reply;
	assert.deepEqual(callsOf(reply).map((c) => c.arguments.command), ["echo short", "echo long"]);
	assert.equal(callsOf(reply)[1].arguments.tool, "keep-me");
});
