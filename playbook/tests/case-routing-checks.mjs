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

const mockScript = join(moduleDir, "..", "mock.mjs");
const invokeMock = (playbooks, messages, extra = []) => {
	const stdin = JSON.stringify({ api: "openai-completions", model: "mock-m", request: { context: { messages } } });
	const args = [];
	for (const pb of playbooks) args.push("--playbook", pb);
	return JSON.parse(spawnSync(process.execPath, [mockScript, ...args, ...extra], { input: stdin, encoding: "utf8" }).stdout);
};
const writePlaybook = (dir, name, md) => {
	const path = join(dir, name);
	writeFileSync(path, md);
	return path;
};

test("multi-playbook routing: argv-order first match, ownership survives fresh processes, errors do not fall through", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdp-route-"));
	const pbA = writePlaybook(dir, "a.md", playbook([userBlock('exact: "时间"'), say("A1"), "```end\n```"]));
	const pbB = writePlaybook(dir, "b.md", playbook([userBlock('exact: "报告"'), say("B1"), userBlock("any: true"), say("B2"), "```end\n```"]));
	const pbE = writePlaybook(dir, "e.md", playbook([userBlock(`- judge: ${judge("exit-three.mjs")}`), say("E1")]));

	const route1 = invokeMock([pbA, pbB], [SYS, { role: "user", content: "报告" }]);
	assert.equal(route1.content[0].text, "B1", "A no-match falls through to B");
	const routeA = invokeMock([pbA, pbB], [SYS, { role: "user", content: "时间" }]);
	assert.equal(routeA.content[0].text, "A1", "argv-first A wins when it matches");

	const round2 = invokeMock([pbA, pbB], [
		SYS, { role: "user", content: "报告" }, asstMsg([{ type: "text", text: "B1" }]), { role: "user", content: "继续" },
	]);
	assert.equal(round2.content[0].text, "B2", "fresh process: ownership restored from the transcript's first user message, B continues");

	const none = invokeMock([pbA, pbB], [SYS, { role: "user", content: "别的" }]);
	assert.equal(none.error.code, "playbook_no_match");

	const errored = invokeMock([pbE, pbB], [SYS, { role: "user", content: "报告" }]);
	assert.equal(errored.error.code, "playbook_judge_error", "a candidate's judge error must surface, not fall through to B");
	assert.match(errored.error.message, /status 3/);

	const compacted = invokeMock([pbA, pbB], [SYS]);
	assert.equal(compacted.error.code, "playbook_routing_unknown", "no user message (compacted session): refuse to guess ownership");
});

test("multi-playbook mount validation and single-playbook compat via mock.mjs", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdp-cfg-"));
	const startsWithSay = writePlaybook(dir, "say-first.md", playbook([say("直接开场"), "```end\n```"]));
	const userFirst = writePlaybook(dir, "user-first.md", playbook([userBlock("any: true"), say("s"), "```end\n```"]));
	const invalid = invokeMock([startsWithSay, userFirst], [SYS, { role: "user", content: "x" }]);
	assert.equal(invalid.error.code, "playbook_invalid");
	assert.match(invalid.error.message, /start with a user block/);
	const single = invokeMock([startsWithSay], [SYS]);
	assert.equal(single.content[0].text, "直接开场", "single playbook keeps legacy say-first behavior");
	const timeoutFlag = spawnSync(process.execPath, [mockScript, "--playbook", userFirst, "--judge-timeout-ms", "500"], { input: "{}", encoding: "utf8" });
	assert.equal(timeoutFlag.status, 0);
	const badFlag = spawnSync(process.execPath, [mockScript, "--playbook", userFirst, "--judge-timeout-ms", "x"], { input: "{}", encoding: "utf8" });
	assert.equal(badFlag.status, 1);
	assert.match(badFlag.stderr, /positive integer/);
});

test("example playbooks parse: case flow, route-first, plus judge files exist and honor the protocol", () => {
	const caseSteps = parsePlaybook(readFileSync(join(moduleDir, "..", "examples", "report-case-flow.md"), "utf8"));
	assert.equal(caseSteps[0].kind, "user");
	assert.equal(caseSteps[3].kind, "toolResult");
	const routeSteps = parsePlaybook(readFileSync(join(moduleDir, "..", "examples", "route-first.md"), "utf8"));
	assert.deepEqual(routeSteps.map((s) => s.kind), ["user", "say", "call", "expect", "say", "end"]);
	const runJudge = (name, envelope) => {
		const result = spawnSync(process.execPath, [join(moduleDir, "..", "examples", "judges", name)], { input: JSON.stringify(envelope), encoding: "utf8" });
		assert.equal(result.status, 0, `${name}: ${result.stderr}`);
		return result.stdout.trim();
	};
	const envelope = (message) => ({ message, context: { messages: [{ role: "user", content: "x" }, message] }, location: { playbook: "t", step: 1, kind: "user", heading: null, case: 1, anchor: null }, targets: [] });
	assert.equal(runJudge("report-request.mjs", envelope({ role: "user", content: "帮我准备 status.md 报告" })), "pass");
	assert.equal(runJudge("report-request.mjs", envelope({ role: "user", content: "1" })), "fail", "bare 1 goes to the exact case, not the judge");
	assert.equal(runJudge("status-verdict.mjs", envelope({ role: "toolResult", toolCallId: "t", content: [{ text: "(no output)\n\nCommand exited with code 1" }] })), "fail");
	assert.equal(runJudge("status-verdict.mjs", envelope({ role: "toolResult", toolCallId: "t", content: [{ text: "ok\n" }] })), "pass");
	assert.equal(runJudge("confirm-create.mjs", envelope({ role: "user", content: "可以，请补齐" })), "pass");
	assert.equal(runJudge("confirm-create.mjs", envelope({ role: "user", content: "好" })), "pass");
	assert.equal(runJudge("confirm-create.mjs", envelope({ role: "user", content: "不用了，取消吧" })), "fail");
});
