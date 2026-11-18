// 本轮增量单测：response 多工具批次（一条 assistant 消息多个 toolCalls、
// 按 toolCall ID 关联、结果到齐才决定）、AFFINE 跳转权正反例（按持有 to 的
// 块计数；aggregator 批次局部禁 to）、aggregator 必经汇合（看到原始+局部
// 结果、唯一跳转、程序故障硬停）、segment 跨轮回放/一次性返回/可被跳过/
// 用户中途输入拒绝/漂移硬停、judger 别名、空 say 透明、flag 冲突响亮失败。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parsePlaybook } from "../parse-markdown.mjs";
import { runPlaybook } from "../playbook-runtime.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const programs = (name) => join(moduleDir, "programs", name);
const playbook = (blocks) => blocks.join("\n\n");
const say = (text) => "```say\n" + text + "\n```";
const call = (tool, params) => "```call " + tool + "\n" + params + "\n```";
const expectBlock = (params) => "```expect\n" + params + "\n```";
const userBlock = (params) => "```user\n" + params + "\n```";
const toolResultBlock = (params) => "```toolResult\n" + params + "\n```";
const aggBlock = (command, cases) => "```aggregator\ncommand: " + command + "\ncases:\n" + cases + "\n```";
const segBlock = (command, cases) => "```segment\ncommand: " + command + "\ncases:\n" + cases + "\n```";
const group = (inner) => "```response\n" + inner + "\n```/response";
const anchor = (id) => `<a id="${id}"></a>`;
const end = "```end\n```";
const dumpAgg = aggBlock("node " + JSON.stringify(programs("dump-aggregator.mjs")), "  - exact: 全部就绪\n    pass:\n      to: 完成\n  - otherwise: true");

const SYS = { role: "system", content: "sysprompt", toolsAdded: [{ name: "bash", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } }] };
const asstMsg = (content, stopReason = "stop") => ({ role: "assistant", content, stopReason });
const toolResult = (id, text, isError = false, toolName = "bash") => ({ role: "toolResult", toolCallId: id, toolName, content: [{ text }], isError });
const run = (steps, messages, options = {}) => runPlaybook(steps, { api: "openai-completions", model: "mock-m", request: { context: { messages } } }, options);
const textBlock = (r) => r.reply.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
const callBlocks = (r) => r.reply?.content.filter((b) => b.type === "toolCall") ?? [];

const multiCall = () => parsePlaybook(playbook([
	userBlock("any: true"),
	say("开始"),
	group([call("bash", "command: echo AAA"), expectBlock("contains: AAA"), call("bash", "command: echo BBB"), toolResultBlock('- contains: "BBB"')].join("\n\n")),
	say("收尾"),
]));

const aggFlow = (extra = {}) => playbook([
	userBlock(extra.user ?? "any: true"),
	extra.preSay === false ? "" : say("同时探测"),
	extra.group === false ? "" : group([call("bash", "command: echo AAA"), expectBlock("contains: AAA"), call("bash", "command: echo BBB"), toolResultBlock(extra.localPass ? '- contains: "BBB"\n  pass:\n    to: 完成' : '- contains: "BBB"')].join("\n\n")),
	extra.endBeforeAgg ? end : "",
	extra.midSay ? say("批次中间说明") : "",
	extra.segment ? segBlock("node s.mjs", "  - any: true") : "",
	extra.secondAgg ? aggBlock("node y.mjs", "  - any: true") : "",
	dumpAgg,
	extra.callAfterAgg ? call("bash", "command: late") : "",
	say("有缺失"),
	end,
	anchor("完成"),
	say("完成：全部就绪"),
	end,
].filter((block) => block !== ""));

test("multi-call: one assistant message with text + N toolCalls; per-call matchers bind by ID, results may arrive in any order", () => {
	const steps = multiCall();
	const base = [SYS, { role: "user", content: "go" }];
	const r1 = run(steps, base);
	assert.equal(r1.reply.stopReason, "toolUse");
	assert.deepEqual(r1.reply.content, [
		{ type: "text", text: "开始" },
		{ type: "toolCall", id: "mdp_0", name: "bash", arguments: { command: "echo AAA" } },
		{ type: "toolCall", id: "mdp_1", name: "bash", arguments: { command: "echo BBB" } },
	], "adjacent calls inside one response group share ONE assistant message");
	const reversed = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_1", "BBB\n"), toolResult("mdp_0", "AAA\n")]);
	assert.equal(textBlock(reversed), "收尾", "second call's result arrived first; each matcher still saw its own call's result");
});

