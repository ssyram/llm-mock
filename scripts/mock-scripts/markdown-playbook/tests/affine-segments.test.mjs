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
