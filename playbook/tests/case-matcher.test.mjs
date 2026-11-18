// case matcher 增量单测：有序 case 列表、assistant 别名、toolResult 块、
// 锚点/end、judge 子进程契约（pass/fail/非零/非法输出/超时/无未来泄漏）、
// 多剧本路由（新进程归属、error 不 fallthrough）。直接对结构化输出断言。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parsePlaybook } from "../parse-markdown.mjs";
import { runPlaybook } from "../playbook-runtime.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const judge = (name) => `node ${JSON.stringify(join(moduleDir, "judges", name))}`;
const playbook = (blocks) => blocks.join("\n\n");
const say = (text) => "```say\n" + text + "\n```";
const call = (tool, params) => "```call " + tool + "\n" + params + "\n```";
const expectBlock = (params) => "```expect\n" + params + "\n```";
const userBlock = (params) => "```user\n" + params + "\n```";
const toolResultBlock = (params) => "```toolResult\n" + params + "\n```";
const anchor = (id) => `<a id="${id}"></a>`;

const SYS = { role: "system", content: "sysprompt", toolsAdded: [{ name: "bash", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } }] };
const asstMsg = (content, stopReason = "stop") => ({ role: "assistant", content, stopReason });
const toolResult = (id, text, isError, toolName = "bash") => ({ role: "toolResult", toolCallId: id, toolName, content: [{ text }], isError });
const run = (steps, messages, options = {}) => runPlaybook(steps, { api: "openai-completions", model: "mock-m", request: { context: { messages } } }, options);
const textBlock = (r) => r.reply.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");

import "./case-judge-checks.mjs";
import "./case-routing-checks.mjs";

test("parser: user case list — matchers, pass targets, otherwise last, assistant alias, end", () => {
	const md = [
		anchor("顶部"),
		userBlock(["- exact: \"1\"", "- judge: node verdict.mjs", "  pass:", "    to: \"#完成\"", "- otherwise: true", "  pass:", "    to: 取消"].join("\n")),
		say("问"),
		anchor("完成"),
		say("完成"),
		"```end\n```",
		anchor("取消"),
		say("取消"),
		"```end\n```",
	].join("\n");
	const steps = parsePlaybook(md);
	assert.deepEqual(steps.map((s) => s.kind), ["user", "say", "say", "end", "say", "end"]);
	assert.deepEqual(steps[0].cases.map((c) => c.matcher), ["exact", "judge", "otherwise"]);
	assert.equal(steps[0].cases[1].pass.to, "完成", "# prefix stripped; canonical form is the bare id");
	assert.equal(steps[0].cases[1].pass.toIndex, 2, "resumePos is the 0-based array position of the anchored step");
	assert.equal(steps[0].cases[2].pass.toIndex, 4);
	assert.equal(steps[0].nearestAnchor, "顶部");
	assert.equal(steps[2].nearestAnchor, "完成");
	const alias = parsePlaybook(playbook(["```assistant\n等同 say\n```"]));
	assert.deepEqual(alias[0], { kind: "say", text: "等同 say", index: 1, heading: null, line: 1 });
});

test("parser: toolResult case list after call; end after say/toolResult accepted", () => {
	const steps = parsePlaybook(playbook([
		userBlock("any: true"),
		say("s"),
		call("bash", "command: check"),
		toolResultBlock(["- contains: \"code 1\"", "- judge: node verdict.mjs", "  pass:", "    to: 完成"].join("\n")),
		say("缺失"),
		"```end\n```",
		anchor("完成"),
		say("完整"),
		"```end\n```",
	]));
	assert.deepEqual(steps.map((s) => s.kind), ["user", "say", "call", "toolResult", "say", "end", "say", "end"]);
	assert.equal(steps[3].cases[1].pass.toIndex, 6);
	assert.equal(steps[5].kind, "end");
});

