// case matcher 增量的真实 Pi E2E：真实 mock-llm-server 挂载 + 真实 pi CLI
//（真实 bash 工具执行、真实文件副作用、真实第二轮 user 续跑）。覆盖四场景：
// 缺失→问人→自然语言确认→创建；已有报告直接跳"完成"不写文件；拒绝→取消；
// 多剧本路由（argv 首选 + 跨进程归属保持）。judger 是剧本目录下的只读本地
// 脚本，由播放器执行，不经 Pi 工具。证据写入 markdown-playbook/pi-case-e2e-<ts>/。
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { serverBin } from "../../../../tests/harness.mjs";
import { artifactDir } from "../../../../tests/test-artifacts.mjs";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const casePlaybook = join(moduleDir, "..", "examples", "report-case-flow.md");
const routeFirstPlaybook = join(moduleDir, "..", "examples", "route-first.md");
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

export async function testCasePlaybookPi({ dir, baseUrl, run, captures }) {
	const evidence = join(artifactDir, "markdown-playbook", `pi-case-e2e-${Date.now()}`);
	mkdirSync(evidence, { recursive: true });
	const agent = join(dir, "agent-mdpcase");
	mkdirSync(agent, { recursive: true });
	writeFileSync(join(agent, "models.json"), JSON.stringify({
		providers: {
			mdpcase: { baseUrl: `${baseUrl}/mdpcase/v1`, api: "openai-completions", apiKey: "mdpcase", models: [{ id: "mock-m", name: "Mock", reasoning: false, contextWindow: 100000, maxTokens: 1024 }] },
			mdproute: { baseUrl: `${baseUrl}/mdproute/v1`, api: "openai-completions", apiKey: "mdproute", models: [{ id: "mock-m", name: "Mock", reasoning: false, contextWindow: 100000, maxTokens: 1024 }] },
		},
	}));
	const quote = (text) => JSON.stringify(text);
	for (const [name, command] of [
		["mdpcase", `${process.execPath} ${quote(mockScript)} --playbook ${quote(casePlaybook)}`],
		["mdproute", `${process.execPath} ${quote(mockScript)} --playbook ${quote(routeFirstPlaybook)} --playbook ${quote(casePlaybook)}`],
	]) {
		const result = run(serverBin, ["add", command, "--name", name, "--server-url", baseUrl]);
		assert.equal(result.status, 0, result.stderr);
	}

	const env = { ...process.env, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1" };
	const baseFlags = ["--print", "--offline", "--approve", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-mcp", "--thinking", "off", "--tools", "bash"];
	const invoke = (provider, project, sessions, message, extra = []) => {
		const args = piArgs(["--model", `${provider}/mock-m`, "--session-dir", sessions, ...baseFlags], [...extra, message]);
		return run("pi", args, { cwd: project, env });
	};
	const fresh = (label) => {
		const project = join(dir, `mdpcase-project-${label}`);
		mkdirSync(project, { recursive: true });
		return { project, sessions: join(dir, `mdpcase-sessions-${label}`) };
	};
	const reportAsk = "status.md 缺失或内容不对。要我现在创建并验证吗？";

	// 场景 1：报告缺失 → 真实检查 exit 1 → toolResult judger 判缺失 → 问用户 →
	// 自然语言确认（judger 接受）→ 真实创建+验证 → 完成。
	{
		const { project, sessions } = fresh("missing-create");
		const turn1 = invoke("mdpcase", project, sessions, "帮我准备一下 status.md 报告");
		save(evidence, "missing-create-turn1.stdout", turn1.stdout);
		assert.equal(turn1.status, 0, `turn1 failed: ${turn1.stdout}\n${turn1.stderr}`);
		assert.ok(turn1.stdout.includes(reportAsk), `turn1 must end asking the user: ${turn1.stdout}`);
		assert.ok(!existsSync(join(project, "status.md")), "missing branch must not write anything before confirmation");
		const turn2 = invoke("mdpcase", project, sessions, "可以，请补齐", ["-c"]);
		save(evidence, "missing-create-turn2.stdout", turn2.stdout);
		assert.equal(turn2.status, 0, `turn2 failed: ${turn2.stdout}\n${turn2.stderr}`);
		assert.ok(turn2.stdout.includes("报告已创建并验证通过"), `turn2 final say missing: ${turn2.stdout}`);
		assert.equal(readFileSync(join(project, "status.md"), "utf8"), "ok\n", "real Pi bash created status.md via the generated toolCall path");
	}

	// 场景 2：报告已完整 → toolResult judger 判完整 → pass 跳"完成"锚点 →
	// 不写文件、不发起创建调用。
	{
		const { project, sessions } = fresh("already-complete");
		writeFileSync(join(project, "status.md"), "ok-preserved-marker\n");
		const turn1 = invoke("mdpcase", project, sessions, "帮我看下 status.md 报告");
		save(evidence, "already-complete-turn1.stdout", turn1.stdout);
		assert.equal(turn1.status, 0, `turn1 failed: ${turn1.stdout}\n${turn1.stderr}`);
		assert.ok(turn1.stdout.includes("报告已完整"), `complete branch final say missing: ${turn1.stdout}`);
		assert.equal(readFileSync(join(project, "status.md"), "utf8"), "ok-preserved-marker\n", "complete branch must not rewrite the existing report");
		const completeCaptures = captures().filter((c) => c.keyId === "mdpcase" && c.request.context.messages.some((m) => m.role === "user" && userTextOf(m) === "帮我看下 status.md 报告"));
		assert.ok(completeCaptures.length >= 2, "complete branch: at least the check call + final reply requests");
		assert.ok(!completeCaptures.some((c) => c.request.context.messages.some((m) => m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.arguments?.command?.includes("printf")))), "complete branch must never issue the create toolCall");
		save(evidence, "captures-already-complete.json", JSON.stringify(completeCaptures, null, 2));
	}

	// 场景 3：缺失 → 问用户 → 拒绝（judger fail → otherwise 跳"取消"）→ 不创建。
	{
		const { project, sessions } = fresh("deny-cancel");
		const turn1 = invoke("mdpcase", project, sessions, "请处理 status.md 报告");
		assert.equal(turn1.status, 0, `turn1 failed: ${turn1.stdout}\n${turn1.stderr}`);
		assert.ok(turn1.stdout.includes(reportAsk), `turn1 must ask first: ${turn1.stdout}`);
		const turn2 = invoke("mdpcase", project, sessions, "不用了，取消吧", ["-c"]);
		save(evidence, "deny-cancel-turn2.stdout", turn2.stdout);
		assert.equal(turn2.status, 0, `turn2 failed: ${turn2.stdout}\n${turn2.stderr}`);
		assert.ok(turn2.stdout.includes("已取消"), `cancel branch final say missing: ${turn2.stdout}`);
		assert.ok(!existsSync(join(project, "status.md")), "cancelled flow must leave no side effects");
	}

	// 场景 4：多剧本路由 —— route-first 在 argv 前面：匹配"几点"时首选；
	// 报告输入落到第二份剧本，且第二轮（新进程）归属保持不变。
	{
		const timeProject = fresh("route-time");
		const timeTurn = invoke("mdproute", timeProject.project, timeProject.sessions, "现在几点了？");
		save(evidence, "route-time.stdout", timeTurn.stdout);
		assert.equal(timeTurn.status, 0, `time turn failed: ${timeTurn.stdout}\n${timeTurn.stderr}`);
		assert.ok(timeTurn.stdout.includes("上面就是当前的系统日期"), `route-first final say missing: ${timeTurn.stdout}`);

		const { project, sessions } = fresh("route-report");
		const turn1 = invoke("mdproute", project, sessions, "帮我准备一下 status.md 报告");
		assert.equal(turn1.status, 0, `routed turn1 failed: ${turn1.stdout}\n${turn1.stderr}`);
		assert.ok(turn1.stdout.includes(reportAsk), `routed turn1 must be the report playbook: ${turn1.stdout}`);
		const turn2 = invoke("mdproute", project, sessions, "好，请补齐", ["-c"]);
		save(evidence, "route-report-turn2.stdout", turn2.stdout);
		assert.equal(turn2.status, 0, `routed turn2 failed: ${turn2.stdout}\n${turn2.stderr}`);
		assert.ok(turn2.stdout.includes("报告已创建并验证通过"), `ownership must stay with the report playbook across processes: ${turn2.stdout}`);
		assert.equal(readFileSync(join(project, "status.md"), "utf8"), "ok\n", "routed report flow created the file for real");
		const routeCaptures = captures().filter((c) => c.keyId === "mdproute");
		const reportReqs = routeCaptures.filter((c) => c.request.context.messages.some((m) => m.role === "user" && userTextOf(m) === "帮我准备一下 status.md 报告"));
		assert.ok(reportReqs.length >= 4, `report session on mdproute: check + ask + create + verify requests, got ${reportReqs.length}`);
		assert.ok(reportReqs.some((c) => c.request.context.messages.some((m) => m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.arguments?.command?.includes("printf")))), "round-2 routed request carries the real create toolCall in its transcript");
		assert.ok(routeCaptures.some((c) => c.request.context.messages.some((m) => m.role === "assistant" && m.content.some((b) => b.type === "toolCall" && b.name === "bash" && b.arguments?.command?.includes("date")))), "time session ran the route-first playbook on the same mount");
		save(evidence, "captures-mdproute.json", JSON.stringify(routeCaptures, null, 2));
	}

	writeFileSync(join(evidence, "summary.json"), JSON.stringify({
		scenarios: ["missing-create", "already-complete-no-write", "deny-cancel", "multi-playbook-routing"],
	}, null, 2));
	return evidence;
}
