// 真实 Pi CLI + mock-llm-server 的 markdown-playbook E2E。
// 由 tests/pi-harness-e2e.mjs 在 pi 可用时调用（宿主真实执行 bash 工具、
// 真实文件副作用、第二轮真实 user 续跑、错误输入与 expect 失配无后续副作用）。
// 证据写入 target/test-artifacts/markdown-playbook/<run>/。
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverBin, repoRoot } from "../../tests/harness.mjs";
import { artifactDir } from "../../tests/test-artifacts.mjs";
import { testCasePlaybookPi } from "./pi-case-e2e.mjs";
import { testAffineSegmentsPi } from "./pi-affine-e2e.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const playbookPath = join(moduleDir, "..", "examples", "report-flow.md");
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

export async function testMarkdownPlaybookPi({ dir, baseUrl, run, captures }) {
	const evidence = join(artifactDir, "markdown-playbook", `pi-e2e-${Date.now()}`);
	mkdirSync(evidence, { recursive: true });
	const agent = join(dir, "agent-mdp");
	mkdirSync(agent, { recursive: true });
	writeFileSync(join(agent, "models.json"), JSON.stringify({
		providers: {
			mdp: { baseUrl: `${baseUrl}/mdp/v1`, api: "openai-completions", apiKey: "mdp", models: [{ id: "mock-m", name: "Mock", reasoning: false, contextWindow: 100000, maxTokens: 1024 }] },
			mdpbad: { baseUrl: `${baseUrl}/mdpbad/v1`, api: "openai-completions", apiKey: "mdpbad", models: [{ id: "mock-m", name: "Mock", reasoning: false, contextWindow: 100000, maxTokens: 1024 }] },
		},
	}));
	for (const [name, pb] of [
		["mdp", playbookPath],
		["mdpbad", join(evidence, "expect-fail.md")],
	]) {
		const command = `${process.execPath} ${JSON.stringify(mockScript)} --playbook ${JSON.stringify(pb)}`;
		const result = run(serverBin, ["add", command, "--name", name, "--server-url", baseUrl]);
		assert.equal(result.status, 0, result.stderr);
	}
	writeFileSync(join(evidence, "expect-fail.md"), readFileSync(playbookPath, "utf8").replace("exit_code: 1", "exit_code: 0").replace("要我现在验证文件内容吗？", "EXPECTFAIL MARKER"));

	const env = { ...process.env, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1" };
	const baseFlags = ["--print", "--offline", "--approve", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-mcp", "--thinking", "off", "--tools", "bash"];
	const invoke = (provider, project, sessions, message, extra = []) => {
		const args = piArgs(["--model", `${provider}/mock-m`, "--session-dir", sessions, ...baseFlags], [...extra, message]);
		const result = run("pi", args, { cwd: project, env });
		return result;
	};
	const fresh = (label) => {
		const project = join(dir, `mdp-project-${label}`);
		mkdirSync(project, { recursive: true });
		return { project, sessions: join(dir, `mdp-sessions-${label}`) };
	};

	const { project: happyProject, sessions: happySessions } = fresh("happy");
	const turn1 = invoke("mdp", happyProject, happySessions, "请帮我生成 status.md 报告");
	save(evidence, "happy-turn1.stdout", turn1.stdout);
	save(evidence, "happy-turn1.stderr", turn1.stderr);
	assert.equal(turn1.status, 0, `turn1 failed: ${turn1.stdout}\n${turn1.stderr}`);
	assert.ok(turn1.stdout.includes("status.md 已创建。要我现在验证文件内容吗？"), `turn1 final say missing: ${turn1.stdout}`);
	for (const leak of ["第一轮", "第二轮", "等待用户确认", "验证并收尾", "这一段是给人看的说明文字"]) {
		assert.ok(!turn1.stdout.includes(leak), `heading/prose leaked into model output: ${leak}`);
	}
	assert.equal(readFileSync(join(happyProject, "status.md"), "utf8"), "ok\n", "real Pi bash side effect: status.md must exist with exact content");
	const turn2 = invoke("mdp", happyProject, happySessions, "好，请验证", ["-c"]);
	save(evidence, "happy-turn2.stdout", turn2.stdout);
	save(evidence, "happy-turn2.stderr", turn2.stderr);
	assert.equal(turn2.status, 0, `turn2 failed: ${turn2.stdout}\n${turn2.stderr}`);
	assert.ok(turn2.stdout.includes("验证通过：status.md 存在且内容为 ok，报告流程完成。"), `turn2 final say missing: ${turn2.stdout}`);

	const happyCaptures = captures().filter((capture) => capture.keyId === "mdp");
	assert.ok(happyCaptures.length >= 5, `expected >=5 model requests, got ${happyCaptures.length}`);
	const lastTranscript = happyCaptures[happyCaptures.length - 1].request.context.messages;
	assert.ok(lastTranscript.some((m) => m.role === "user" && userTextOf(m) === "好，请验证"), "second real user input reached the mock");
	const failedResult = happyCaptures.flatMap((c) => c.request.context.messages).find((m) => m.role === "toolResult" && m.content.some((b) => /Command exited with code 1/.test(b.text ?? "")));
	assert.ok(failedResult, "a real failed bash toolResult reached the model transcript");
	assert.notEqual(failedResult.isError, true, "empirical: openai-completions drops isError on the wire, so the decoded transcript must not claim it");
	const modelReplies = happyCaptures.flatMap((c) => c.request.context.messages).filter((m) => m.role === "assistant");
	assert.ok(modelReplies.some((m) => m.content.some((b) => b.type === "toolCall" && b.name === "bash" && b.arguments?.command === "test -f status.md && grep -q ok status.md\n")), "model request evidence: our say+call assistant message round-tripped (block-scalar command, byte-exact incl. trailing newline)");
	assert.ok(modelReplies.some((m) => m.content.some((b) => b.type === "toolCall" && b.name === "bash" && b.arguments?.command === "grep ok status.md\ntest \"$(wc -l < status.md)\" -eq 1\n")), "multi-line literal command round-tripped to a real Pi bash execution (turn2 passed only because both lines ran)");

	const { project: wrongProject } = fresh("wrong-input");
	const wrong = invoke("mdp", wrongProject, join(dir, "mdp-sessions-wrong"), "错误的开场输入");
	save(evidence, "wrong-input.stdout", wrong.stdout);
	save(evidence, "wrong-input.stderr", wrong.stderr);
	assert.notEqual(wrong.status, 0, "wrong startup input must fail the session");
	assert.match(wrong.stdout + wrong.stderr, /playbook_user_mismatch/);
	assert.match(wrong.stdout + wrong.stderr, /请帮我生成 status\.md 报告/);
	assert.ok(!existsSync(join(wrongProject, "status.md")), "wrong input must not execute any tool (no side effect)");

	const { project: failProject } = fresh("expect-fail");
	const failRun = invoke("mdpbad", failProject, join(dir, "mdp-sessions-expect"), "请帮我生成 status.md 报告");
	save(evidence, "expect-fail.stdout", failRun.stdout);
	save(evidence, "expect-fail.stderr", failRun.stderr);
	assert.notEqual(failRun.status, 0, "expect mismatch must fail the session");
	assert.match(failRun.stdout + failRun.stderr, /playbook_expect_mismatch/);
	assert.match(failRun.stdout + failRun.stderr, /expected exit_code 0/);
	assert.ok(!existsSync(join(failProject, "status.md")), "expect mismatch must stop before the create call (no side effect)");
	const badCaptures = captures().filter((c) => c.keyId === "mdpbad");
	assert.ok(badCaptures.length === 2, `expect-mismatch path: exactly 2 requests (call + failed expect), got ${badCaptures.length}`);
	assert.ok(!badCaptures.some((c) => c.request.context.messages.some((m) => m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.arguments?.command?.includes("printf")))), "no create-report toolCall may appear after a failed expect");

	writeFileSync(join(evidence, "captures-mdp.json"), JSON.stringify(happyCaptures, null, 2));
	writeFileSync(join(evidence, "captures-mdpbad.json"), JSON.stringify(badCaptures, null, 2));
	writeFileSync(join(evidence, "summary.json"), JSON.stringify({
		happyRequests: happyCaptures.length,
		expectFailRequests: badCaptures.length,
		statusFile: readFileSync(join(happyProject, "status.md"), "utf8"),
		nativeToolResult: failedResult,
	}, null, 2));
	await testCasePlaybookPi({ dir, baseUrl, run, captures });
	await testAffineSegmentsPi({ dir, baseUrl, run, captures });
	return evidence;
}

const userTextOf = (message) => typeof message.content === "string" ? message.content
	: (message.content ?? []).filter((b) => typeof b?.text === "string").map((b) => b.text).join("\n");
