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

const segmentFlowMd = () => playbook([
	userBlock("any: true"),
	segBlock("node " + JSON.stringify(programs("echo-segment.mjs")), "  - exact: 计数完成\n    pass:\n      to: 完成\n  - otherwise: true"),
	say("段内失败，停止"),
	end,
	anchor("完成"),
	say("段返回成功，收尾"),
	end,
]);

test("segment: cross-process replay — a real tool roundtrip then an internal return, chosen by cases", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdp-seg-"));
	const path = join(dir, "seg.md");
	writeFileSync(path, segmentFlowMd());
	const script = join(moduleDir, "..", "mock.mjs");
	const invoke = (messages) => {
		const stdin = JSON.stringify({ api: "openai-completions", model: "mock-m", request: { context: { messages } } });
		const out = spawnSync(process.execPath, [script, "--playbook", path], { input: stdin, encoding: "utf8" });
		assert.equal(out.status, 0, out.stderr);
		return JSON.parse(out.stdout);
	};
	const transcript = [SYS, { role: "user", content: "go" }];
	const round1 = invoke(transcript);
	assert.equal(round1.stopReason, "toolUse");
	assert.deepEqual(round1.content, [
		{ type: "text", text: "一次性探测开始。" },
		{ type: "toolCall", id: "seg_once", name: "bash", arguments: { command: "echo probe-ok" } },
	], "segment assistant message reaches the host (internal values never leak here)");
	transcript.push(asstMsg(round1.content, "toolUse"), toolResult("seg_once", "probe-ok\n"));
	const final = invoke(transcript);
	assert.equal(final.stopReason, "stop");
	assert.equal(final.content[0].text, "段返回成功，收尾", "fresh process replayed the segment from the transcript and matched the return value");
	const exhausted = invoke([...transcript, asstMsg(final.content)]);
	assert.equal(exhausted.error.code, "playbook_exhausted");
});

test("segment: one-shot return without any tool round continues linearly", () => {
	const md = playbook([
		userBlock("any: true"),
		segBlock("node -e \"process.stdout.write(JSON.stringify({result:'一次性完成'}))\"", "  - exact: 一次性完成"),
		say("一次性段之后继续"),
	]);
	const steps = parsePlaybook(md);
	const outcome = run(steps, [SYS, { role: "user", content: "go" }]);
	assert.equal(textBlock(outcome), "一次性段之后继续");
});

test("segment: transcript drift, mid-segment user input, and program faults are hard errors", () => {
	const steps = parsePlaybook(segmentFlowMd());
	const base = [SYS, { role: "user", content: "go" }];
	const drifted = run(steps, [...base, asstMsg([{ type: "text", text: "不是段输出" }, { type: "toolCall", id: "seg_once", name: "bash", arguments: { command: "echo probe-ok" } }], "toolUse")], { judgeCwd: moduleDir });
	assert.equal(drifted.error.code, "playbook_segment_drift");
	const userMid = run(steps, [...base, asstMsg([{ type: "text", text: "一次性探测开始。" }, { type: "toolCall", id: "seg_once", name: "bash", arguments: { command: "echo probe-ok" } }], "toolUse"), { role: "user", content: "插话" }], { judgeCwd: moduleDir });
	assert.equal(userMid.error.code, "playbook_segment_drift");
	assert.match(userMid.error.message, /user input mid-segment is not supported/, "user input ends the turn; segments span a single user turn");
	const fault = run(parsePlaybook(segmentFlowMd().replace(programs("echo-segment.mjs"), programs("fault-exit.mjs"))), base, { judgeCwd: moduleDir });
	assert.equal(fault.error.code, "playbook_program_error");
	assert.match(fault.error.message, /status 3/);
	assert.equal(fault.reply, undefined);
});

test("segment: a normal segment keeps prior jump rights, can be skipped, and is not counted by affine", () => {
	const marker = join(tmpdir(), `mdp-seg-mark-${process.pid}`);
	rmSync(marker, { force: true });
	process.env.MDP_SEGMENT_MARKER = marker;
	const md = playbook([
		userBlock(["- exact: 跳过段", "  pass:", "    to: 目标", "- any: true"].join("\n")),
		segBlock("node " + JSON.stringify(programs("echo-segment.mjs")), "  - any: true"),
		say("段后默认"),
		end,
		anchor("目标"),
		say("跳过了段"),
		end,
	]);
	const steps = parsePlaybook(md);
	const skipped = run(steps, [SYS, { role: "user", content: "跳过段" }], { judgeCwd: moduleDir });
	assert.equal(textBlock(skipped), "跳过了段");
	assert.ok(!existsSync(marker), "the segment program never ran when the jump skipped it");
	const entered = run(steps, [SYS, { role: "user", content: "正常" }], { judgeCwd: moduleDir });
	assert.equal(entered.reply.content.some((b) => b.type === "toolCall" && b.id === "seg_once"), true, "normal entry runs the segment");
	assert.ok(existsSync(marker));
	delete process.env.MDP_SEGMENT_MARKER;
	rmSync(marker, { force: true });
});

test("judger is an accepted alias of judge for case commands", () => {
	const steps = parsePlaybook(playbook([
		userBlock("- judger: node " + JSON.stringify(join(moduleDir, "judges", "pass-always.mjs"))),
		say("匹配"),
	]));
	assert.equal(textBlock(run(steps, [SYS, { role: "user", content: "任意" }], { judgeCwd: moduleDir })), "匹配");
});

test("mock.mjs: duplicate --judge-timeout-ms fails loudly instead of last-wins", () => {
	const dir = mkdtempSync(join(tmpdir(), "mdp-flags-"));
	const path = join(dir, "p.md");
	writeFileSync(path, playbook([userBlock("any: true"), say("s")]));
	const bad = spawnSync(process.execPath, [join(moduleDir, "..", "mock.mjs"), "--playbook", path, "--judge-timeout-ms", "500", "--judge-timeout-ms", "900"], { input: "{}", encoding: "utf8" });
	assert.equal(bad.status, 1);
	assert.match(bad.stderr, /more than once/);
});

test("new examples parse; the multi-call example drives a real batch through its aggregator", () => {
	const aggSteps = parsePlaybook(readFileSync(join(moduleDir, "..", "examples", "multi-call-aggregate.md"), "utf8"));
	const segSteps = parsePlaybook(readFileSync(join(moduleDir, "..", "examples", "segment-fuzz.md"), "utf8"));
	assert.equal(aggSteps.filter((s) => s.kind === "aggregator").length, 1);
	assert.equal(segSteps.filter((s) => s.kind === "segment").length, 1);
	const examplesDir = join(moduleDir, "..", "examples");
	const base = [SYS, { role: "user", content: "请给我做一次环境体检" }];
	const r1 = run(aggSteps, base, { judgeCwd: examplesDir });
	assert.equal(callBlocks(r1).length, 2, "one assistant message carries both probe calls");
	const done = run(aggSteps, [...base, asstMsg(r1.reply.content, "toolUse"), toolResult("mdp_0", ""), toolResult("mdp_1", "")], { judgeCwd: examplesDir });
	assert.equal(textBlock(done), "体检完成：两项探测全部通过，探测文件已就位。", "the example aggregator saw both empty stdout results and routed to 完成");
});
