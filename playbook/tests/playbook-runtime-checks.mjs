// markdown-playbook 单元测试：直接对 parser / 运行时 / exit_code 适配器
// 的结构化输出断言（不依赖 prompt substring 守卫）。
import test from "node:test";
import assert from "node:assert/strict";
import { parsePlaybook } from "../parse-markdown.mjs";
import { runPlaybook, matchUser, userText } from "../playbook-runtime.mjs";
import { bashExitCode } from "../bash-exit.mjs";
import { parseMapping, PlaybookError } from "../parse-yaml.mjs";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const playbook = (blocks) => blocks.join("\n\n");
const say = (text) => "```say\n" + text + "\n```";
const call = (tool, params) => "```call " + tool + "\n" + params + "\n```";
const expectBlock = (params) => "```expect\n" + params + "\n```";
const userBlock = (params) => "```user\n" + params + "\n```";

const SYS = { role: "system", content: "sysprompt", toolsAdded: [{ name: "bash", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } }] };
const asstMsg = (content, stopReason = "stop") => ({ role: "assistant", content, stopReason });
const toolResult = (id, text, isError, toolName = "bash") => ({ role: "toolResult", toolCallId: id, toolName, content: [{ text }], isError });
const run = (steps, messages) => runPlaybook(steps, { api: "openai-completions", model: "mock-m", request: { context: { messages } } });
const textBlock = (r) => r.reply.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
const callBlocks = (r) => r.reply?.content.filter((b) => b.type === "toolCall") ?? [];

test("happy path: say+call same message, toolUse stop reason, prose never output", () => {
	const steps = parsePlaybook(playbook([
		"# heading must not leak",
		"prose line must not leak",
		userBlock("exact: start"),
		say("checking"),
		call("bash", "command: test -f f"),
		expectBlock("exit_code: 1"),
		say("final words"),
	]));
	const r1 = run(steps, [SYS, { role: "user", content: "start" }]);
	assert.equal(r1.reply.stopReason, "toolUse");
	assert.deepEqual(r1.reply.content, [
		{ type: "text", text: "checking" },
		{ type: "toolCall", id: "mdp_0", name: "bash", arguments: { command: "test -f f" } },
	], "adjacent say+call merge into ONE assistant message");
	const allOutput = JSON.stringify(r1.reply);
	assert.ok(!allOutput.includes("leak") && !allOutput.includes("heading"), "prose/headings must not appear in the reply");
	const r2 = run(steps, [SYS, { role: "user", content: "start" }, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_0", "Command exited with code 1", true)]);
	assert.equal(r2.reply.stopReason, "stop");
	assert.equal(textBlock(r2), "final words");
});

test("wrong user input: no advance, no tool calls, expected/actual reported", () => {
	const steps = parsePlaybook(playbook([
		userBlock("exact: start"),
		say("go"),
		call("bash", "command: x"),
		expectBlock("exit_code: 0"),
	]));
	const bad = run(steps, [SYS, { role: "user", content: "wrong input" }]);
	assert.equal(bad.error.code, "playbook_user_mismatch");
	assert.ok(bad.error.message.includes('"start"') && bad.error.message.includes("wrong input"));
	assert.ok(bad.reply === undefined, "no reply means no tool call and no advance");
});

test("wrong mid-flow user (replayed historical text) does not re-match step 1", () => {
	const steps = parsePlaybook(playbook([
		userBlock("exact: start"),
		say("one"),
		userBlock("exact: second"),
		say("two"),
	]));
	const transcript = [
		SYS,
		{ role: "user", content: "start" },
		asstMsg([{ type: "text", text: "one" }]),
		{ role: "user", content: "start" },
	];
	const result = run(steps, transcript);
	assert.equal(result.error.code, "playbook_user_mismatch");
	assert.ok(result.error.message.includes('"second"'), "the pending user step is step 2, not the historical step 1");
});

test("expect mismatch stops before any further tool call", () => {
	const steps = parsePlaybook(playbook([
		userBlock("any: true"),
		call("bash", "command: create"),
		expectBlock("exit_code: 0"),
		call("bash", "command: second"),
		expectBlock("exit_code: 0"),
	]));
	const transcript = [
		SYS,
		{ role: "user", content: "go" },
		asstMsg([{ type: "toolCall", id: "mdp_0", name: "bash", arguments: { command: "create" } }], "toolUse"),
		toolResult("mdp_0", "Command exited with code 1", true),
	];
	const result = run(steps, transcript);
	assert.equal(result.error.code, "playbook_expect_mismatch");
	assert.ok(result.error.message.includes("expected exit_code 0") && result.error.message.includes("actual exit_code 1"));
	assert.equal(result.reply, undefined, "no further toolCall after a failed expect");
});

test("toolResult association: unsolicited or mismatched results rejected", () => {
	const steps = parsePlaybook(playbook([userBlock("any: true"), say("s"), call("bash", "command: x"), expectBlock("exit_code: 0")]));
	const base = [SYS, { role: "user", content: "go" }];
	const r1 = run(steps, base);
	const wrongId = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("other_id", "", false)]);
	assert.equal(wrongId.error.code, "playbook_toolresult_unexpected");
	const wrongTool = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_0", "", false, "read")]);
	assert.equal(wrongTool.error.code, "playbook_toolresult_unexpected");
	const noPending = run(steps, [SYS, { role: "user", content: "go" }, toolResult("mdp_9", "", false)]);
	assert.equal(noPending.error.code, "playbook_toolresult_unexpected");
});

