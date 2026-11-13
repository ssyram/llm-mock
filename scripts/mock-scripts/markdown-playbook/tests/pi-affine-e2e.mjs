// 本轮增量的真实 Pi E2E：隔离的本地 mock provider/server/cwd/session，真实
// bash 工具执行与真实文件副作用。覆盖：一条 assistant 消息携带多个
// toolCalls（response 分组）+ aggregator 必经汇合与唯一跳转；跨轮 segment
// 发出真实工具调用、接收真实 toolResult、内部返回值由 cases 选择后续；
// 程序故障硬停无 fallback；非法 affine 剧本挂载即协议可见拒绝。
// 证据写入 target/test-artifacts/markdown-playbook/pi-affine-e2e-<ts>/。
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverBin } from "../../../../tests/harness.mjs";
import { artifactDir } from "../../../../tests/test-artifacts.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const multiPlaybook = join(moduleDir, "..", "examples", "multi-call-aggregate.md");
const segmentPlaybook = join(moduleDir, "..", "examples", "segment-fuzz.md");
const mockScript = join(moduleDir, "..", "mock.mjs");

function piArgs(base, extra) {
	const args = [...base, ...extra];
	const seen = new Set();
	for (const arg of args) {
		if (!arg.startsWith("-")) continue;
		assert.ok(!seen.has(arg), `duplicate CLI flag ${arg} in [${args.join(" ")}] — helper refuses to append conflicting flags`);
		seen.add(arg);
	}
	return args;
}

const save = (dir, name, data) => writeFileSync(join(dir, name), data);
const userTextOf = (message) => typeof message.content === "string" ? message.content
	: (message.content ?? []).filter((b) => typeof b?.text === "string").map((b) => b.text).join("\n");

