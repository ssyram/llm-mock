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
