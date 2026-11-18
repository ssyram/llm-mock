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

test("judge: pass consumes, fail falls through to the next case", () => {
	const md = (cmd) => playbook([
		userBlock([`- judge: ${cmd}`, "- exact: 备胎"].join("\n")),
		say("s"),
	]);
	assert.equal(textBlock(run(parsePlaybook(md(judge("pass-always.mjs"))), [SYS, { role: "user", content: "任意" }])), "s");
	const failed = run(parsePlaybook(md(judge("fail-always.mjs"))), [SYS, { role: "user", content: "备胎" }]);
	assert.equal(textBlock(failed), "s", "judge fail falls through to exact case");
});

test("judge: non-zero exit is a hard error — stops, never falls through, no side effects", () => {
	const steps = parsePlaybook(playbook([
		userBlock([`- judge: ${judge("exit-three.mjs")}`, "- any: true"].join("\n")),
		say("s"),
		call("bash", "command: touch pwned"),
	]));
	const outcome = run(steps, [SYS, { role: "user", content: "go" }], { judgeCwd: moduleDir });
	assert.equal(outcome.error.code, "playbook_judge_error");
	assert.match(outcome.error.message, /status 3/);
	assert.match(outcome.error.message, /judger reason: malformed internal state/, "stderr reason enters diagnostics");
	assert.equal(outcome.reply, undefined, "judge error must not produce a toolCall (no side effects)");
});

test("judge: invalid stdout and timeout are hard errors", () => {
	const garbage = run(parsePlaybook(playbook([userBlock(`- judge: ${judge("garbage-stdout.mjs")}`), say("s")])), [SYS, { role: "user", content: "x" }], { judgeCwd: moduleDir });
	assert.equal(garbage.error.code, "playbook_judge_error");
	assert.match(garbage.error.message, /must be exactly "pass" or "fail"/);
	const slow = run(parsePlaybook(playbook([userBlock(`- judge: ${judge("sleep-pass.mjs")}`), say("s")])), [SYS, { role: "user", content: "x" }], { judgeCwd: moduleDir, judgeTimeoutMs: 200 });
	assert.equal(slow.error.code, "playbook_judge_error");
	assert.match(slow.error.message, /timed out after 200ms/);
});

test("judge envelope: context is the prefix up to the current message — no future messages leak", () => {
	const dump = join(tmpdir(), `mdp-judge-dump-${process.pid}.json`);
	process.env.MDP_JUDGE_DUMP = dump;
	const steps = parsePlaybook(playbook([
		userBlock("any: true"),
		say("第一轮回复。"),
		userBlock(`- judge: ${judge("dump-envelope.mjs")}`),
		say("第二轮回复。"),
	]));
	const transcript = [
		SYS,
		{ role: "user", content: "第一句" },
		asstMsg([{ type: "text", text: "第一轮回复。" }]),
		{ role: "user", content: "第二句" },
		asstMsg([{ type: "text", text: "第二轮回复。" }]),
		{ role: "user", content: "未来不该被看到" },
	];
	const outcome = run(steps, transcript, { judgeCwd: moduleDir });
	assert.equal(outcome.error?.code, "playbook_exhausted", "the trailing future user message is rejected after the script end; the judge already ran with a leak-free prefix");
	const envelope = JSON.parse(readFileSync(dump, "utf8"));
	assert.equal(envelope.context.messages.length, 4, "prefix ends at the judged message — the two later messages must be absent");
	assert.equal(envelope.context.messages.at(-1).content, "第二句");
	assert.ok(!JSON.stringify(envelope).includes("未来不该被看到"), "future user text must not appear anywhere in the envelope");
	assert.equal(envelope.message.content, "第二句");
	assert.equal(envelope.location.kind, "user");
	assert.equal(envelope.location.step, 3);
	assert.deepEqual(envelope.targets, []);
	delete process.env.MDP_JUDGE_DUMP;
});

test("toolResult block: ordered cases on the pending result; judge verdict can jump an anchor", () => {
	const steps = parsePlaybook(playbook([
		userBlock("any: true"),
		say("查"),
		call("bash", "command: check"),
		toolResultBlock([`- judge: ${judge("../../examples/judges/status-verdict.mjs")}`, "  pass:", "    to: 完成", "- contains: \"Command exited with code 1\""].join("\n")),
		say("缺失，继续询问"),
		"```end\n```",
		anchor("完成"),
		say("报告已完整"),
	]));
	const base = [SYS, { role: "user", content: "go" }];
	const r1 = run(steps, base);
	assert.equal(r1.reply.stopReason, "toolUse");
	const missing = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_0", "(no output)\n\nCommand exited with code 1", false)]);
	assert.equal(textBlock(missing), "缺失，继续询问", "verdict judger fails on the exit-1 status line, the next case (contains) matches with no pass and continues");
	const complete = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_0", "ok\n", false)]);
	assert.equal(textBlock(complete), "报告已完整", "judge pass routes to the 完成 anchor");
});

test("toolResult block: no case matches without otherwise is a toolresult mismatch; id association still enforced", () => {
	const steps = parsePlaybook(playbook([
		userBlock("any: true"),
		call("bash", "command: x"),
		toolResultBlock("- contains: \"code 1\""),
		say("s"),
	]));
	const base = [SYS, { role: "user", content: "go" }];
	const r1 = run(steps, base);
	const noMatch = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_0", "totally different", false)]);
	assert.equal(noMatch.error.code, "playbook_toolresult_mismatch");
	assert.match(noMatch.error.message, /none of 1 case/);
	assert.equal(noMatch.reply, undefined);
	const wrongId = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("other_id", "Command exited with code 1", true)]);
	assert.equal(wrongId.error.code, "playbook_toolresult_unexpected", "case text must not blind the id association check");
});

test("end barrier: explicit finish; later requests are exhausted instead of falling into the next branch", () => {
	const withEnd = parsePlaybook(playbook([
		userBlock("any: true"),
		say("分支一结束"),
		"```end\n```",
		userBlock("exact: 第二分支"),
		say("分支二"),
	]));
	const r1 = run(withEnd, [SYS, { role: "user", content: "go" }]);
	assert.equal(textBlock(r1), "分支一结束");
	const after = run(withEnd, [SYS, { role: "user", content: "go" }, asstMsg(r1.reply.content), { role: "user", content: "第二分支" }]);
	assert.equal(after.error.code, "playbook_exhausted", "end prevents the next branch's user block from consuming new input");
	const withoutEnd = parsePlaybook(playbook([
		userBlock("any: true"),
		say("分支一结束"),
		userBlock("exact: 第二分支"),
		say("分支二"),
	]));
	const fallthrough = run(withoutEnd, [SYS, { role: "user", content: "go" }, asstMsg(r1.reply.content), { role: "user", content: "第二分支" }]);
	assert.equal(textBlock(fallthrough), "分支二", "contrast: without end the next branch is reachable (documented fall-through)");
});

test("forward jump may cross an end block to a later anchor", () => {
	const steps = parsePlaybook(playbook([
		userBlock(["- exact: 直达", "  pass:", "    to: 复活", "- any: true"].join("\n")),
		say("短途"),
		"```end\n```",
		anchor("复活"),
		say("跨过 end 的目标分支"),
	]));
	assert.equal(textBlock(run(steps, [SYS, { role: "user", content: "直达" }])), "跨过 end 的目标分支");
});