export async function testAffineSegmentsPi({ dir, baseUrl, run, captures }) {
	const evidence = join(artifactDir, "markdown-playbook", `pi-affine-e2e-${Date.now()}`);
	mkdirSync(evidence, { recursive: true });
	const agent = join(dir, "agent-mdp-affine");
	mkdirSync(agent, { recursive: true });
	writeFileSync(join(agent, "models.json"), JSON.stringify({
		providers: {
			mdpmulti: { baseUrl: `${baseUrl}/mdpmulti/v1`, api: "openai-completions", apiKey: "mdpmulti", models: [{ id: "mock-m", name: "Mock", reasoning: false, contextWindow: 100000, maxTokens: 1024 }] },
			mdpseg: { baseUrl: `${baseUrl}/mdpseg/v1`, api: "openai-completions", apiKey: "mdpseg", models: [{ id: "mock-m", name: "Mock", reasoning: false, contextWindow: 100000, maxTokens: 1024 }] },
			mdpsegbad: { baseUrl: `${baseUrl}/mdpsegbad/v1`, api: "openai-completions", apiKey: "mdpsegbad", models: [{ id: "mock-m", name: "Mock", reasoning: false, contextWindow: 100000, maxTokens: 1024 }] },
			mdpccawalk: { baseUrl: `${baseUrl}/mdpccawalk/v1`, api: "openai-completions", apiKey: "mdpccawalk", models: [{ id: "mock-m", name: "Mock", reasoning: false, contextWindow: 100000, maxTokens: 1024 }] },
		mdpaffinebad: { baseUrl: `${baseUrl}/mdpaffinebad/v1`, api: "openai-completions", apiKey: "mdpaffinebad", models: [{ id: "mock-m", name: "Mock", reasoning: false, contextWindow: 100000, maxTokens: 1024 }] },
		},
	}));

	const faultPlaybook = join(evidence, "segment-fault.md");
	writeFileSync(faultPlaybook, [
		"# 故障剧本：segment 程序非零退出必须硬停",
		"",
		"```user",
		"any: true",
		"```",
		"",
		"```segment",
		`command: node ${JSON.stringify(join(moduleDir, "programs", "fault-exit.mjs"))}`,
		"cases:",
		"  - any: true",
		"```",
		"",
		"```say",
		"不应到达这里。",
		"```",
		"",
		"```end",
		"```",
		"",
	].join("\n"));
	const affineBadPlaybook = join(evidence, "affine-invalid.md");
	writeFileSync(affineBadPlaybook, [
		"# 非法剧本：同批两个 toolResult 块都持有 to（AFFINE 反例）",
		"",
		"```user",
		"any: true",
		"```",
		"",
		"```say",
		"第一步",
		"```",
		"",
		"```call bash",
		"command: echo a",
		"```",
		"",
		"```toolResult",
		"- otherwise: true",
		"  pass:",
		"    to: 汇合",
		"```",
		"",
		"```say",
		"第二步",
		"```",
		"",
		"```call bash",
		"command: echo b",
		"```",
		"",
		"```toolResult",
		"- otherwise: true",
		"  pass:",
		"    to: 汇合",
		"```",
		"",
		"<a id=\"汇合\"></a>",
		"",
		"```say",
		"汇合",
		"```",
		"",
		"```end",
		"```",
		"",
	].join("\n"));

	const quote = (text) => JSON.stringify(text);
	for (const [name, command] of [
		["mdpmulti", `node ${quote(mockScript)} --playbook ${quote(multiPlaybook)}`],
		["mdpseg", `node ${quote(mockScript)} --playbook ${quote(segmentPlaybook)}`],
		["mdpsegbad", `node ${quote(mockScript)} --playbook ${quote(faultPlaybook)}`],
		["mdpaffinebad", `node ${quote(mockScript)} --playbook ${quote(affineBadPlaybook)}`],
		["mdpccawalk", `node ${quote(mockScript)} --playbook ${quote(join(moduleDir, "..", "examples", "cca-scc-walk.md"))}`],
	]) {
		const result = run(serverBin, ["add", command, "--name", name, "--server-url", baseUrl]);
		assert.equal(result.status, 0, result.stderr);
	}

	const env = { ...process.env, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1" };
	const baseFlags = ["--print", "--offline", "--approve", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-mcp", "--thinking", "off", "--tools", "bash"];
	const invoke = (provider, project, sessions, message) => {
		const args = piArgs(["--model", `${provider}/mock-m`, "--session-dir", sessions, ...baseFlags], [message]);
		return run("pi", args, { cwd: project, env });
	};
	const fresh = (label) => {
		const project = join(dir, `mdp-affine-project-${label}`);
		mkdirSync(project, { recursive: true });
		return { project, sessions: join(dir, `mdp-affine-sessions-${label}`) };
	};

	// 场景 A：多 call + aggregator —— 一条 assistant 消息携带两个 bash 调用，
	// 真实写出两个探测文件；aggregator 看到两个真实结果后唯一跳转。
	{
		const { project, sessions } = fresh("multi");
		const turn = invoke("mdpmulti", project, sessions, "请给我做一次环境体检");
		save(evidence, "multi-turn.stdout", turn.stdout);
		save(evidence, "multi-turn.stderr", turn.stderr);
		assert.equal(turn.status, 0, `multi turn failed: ${turn.stdout}\n${turn.stderr}`);
		assert.ok(turn.stdout.includes("体检完成：两项探测全部通过，探测文件已就位。"), `aggregator-routed final say missing: ${turn.stdout}`);
		assert.equal(readFileSync(join(project, "probe-a.txt"), "utf8"), "a", "real side effect: probe-a.txt written by the first grouped toolCall (printf a, no newline)");
		assert.equal(readFileSync(join(project, "probe-b.txt"), "utf8"), "b", "real side effect: probe-b.txt written by the second grouped toolCall");
		const multiCaptures = captures().filter((c) => c.keyId === "mdpmulti");
		assert.ok(multiCaptures.length >= 2, `expected >=2 model requests, got ${multiCaptures.length}`);
		const twoCallMessage = multiCaptures.flatMap((c) => c.request.context.messages).find((m) => m.role === "assistant" && m.content.filter((b) => b.type === "toolCall").length === 2);
		assert.ok(twoCallMessage, "one assistant message must carry BOTH bash toolCalls (response group)");
		const commands = twoCallMessage.content.filter((b) => b.type === "toolCall").map((b) => b.arguments.command);
		assert.deepEqual(commands, ["printf a > probe-a.txt", "printf b > probe-b.txt"]);
		assert.ok(multiCaptures.some((c) => c.request.context.messages.filter((m) => m.role === "toolResult").length >= 2), "the follow-up request carries both real tool results for the batch");
		save(evidence, "captures-mdpmulti.json", JSON.stringify(multiCaptures, null, 2));
	}

	// 场景 B：跨轮 segment —— 两轮真实工具往返（写文件 + 复核）后返回内部
	// 值，cases 跳到"成功"锚点收尾；内部返回值从未作为 assistant 输出。
	{
		const { project, sessions } = fresh("segment");
		const turn = invoke("mdpseg", project, sessions, "开始 fuzz 探测");
		save(evidence, "segment-turn.stdout", turn.stdout);
		save(evidence, "segment-turn.stderr", turn.stderr);
		assert.equal(turn.status, 0, `segment turn failed: ${turn.stdout}\n${turn.stderr}`);
		assert.ok(turn.stdout.includes("fuzz 段返回成功，外层剧本继续收尾。"), `segment-routed final say missing: ${turn.stdout}`);
		assert.equal(readFileSync(join(project, "fuzz-probe.txt"), "utf8"), "fuzz", "real side effect: the segment-issued bash toolCall wrote the probe file (printf fuzz, no newline)");
		const segCaptures = captures().filter((c) => c.keyId === "mdpseg");
		assert.ok(segCaptures.length >= 3, `expected >=3 model requests (two tool rounds + final), got ${segCaptures.length}`);
		const segCalls = segCaptures.flatMap((c) => c.request.context.messages).filter((m) => m.role === "assistant").flatMap((m) => m.content.filter((b) => b.type === "toolCall" && String(b.id).startsWith("seg_")));
		assert.deepEqual([...new Set(segCalls.map((b) => b.id))], ["seg_probe_1", "seg_probe_2"], "both segment rounds round-tripped through the real host (transcripts replay earlier rounds)");
		const segResults = segCaptures.flatMap((c) => c.request.context.messages).filter((m) => m.role === "toolResult" && String(m.toolCallId ?? "").startsWith("seg_"));
		assert.deepEqual([...new Set(segResults.map((m) => m.toolCallId))], ["seg_probe_1", "seg_probe_2"], "real host tool results came back for both segment calls");
		assert.ok(!turn.stdout.includes("探测失败"), "the internal return value never leaks as assistant output");
		save(evidence, "captures-mdpseg.json", JSON.stringify(segCaptures, null, 2));
	}

	// 场景 C：segment 程序故障（非零退出）—— 协议可见硬停，无任何副作用。
	{
		const { project, sessions } = fresh("fault");
		const turn = invoke("mdpsegbad", project, sessions, "任何输入");
		save(evidence, "fault-turn.stdout", turn.stdout);
		save(evidence, "fault-turn.stderr", turn.stderr);
		assert.notEqual(turn.status, 0, "program fault must fail the session");
		assert.match(turn.stdout + turn.stderr, /playbook_program_error/);
		assert.match(turn.stdout + turn.stderr, /status 3/);
		assert.ok(!existsSync(join(project, "fuzz-probe.txt")), "program fault must not reach any tool call (no side effect)");
	}

	// 场景 D：非法 affine 剧本 —— 挂载后首个请求即协议可见拒绝。
	{
		const { project, sessions } = fresh("affine-bad");
		const turn = invoke("mdpaffinebad", project, sessions, "任何输入");
		save(evidence, "affine-bad-turn.stdout", turn.stdout);
		save(evidence, "affine-bad-turn.stderr", turn.stderr);
		assert.notEqual(turn.status, 0, "affine-invalid playbook must fail the session");
		assert.match(turn.stdout + turn.stderr, /playbook_invalid/);
		assert.match(turn.stdout + turn.stderr, /affine violation: 2 toolResult blocks/);
		assert.ok(!existsSync(join(project, "probe-a.txt")), "invalid playbook never executes any tool");
	}

	// 场景 E：CCA result_ref 分页游程 —— 每一页都是 segment 发出的真实 bash
	// 工具调用（合成取页器返回 result_ref 封套），segment 解引用完整对象、
	// 校验分页契约，用真实 next_after 游标走完全部页，最后写成员清单文件。
	{
		const { project, sessions } = fresh("cca-walk");
		const turn = invoke("mdpccawalk", project, sessions, "请开始 SCC 成员遍历");
		save(evidence, "cca-walk-turn.stdout", turn.stdout);
		save(evidence, "cca-walk-turn.stderr", turn.stderr);
		assert.equal(turn.status, 0, `cca walk failed: ${turn.stdout}\n${turn.stderr}`);
		assert.ok(turn.stdout.includes("SCC 成员遍历完成：全部页面用真实游标走完，清单已写入 cca-walk-members.txt。"), `walk final say missing: ${turn.stdout}`);
		assert.equal(readFileSync(join(project, "cca-walk-members.txt"), "utf8"), "m01\nm02\nm03\nm04\nm05\nm06\nm07\n", "real side effect: the summary toolCall wrote the walked member list");
		const walkCaptures = captures().filter((c) => c.keyId === "mdpccawalk");
		assert.ok(walkCaptures.length >= 5, `expected >=5 model requests (3 pages + summary + final), got ${walkCaptures.length}`);
		const walkCommands = walkCaptures.flatMap((c) => c.request.context.messages).filter((m) => m.role === "assistant").flatMap((m) => m.content.filter((b) => b.type === "toolCall" && String(b.id ?? "").startsWith("seg_"))).map((b) => b.arguments.command);
		const pageCommands = [...new Set(walkCommands.filter((command) => command.includes("cca-fixture-page.mjs")))];
		assert.equal(pageCommands.length, 3, "three DISTINCT pages fetched via real bash tool calls (transcripts replay earlier rounds)");
		assert.match(pageCommands[1], /"m03"$/, "page 2 cursor is page 1's last member id");
		assert.match(pageCommands[2], /"m06"$/, "page 3 cursor is page 2's last member id");
		const envelopes = walkCaptures.flatMap((c) => c.request.context.messages).filter((m) => m.role === "toolResult" && String(m.toolCallId ?? "").startsWith("seg_")).map((m) => (m.content ?? []).map((b) => b?.text ?? "").join(""));
		assert.ok(envelopes.slice(0, 3).every((text) => text.includes("result_ref")), "the tool results that came back were result_ref envelopes (dereferenced by the segment, not by the host)");
		save(evidence, "captures-mdpccawalk.json", JSON.stringify(walkCaptures, null, 2));
	}

	writeFileSync(join(evidence, "summary.json"), JSON.stringify({
		scenarios: ["multi-call-aggregator", "cross-round-segment", "program-fault-hard-stop", "affine-invalid-rejected", "cca-result-ref-paged-walk"],
	}, null, 2));
	return evidence;
}
