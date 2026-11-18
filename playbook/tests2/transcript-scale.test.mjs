// transcript 文件协议的规模与边界：10MB 级真实输入、单次写盘多命令共享、
// 清理只删本请求文件（cache sweep 不碰在途 transcript；独占 tmp 目录随进程删除）。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { sweep } from "../lang2/cache.mjs";
import { session } from "./helpers/run-mock2.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const mock2 = join(here, "..", "mock2.mjs");

function workspace(prefix) {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	const programs = join(dir, "programs");
	mkdirSync(programs);
	return { dir, programs };
}

test("10MB transcript：一次写盘、多命令共享同一文件、小 envelope、指针真实消费", () => {
	const { dir, programs } = workspace("pb2scale-");
	writeFileSync(join(programs, "probe.mjs"), [
		"import { readFileSync, statSync } from 'node:fs';",
		"const envelope = JSON.parse(readFileSync(0, 'utf8'));",
		"const size = statSync(envelope.transcript).size;",
		"const transcript = JSON.parse(readFileSync(envelope.transcript, 'utf8'));",
		"const count = transcript.request.context.messages.length;",
		"if (count !== 1) throw new Error('transcript must carry the full request: ' + count);",
		"if (JSON.stringify(envelope).length > 4096) throw new Error('envelope must stay small');",
		"process.stdout.write(JSON.stringify({ result: 'ok:' + (size > 9 * 1024 * 1024 ? '10mb' : 'small') + ':' + envelope.pointer }));",
	].join("\n"));
	const playbook = join(dir, "scale.md");
	writeFileSync(playbook, [
		"```user", "- any: true", "```",
		"```segment", `command: node ${JSON.stringify(join(programs, "probe.mjs"))}`, "cases:", "  - otherwise: true", "```",
		"```say", "done", "```",
	].join("\n"));
	const messages = [{ role: "user", content: "go\n" + "x".repeat(10 * 1024 * 1024) }];
	const input = { api: "openai-completions", model: "mock-m", request: { context: { messages } } };
	const result = spawnSync(process.execPath, [mock2, "--playbook", playbook, "--no-cache", "--judge-timeout-ms", "20000"], {
		input: JSON.stringify(input), encoding: "utf8", timeout: 60000, maxBuffer: 32 * 1024 * 1024, cwd: dir,
	});
	assert.equal(result.status, 0, result.stderr);
	const reply = JSON.parse(result.stdout);
	assert.equal(reply.error, undefined, JSON.stringify(reply.error || {}));
	assert.equal(reply.content[0].text, "done");
	assert.equal(readdirSync(dir).length, 2, "独占 tmp 目录随进程清理，只留剧本与 programs");
});

test("同请求多命令共享同一 transcript 文件（segment 程序与 judge 都读它）", () => {
	const { dir, programs } = workspace("pb2share-");
	writeFileSync(join(programs, "probe.mjs"), [
		"import { readFileSync } from 'node:fs';",
		"const envelope = JSON.parse(readFileSync(0, 'utf8'));",
		"const transcript = JSON.parse(readFileSync(envelope.transcript, 'utf8'));",
		"const users = transcript.request.context.messages.filter(m => m.role === 'user').length;",
		"process.stdout.write(JSON.stringify({ result: 'users:' + users + ':at:' + envelope.pointer }));",
	].join("\n"));
	writeFileSync(join(programs, "check.mjs"), [
		"import { readFileSync } from 'node:fs';",
		"const envelope = JSON.parse(readFileSync(0, 'utf8'));",
		"const transcript = JSON.parse(readFileSync(envelope.transcript, 'utf8'));",
		"process.stdout.write(transcript.request.context.messages.filter(m => m.role === 'user').length === 1 ? 'pass' : 'fail');",
	].join("\n"));
	const playbook = join(dir, "share.md");
	writeFileSync(playbook, [
		"```user", "- any: true", "```",
		"```segment", `command: node ${JSON.stringify(join(programs, "probe.mjs"))}`,
		"cases:", `  - judge: node ${JSON.stringify(join(programs, "check.mjs"))}`, "```",
		"```say", "```",
		"```call bash", "command: echo one", "```",
		"```say", "shared", "```",
	].join("\n"));
	const s = session({ playbook });
	s.pushUser("go");
	const reply = s.call().reply;
	assert.equal(reply.error, undefined, JSON.stringify(reply.error || {}));
	s.pushToolResults(reply, {});
	const done = s.call().reply;
	assert.equal(done.error, undefined, JSON.stringify(done.error || {}));
	assert.equal(done.content[0].text, "shared");
});

test("cache sweep 不会清除在途或遗留的 transcript 文件；共享 transcripts 目录不被删除", () => {
	const cacheDir = mkdtempSync(join(tmpdir(), "pb2sweep-"));
	const transcriptsDir = join(cacheDir, "transcripts");
	mkdirSync(transcriptsDir);
	const foreign = join(transcriptsDir, "transcript-inflight.json");
	writeFileSync(foreign, "{}");
	sweep(cacheDir, Date.now() + 10 * 60 * 1000);
	assert.equal(statSync(foreign).size, 2, "sweep 只看 cache 根的 .json 条目，不碰 transcripts/ 内文件");
	assert.ok(readdirSync(transcriptsDir).includes("transcript-inflight.json"));
});