test("parser: case list / anchor / end rejections", () => {
	const cases = [
		["two matcher keys", userBlock("- exact: a\n  contains: b"), /exactly one matcher key/],
		["otherwise not last", playbook([userBlock("- otherwise: true\n- exact: a"), say("s")]), /otherwise must be the last case/],
		["otherwise twice", playbook([userBlock("- otherwise: true\n- otherwise: true"), say("s")]), /at most once/],
		["any false", userBlock("- any: false"), /any must be true/],
		["judge non-string", userBlock("- judge: 42"), /judge must be a non-empty command string/],
		["judge empty", userBlock('- judge: ""'), /judge must be a non-empty command string/],
		["shorthand with pass rejected", userBlock("exact: a\npass:\n  to: x"), /mapping shorthand supports exact\/contains\/any only/],
		["toolResult must be list", playbook([userBlock("any: true"), call("bash", "command: x"), toolResultBlock("contains: ok")]), /toolResult block must be a YAML case list/],
		["toolResult after say", playbook([say("s"), toolResultBlock("- any: true")]), /toolResult must directly follow a call block/],
		["end after user", playbook([userBlock("any: true"), "```end\n```"]), /end must directly follow/],
		["end after expect", playbook([call("bash", "command: x"), expectBlock("exit_code: 0"), "```end\n```"]), /end must directly follow/],
		["end first", "```end\n```", /end must directly follow/],
		["end with body", playbook([say("s"), "```end\n有内容\n```"]), /end block takes no body/],
		["user after toolResult", playbook([userBlock("any: true"), call("bash", "command: x"), toolResultBlock("- any: true"), userBlock("any: true")]), /must follow a say block/],
		["unknown anchor", playbook([userBlock("- otherwise: true\n  pass:\n    to: 不存在"), say("s")]), /not a known <a id> anchor/],
		["duplicate anchor", playbook([anchor("同"), anchor("同"), say("s")]), /duplicate anchor id/],
		["backward anchor", playbook([anchor("回"), userBlock("- any: true"), say("s"), userBlock("- otherwise: true\n  pass:\n    to: 回"), say("e"), "```end\n```"]), /only forward jumps are allowed/],
		["invalid target ##", playbook([userBlock("- otherwise: true\n  pass:\n    to: \"##坏\""), say("s")]), /optionally with one leading #/],
		["invalid target empty", playbook([userBlock("- otherwise: true\n  pass:\n    to: \"\""), say("s")]), /optionally with one leading #/],
		["invalid target non-string", playbook([userBlock("- otherwise: true\n  pass:\n    to: 42"), say("s")]), /pass must be exactly/],
		["pass not mapping", playbook([userBlock("- any: true\n  pass: 完成"), say("s")]), /pass must be a mapping/],
		["toolResult with args", playbook([call("bash", "command: x"), "```toolResult extra\n- any: true\n```"]), /toolResult block takes no arguments/],
	];
	for (const [name, md, pattern] of cases) assert.throws(() => parsePlaybook(md), pattern, name);
});

test("case matching: first match consumes and continues after the block; later cases not tried", () => {
	const steps = parsePlaybook(playbook([
		userBlock(["- contains: 报告", "- exact: nope"].join("\n")),
		say("收到报告请求"),
	]));
	const r = run(steps, [SYS, { role: "user", content: "请给我报告" }]);
	assert.equal(textBlock(r), "收到报告请求");
});

test("case matching: no-match tries the next case with the same input; otherwise catches the rest", () => {
	const steps = parsePlaybook(playbook([
		userBlock(["- exact: 甲", "- contains: 乙", "- otherwise: true"].join("\n")),
		say("匹配到"),
	]));
	assert.equal(textBlock(run(steps, [SYS, { role: "user", content: "甲" }])), "匹配到");
	assert.equal(textBlock(run(steps, [SYS, { role: "user", content: "含乙字" }])), "匹配到");
	assert.equal(textBlock(run(steps, [SYS, { role: "user", content: "完全别的" }])), "匹配到", "otherwise consumes unmatched input");
});

test("case matching: all fail without otherwise is a user mismatch listing the cases", () => {
	const steps = parsePlaybook(playbook([userBlock("- exact: 甲\n- contains: 乙"), say("s")]));
	const bad = run(steps, [SYS, { role: "user", content: "丙" }]);
	assert.equal(bad.error.code, "playbook_user_mismatch");
	assert.match(bad.error.message, /2 case\(s\) \[exact: "甲"; contains: "乙"\]/);
	assert.equal(bad.reply, undefined, "no reply: input not consumed, no tool calls");
});

test("case matching: success with pass jumps to the forward anchor, skipping in-between steps", () => {
	const steps = parsePlaybook(playbook([
		userBlock(["- contains: 跳", "  pass:", "    to: 目标", "- any: true"].join("\n")),
		say("默认路径"),
		"```end\n```",
		anchor("目标"),
		say("跳转路径"),
	]));
	assert.equal(textBlock(run(steps, [SYS, { role: "user", content: "请跳过去" }])), "跳转路径");
	assert.equal(textBlock(run(steps, [SYS, { role: "user", content: "普通" }])), "默认路径");
});
