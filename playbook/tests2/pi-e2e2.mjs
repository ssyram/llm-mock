// 真实 Pi + 本地 mock server 的 mock2 代表流程 E2E（沿 v1 tests/harness 模式）：
// system 入口→多 tool 真实执行→参数化 import 循环(外部 counter+save)→空 say 拆批
// →动态 ID→最终文本；证据写 target/test-artifacts/playbook2/。
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { artifactDir } from "../../tests/test-artifacts.mjs";
import { serverBin, startServer } from "../../tests/harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const playbookRoot = join(here, "..");
const playbookPath = join(playbookRoot, "examples2", "loop-import.md");
const evidence = join(artifactDir, "playbook2", `pi-e2e-${Date.now()}`);
mkdirSync(evidence, { recursive: true });

const server = await startServer(0);
const baseUrl = `http://127.0.0.1:${server.port}`;
const dir = mkdtempSync(join(tmpdir(), "pb2pi-"));
const agent = join(dir, "agent");
mkdirSync(agent, { recursive: true });
writeFileSync(join(agent, "models.json"), JSON.stringify({
	providers: {
		mdp2: { baseUrl: `${baseUrl}/mdp2/v1`, api: "openai-completions", apiKey: "mdp2", models: [{ id: "mock-m", name: "Mock", reasoning: false, contextWindow: 100000, maxTokens: 1024 }] },
	},
}));

const cacheDir = join(evidence, "cache");
const command = `${process.execPath} ${JSON.stringify(join(playbookRoot, "mock2.mjs"))} --playbook ${JSON.stringify(playbookPath)} --cache-dir ${JSON.stringify(cacheDir)} 2>>${JSON.stringify(join(evidence, "mount-stderr.log"))}`;
const add = spawnSync(serverBin, ["add", command, "--name", "mdp2", "--server-url", baseUrl], { encoding: "utf8" });
assert.equal(add.status, 0, add.stderr);
const env = { ...process.env, PI_CODING_AGENT_DIR: agent, PI_OFFLINE: "1" };
const run = (args) => spawnSync("pi", args, { cwd: dir, env, encoding: "utf8", timeout: 90000, maxBuffer: 8 * 1024 * 1024 });

const result = run(["--print", "--offline", "--approve", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-mcp", "--thinking", "off", "--tools", "bash",
	"--model", "mdp2/mock-m", "--session-dir", join(dir, "sessions"), "开始"]);
writeFileSync(join(evidence, "pi-stdout.txt"), result.stdout ?? "");
writeFileSync(join(evidence, "pi-stderr.txt"), result.stderr ?? "");
const earlyCaptures = () => { try { return readdirSync(server.captureDir).filter((n) => n.startsWith("req-")).map((n) => JSON.parse(readFileSync(join(server.captureDir, n), "utf8"))); } catch { return []; } };
if (result.status !== 0) {
	writeFileSync(join(evidence, "captures-on-failure.json"), JSON.stringify(earlyCaptures(), null, 1));
}
assert.equal(result.status, 0, result.stderr || result.stdout);

const captures = readdirSync(server.captureDir).filter((n) => n.startsWith("req-")).map((n) => JSON.parse(readFileSync(join(server.captureDir, n), "utf8")))
	.sort((a, b) => a.request.context.messages.length - b.request.context.messages.length);
writeFileSync(join(evidence, "captures.json"), JSON.stringify(captures, null, 1));
assert.ok(captures.length >= 3, `期望 ≥3 次真实模型请求（入口批/拆批批/收尾），实际 ${captures.length}`);
const longest = captures[captures.length - 1];
const allCalls = longest.request.context.messages.filter((m) => m.role === "assistant").flatMap((m) => m.content.filter((b) => b.type === "toolCall"));
const ids = allCalls.map((c) => c.id);
assert.deepEqual(ids, [...new Set(ids)].sort(), `动态工具 ID 必须唯一且递增: ${ids.join(",")}`);
assert.ok(ids.every((id) => /^p2_\d+$/.test(id)), `工具 ID 应为 p2_N: ${ids.join(",")}`);
const tools = allCalls.map((c) => c.name);
assert.ok(tools.every((t) => t === "bash"), `宿主真实执行 bash: ${tools.join(",")}`);
const results = longest.request.context.messages.filter((m) => m.role === "toolResult").map((m) => m.content.map((b) => b.text).join("\n"));
assert.ok(results.some((t) => t.includes("round-3-3")), `真实 bash 回执含 round-3-3: ${JSON.stringify(results)}`);
assert.ok(results.some((t) => t.includes("batch-2-marker")), `真实 bash 回执含 batch-2-marker: ${JSON.stringify(results)}`);
assert.ok(result.stdout.includes("完成：3 轮"), `最终文本: ${result.stdout.slice(0, 200)}`);
assert.ok(!result.stdout.includes("playbook") || !result.stdout.includes("```"), "无剧本说明泄露");

await server.stop();
console.log(`PASS playbook2 pi-e2e: ${captures.length} real requests, tools [${tools.join(",")}], ids [${ids.join(",")}]; evidence ${evidence}`);
