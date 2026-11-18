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

import "./playbook-runtime-checks.mjs";

test("parser: four block kinds, headings tracked, prose ignored", () => {
	const md = [
		"# Title",
		"prose that must never leak",
		"## Round 1",
		userBlock("exact: start"),
		say("hello"),
		call("bash", "command: ls"),
		expectBlock("exit_code: 0"),
	].join("\n");
	const steps = parsePlaybook(md);
	assert.deepEqual(steps.map((s) => s.kind), ["user", "say", "call", "expect"]);
	assert.equal(steps[0].heading, "Round 1");
	assert.equal(steps[1].text, "hello");
	assert.deepEqual(steps[2].params, { command: "ls" });
	assert.equal(steps[3].exitCode, 0);
});

test("parser: YAML scalars — quoted strings, numbers, booleans, null", () => {
	const { mapping } = parseMapping("a: \"x\\n1\"\nb: 'it''s'\nc: 10\nd: 1.5\ne: true\nf: false\ng: null\nh: plain text");
	assert.deepEqual(mapping, { a: "x\n1", b: "it's", c: 10, d: 1.5, e: true, f: false, g: null, h: "plain text" });
});

test("parser: block scalar command: | preserves multi-line bytes exactly", () => {
	const { mapping } = parseMapping("command: |\n  test -f s.md\n  grep -q ok s.md\n");
	assert.equal(mapping.command, "test -f s.md\ngrep -q ok s.md\n", "literal block keeps newlines and the trailing newline");
	const folded = parseMapping("command: >-\n  echo\n  hi\n");
	assert.equal(folded.mapping.command, "echo hi", "folded strip variant also standard YAML");
});

test("parser: call params support nested mappings and lists", () => {
	const steps = parsePlaybook([
		"```call bash",
		"command: echo hi",
		"options:",
		"  cwd: /tmp",
		"  retries: 3",
		"  env:",
		"    - A=1",
		"    - B=2",
		"```",
	].join("\n"));
	assert.deepEqual(steps[0].params, {
		command: "echo hi",
		options: { cwd: "/tmp", retries: 3, env: ["A=1", "B=2"] },
	});
});

test("parser: malformed blocks rejected with location", () => {
	const cases = [
		["reply block rejected", "```reply\nx\n```", /reply was merged into say/],
		["unknown block rejected", "```foo\nx\n```", /unknown block "foo"/],
		["unclosed fence rejected", "```say\nx", /unclosed block/],
		["user with two keys rejected", userBlock("exact: a\ncontains: b"), /exactly one of exact\/contains\/any/],
		["user any must be true", userBlock("any: false"), /any must be true/],
		["expect without keys rejected", expectBlock("# nothing"), /requires exit_code and\/or contains/],
		["expect unknown key rejected", expectBlock("exit_code: 0\nfoo: 1"), /unknown expect key/],
		["exit_code must be int", expectBlock("exit_code: \"1\""), /non-negative integer/],
		["consecutive user rejected", playbook([userBlock("any: true"), userBlock("any: true")]), /cannot directly follow another user block/],
		["user after call rejected", playbook([say("a"), call("bash", "command: x"), userBlock("any: true")]), /must follow a say block/],
		["expect without call rejected", playbook([say("a"), expectBlock("exit_code: 0")]), /expect must directly follow a call block/],
		["bare colon value rejected", "```call bash\ncommand: a: b\n```", /invalid YAML/],
	];
	for (const [name, md, pattern] of cases) {
		assert.throws(() => parsePlaybook(md), pattern, name);
	}
});

test("matcher: exact is byte-strict, contains substring, any always", () => {
	const exact = { kind: "user", mode: "exact", value: "好，请验证" };
	assert.equal(matchUser(exact, "好，请验证"), true);
	assert.equal(matchUser(exact, "好，请验证 "), false, "trailing space must fail");
	assert.equal(matchUser(exact, " 好请验证 "), false);
	const contains = { kind: "user", mode: "contains", value: "验证" };
	assert.equal(matchUser(contains, "请 验证 一下"), true);
	assert.equal(matchUser(contains, "veriy"), false);
	assert.equal(matchUser({ kind: "user", mode: "any" }, ""), true);
});

test("user text: string content and block arrays", () => {
	assert.equal(userText({ content: "abc" }), "abc");
	assert.equal(userText({ content: [{ text: "a" }, { type: "image", data: "x" }, { text: "b" }] }), "a\nb");
});
