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

import "./response-batch-checks.mjs";
import "./segment-checks.mjs";

test("parser: response group flattens to grouped steps; structural mistakes rejected", () => {
	const steps = multiCall();
	assert.deepEqual(steps.map((s) => s.kind), ["user", "say", "call", "expect", "call", "toolResult", "say"]);
	assert.deepEqual(steps.filter((s) => s.groupId).map((s) => s.groupId), [1, 1, 1, 1], "group members share one groupId");
	const rejects = [
		["group without a call", playbook([userBlock("any: true"), group(say("只有文本"))]), /at least one call/],
		["nested response", playbook([userBlock("any: true"), group(group(call("bash", "command: x")))]), /nested response groups/],
		["close without open", playbook([say("s"), "```/response"]), /without an open response group/],
		["unclosed group", playbook([userBlock("any: true"), "```response\n" + call("bash", "command: x")]), /unclosed response group/],
		["user inside group", playbook([userBlock("any: true"), group(call("bash", "command: x") + "\n\n" + userBlock("any: true"))]), /not allowed inside a response group/],
		["anchor inside group", playbook([userBlock("any: true"), group(call("bash", "command: x") + "\n\n" + anchor("内"))]), /cannot be declared inside a response group/],
		["matcher across group boundary", playbook([userBlock("any: true"), group(call("bash", "command: x")) + "\n\n" + toolResultBlock("- any: true")]), /same response group/],
	];
	for (const [name, md, pattern] of rejects) assert.throws(() => parsePlaybook(md), pattern, name);
});

test("parser: empty say is transparent — merged away, no barrier, never an empty assistant message", () => {
	const merged = parsePlaybook(playbook([userBlock("any: true"), "```say\n\n```", say("正文")]));
	assert.deepEqual(merged.map((s) => s.kind), ["user", "say"], "empty say block vanishes");
	assert.equal(merged[1].text, "正文");
	assert.throws(() => parsePlaybook(playbook([userBlock("any: true"), "```say\n\n```", userBlock("any: true")])), /cannot directly follow another user block/, "empty say is not a turn barrier");
	const grouped = parsePlaybook(playbook([userBlock("any: true"), group(["```say\n\n```", call("bash", "command: echo a"), "```say\n\n```", call("bash", "command: echo b")].join("\n\n"))]));
	const first = run(grouped, [SYS, { role: "user", content: "go" }]);
	assert.equal(first.reply.content.filter((b) => b.type === "text").length, 0, "no empty text block between grouped calls");
	assert.equal(callBlocks(first).length, 2);
});

test("affine: two toolResult blocks holding to in one batch are rejected — the count is of blocks, not targets", () => {
	const twoHolders = (first, second) => playbook([
		userBlock("any: true"),
		say("一"),
		call("bash", "command: echo a"),
		toolResultBlock(`- otherwise: true\n  pass:\n    to: ${first}`),
		say("二"),
		call("bash", "command: echo b"),
		toolResultBlock(`- otherwise: true\n  pass:\n    to: ${second}`),
		anchor(first === second ? first : "甲"),
		anchor("乙"),
		say("汇合处"),
	]);
	assert.throws(() => parsePlaybook(twoHolders("汇合", "汇合")), /affine violation: 2 toolResult blocks declare pass\.to.*max 1 without an aggregator/, "even to the same target");
	assert.throws(() => parsePlaybook(twoHolders("甲", "乙")), /affine violation: 2 toolResult blocks/, "distinct targets do not reduce the block count");
});

test("affine: one toolResult block with two mutually exclusive to targets is legal and both branches work", () => {
	const steps = parsePlaybook(playbook([
		userBlock("any: true"),
		call("bash", "command: x"),
		toolResultBlock(['- contains: "OK"', "  pass:", "    to: 甲", '- contains: "BAD"', "  pass:", "    to: 乙"].join("\n")),
		say("默认"),
		end,
		anchor("甲"),
		say("甲分支"),
		end,
		anchor("乙"),
		say("乙分支"),
		end,
	]));
	const base = [SYS, { role: "user", content: "go" }];
	const r1 = run(steps, base);
	const ok = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_0", "OK\n")]);
	assert.equal(textBlock(ok), "甲分支");
	const bad = run(steps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_0", "BAD\n")]);
	assert.equal(textBlock(bad), "乙分支");
});

test("affine: aggregator batch rejections — local to, segments, duplicates, ordering, bypass jumps", () => {
	const rejects = [
		["local to with aggregator", aggFlow({ localPass: true }), /aggregator batch forbids local pass\.to/],
		["segment in aggregator batch", aggFlow({ segment: true }), /cannot contain a segment/],
		["two aggregators in one batch", aggFlow({ secondAgg: true }), /at most one aggregator/],
		["call after aggregator", aggFlow({ callAfterAgg: true }), /no call may follow the aggregator/],
		["end before aggregator", aggFlow({ endBeforeAgg: true }), /end before the aggregator would bypass/],
		["aggregator directly after a mid-batch say", aggFlow({ midSay: true }), /aggregator must not directly follow a say block/],
		["user jump past the aggregator", aggFlow({ user: "- exact: 直达\n  pass:\n    to: 完成" }), /would skip the mandatory convergence/],
		["segment directly after say", playbook([userBlock("any: true"), say("先说一句"), segBlock("node s.mjs", "  - any: true"), say("后")]), /segment must not directly follow a say block/],
	];
	for (const [name, md, pattern] of rejects) assert.throws(() => parsePlaybook(md), pattern, name);
});

test("affine: the aggregator's own case may jump past itself; jumps landing before it stay legal", () => {
	const legal = parsePlaybook(playbook([
		userBlock(["- exact: 早跳", "  pass:", "    to: 汇合前", "- any: true"].join("\n")),
		anchor("汇合前"),
		say("进入前"),
		call("bash", "command: x"),
		toolResultBlock("- any: true"),
		aggBlock("node a.mjs", "  - any: true\n    pass:\n      to: 完成"),
		say("后"),
		anchor("完成"),
		say("完成分支"),
	]));
	assert.equal(legal.filter((s) => s.kind === "aggregator").length, 1);
});