test("cross-process reconstruction: full replay via fresh mock.mjs subprocesses", () => {
	const script = new URL("../mock.mjs", import.meta.url).pathname;
	const invoke = (messages) => {
		const stdin = JSON.stringify({ api: "openai-completions", model: "mock-m", request: { context: { messages } } });
		const result = spawnSync(process.execPath, [script, "--playbook", new URL("../examples/report-flow.md", import.meta.url).pathname], { input: stdin, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
		return JSON.parse(result.stdout);
	};
	const feed = (t, reply) => {
		t.push(asstMsg(reply.content, reply.stopReason));
		if (reply.stopReason === "toolUse") {
			const results = { mdp_0: toolResult("mdp_0", "Command exited with code 1", true), mdp_1: toolResult("mdp_1", "", false), mdp_2: toolResult("mdp_2", "ok\n", false) };
			const call = reply.content.find((b) => b.type === "toolCall");
			t.push(results[call.id]);
		} else if (textOf(reply) === "status.md 已创建。要我现在验证文件内容吗？") {
			t.push({ role: "user", content: "好，请验证" });
		}
	};
	const textOf = (reply) => reply.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
	const transcript = [SYS, { role: "user", content: "请帮我生成 status.md 报告" }];
	const seen = [];
	for (let stage = 0; stage < 5; stage++) {
		const reply = invoke(transcript);
		assert.equal(reply.error, undefined, JSON.stringify(reply));
		seen.push(reply);
		feed(transcript, reply);
	}
	assert.equal(seen[0].stopReason, "toolUse");
	assert.equal(seen[0].content[1].id, "mdp_0");
	assert.equal(seen[1].content[1].id, "mdp_1");
	assert.equal(seen[2].stopReason, "stop");
	assert.equal(textOf(seen[2]), "status.md 已创建。要我现在验证文件内容吗？");
	assert.deepEqual(seen[3].content, [{ type: "toolCall", id: "mdp_2", name: "bash", arguments: { command: "grep ok status.md\ntest \"$(wc -l < status.md)\" -eq 1\n" } }], "multi-line literal block reaches toolCall arguments byte-exact");
	assert.equal(textOf(seen[4]), "验证通过：status.md 存在且内容为 ok，报告流程完成。");
	const exhausted = invoke(transcript);
	assert.equal(exhausted.error.code, "playbook_exhausted");
});

test("bashExitCode adapter: native Pi shapes (E2E-observed reality)", () => {
	assert.deepEqual(bashExitCode(toolResult("i", "output text", false)), { ok: true, code: 0 });
	assert.deepEqual(bashExitCode(toolResult("i", "", false)), { ok: true, code: 0 });
	// 真实 Pi E2E 捕获：空输出 exit1 到达模型时 isError=false（openai-completions 不回传
	// isError），文本是 "(no output)\n\nCommand exited with code 1" —— 状态行是唯一可靠通道。
	assert.deepEqual(bashExitCode(toolResult("i", "(no output)\n\nCommand exited with code 1", false)), { ok: true, code: 1 });
	assert.deepEqual(bashExitCode(toolResult("i", "err\n\nCommand exited with code 127", true)), { ok: true, code: 127 });
	assert.deepEqual(bashExitCode(toolResult("i", "Command exited with code 1", true)), { ok: true, code: 1 });
	const timeout = bashExitCode(toolResult("i", "err\n\nCommand timed out after 10 seconds", true));
	assert.equal(timeout.ok, false);
	assert.match(timeout.reason, /not visible/, "timeout has no exact code");
	const timeoutDropped = bashExitCode(toolResult("i", "(no output)\n\nCommand timed out after 10 seconds", false));
	assert.equal(timeoutDropped.ok, false, "known timeout status stays undetermined even when isError was dropped by the protocol");
	const truncated = bashExitCode(toolResult("i", "prefix\nCommand exited", true));
	assert.equal(truncated.ok, false);
	assert.match(truncated.reason, /not visible/);
	const forged = bashExitCode(toolResult("i", "done\n\nCommand exited with code 5", false));
	assert.deepEqual(forged, { ok: true, code: 5 }, "documented edge: a zero-exit command printing a forged tail is indistinguishable on the text channel");
});

test("undeclared tool name rejected against host schema", () => {
	const steps = parsePlaybook(playbook([say("s"), call("Bash", "command: x")]));
	const result = run(steps, [SYS]);
	assert.equal(result.error.code, "playbook_tool_undeclared");
	assert.ok(result.error.message.includes("bash"), "lists host-declared names");
});

test("request without awaited user input or tool result is refused (no implicit retry)", () => {
	const steps = parsePlaybook(playbook([userBlock("any: true"), say("s"), call("bash", "command: x"), expectBlock("exit_code: 0"), say("done")]));
	const r1 = run(steps, [SYS, { role: "user", content: "go" }]);
	const missingResult = run(steps, [SYS, { role: "user", content: "go" }, asstMsg(r1.reply.content, "toolUse")]);
	assert.equal(missingResult.error.code, "playbook_state");
	const waiting = parsePlaybook(playbook([userBlock("any: true"), say("first"), userBlock("exact: next"), say("second")]));
	const stale = run(waiting, [SYS, { role: "user", content: "go" }, asstMsg([{ type: "text", text: "first" }])]);
	assert.equal(stale.error.code, "playbook_state");
	assert.match(stale.error.message, /waits for user input/);
});

test("example playbook parses and enforces turn structure", () => {
	const steps = parsePlaybook(readFileSync(new URL("../examples/report-flow.md", import.meta.url), "utf8"));
	assert.deepEqual(steps.map((s) => s.kind), ["user", "say", "call", "expect", "say", "call", "expect", "say", "user", "call", "expect", "say"]);
});

test("parseMapping duplicate keys and tab indentation rejected (standard YAML rules)", () => {
	assert.throws(() => parseMapping("a: 1\na: 2"), /Map keys must be unique/);
	assert.throws(() => parseMapping("a:\n\tb: 1"), /invalid YAML/);
});