test("multi-call: the whole batch must arrive before continuing — no early jump, no early reply", () => {
	const steps = parsePlaybook(playbook([
		userBlock("any: true"),
		group([call("bash", "command: echo A"), call("bash", "command: echo B"), toolResultBlock(['- otherwise: true', "  pass:", "    to: 完成锚"].join("\n"))].join("\n\n")),
		say("默认路径"),
		anchor("完成锚"),
		say("跳转路径"),
	]));
	const base = [SYS, { role: "user", content: "go" }];
	const r1 = run(steps, base);
	const partial = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_1", "anything\n")]);
	assert.equal(partial.error.code, "playbook_state");
	assert.match(partial.error.message, /awaiting toolResult for call\(s\) mdp_0/);
	assert.equal(partial.reply, undefined, "the matched pass on the first-arrived result must NOT jump early");
	const prematureAssistant = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_1", "anything\n"), asstMsg([{ type: "text", text: "提前" }])]);
	assert.equal(prematureAssistant.error.code, "playbook_state");
	const complete = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_1", "anything\n"), toolResult("mdp_0", "A\n")]);
	assert.equal(textBlock(complete), "跳转路径", "after the full batch the held jump applies exactly once");
});

test("multi-call: mismatch, unknown id and duplicate id are hard stops", () => {
	const steps = multiCall();
	const base = [SYS, { role: "user", content: "go" }];
	const r1 = run(steps, base);
	const mismatch = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_1", "WRONG\n"), toolResult("mdp_0", "AAA\n")]);
	assert.equal(mismatch.error.code, "playbook_toolresult_mismatch");
	const unknown = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_9", "x\n")]);
	assert.equal(unknown.error.code, "playbook_toolresult_unexpected");
	const duplicate = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_0", "AAA\n"), toolResult("mdp_0", "AAA\n")]);
	assert.equal(duplicate.error.code, "playbook_toolresult_unexpected", "a second result for the same id is unsolicited");
});

test("aggregator: mandatory convergence — runs only after ALL results, sees raw texts + local verdicts in playbook order, decides the single jump", () => {
	const steps = parsePlaybook(aggFlow());
	const dump = join(tmpdir(), `mdp-agg-${process.pid}.json`);
	rmSync(dump, { force: true });
	process.env.MDP_AGG_DUMP = dump;
	const base = [SYS, { role: "user", content: "go" }];
	const r1 = run(steps, base);
	const partial = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_1", "BBB\n")]);
	assert.equal(partial.error.code, "playbook_state");
	assert.ok(!existsSync(dump), "aggregator must not run before every result arrived");
	const done = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_1", "BBB\n"), toolResult("mdp_0", "AAA\n")], { judgeCwd: moduleDir });
	assert.equal(textBlock(done), "完成：全部就绪", "aggregator verdict routed the batch to the single jump target");
	const envelope = JSON.parse(readFileSync(dump, "utf8"));
	assert.deepEqual(envelope.results, [
		{ callId: "mdp_0", tool: "bash", text: "AAA\n", verdict: "expect ok" },
		{ callId: "mdp_1", tool: "bash", text: "BBB\n", verdict: 'contains: "BBB"' },
	], "raw result text plus the local matcher verdict, in playbook call order despite reversed arrival");
	assert.equal(envelope.location.kind, "aggregator");
	assert.equal(envelope.context.messages.length, 5, "prefix ends at the last consumed message — no future leak");
	delete process.env.MDP_AGG_DUMP;
	rmSync(dump, { force: true });
});

test("aggregator: no-match and program fault are distinct hard stops with no fallback", () => {
	const steps = parsePlaybook(aggFlow());
	const base = [SYS, { role: "user", content: "go" }];
	const r1 = run(steps, base);
	const fed = [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_1", "Command exited with code 1\nBBB"), toolResult("mdp_0", "AAA\n")];
	process.env.MDP_AGG_DUMP = join(tmpdir(), `mdp-agg2-${process.pid}.json`);
	const mismatch = run(parsePlaybook(aggFlow().replace("\n  - otherwise: true", "")), fed, { judgeCwd: moduleDir });
	delete process.env.MDP_AGG_DUMP;
	assert.equal(mismatch.error.code, "playbook_aggregator_mismatch", "local matchers pass but the dump aggregator prints 有缺失 for a failure text — no case matches");
	assert.equal(mismatch.reply, undefined);
	const fault = run(parsePlaybook(aggFlow().replace(programs("dump-aggregator.mjs"), programs("fault-exit.mjs"))), fed, { judgeCwd: moduleDir });
	assert.equal(fault.error.code, "playbook_program_error");
	assert.match(fault.error.message, /status 3/);
	assert.match(fault.error.message, /injected program failure/);
	assert.equal(fault.reply, undefined, "program fault must not fall back to any scripted reply or tool call");
});
