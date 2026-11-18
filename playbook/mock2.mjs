#!/usr/bin/env node
// next-language 挂载入口：与 v1 mock.mjs 同契约（stdin 统一 JSON → stdout
// AssistantMessage / {"error":{...}}）。文件即函数；管理单元只有
// RV/User/Segment；前缀 continuation 缓存（--no-cache / PLAYBOOK2_CACHE=0）。
// 每请求把完整输入原样写一次只读 transcript 文件供外接 command 共用。
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as cache from "./lang2/cache.mjs";
import { continuationOf, freshSession, handleRequest, restoreSession } from "./lang2/interp.mjs";
import { randomUUID } from "node:crypto";
import { keySpaceOf } from "./lang2/cache-space.mjs";
import { loadUnit } from "./lang2/load-unit.mjs";
import { exportOutcome } from "./lang2/ir-export.mjs";
import { compactionSubjectOf, systemTextOf } from "./lang2/mount-reply.mjs";
import { DEFAULT_JUDGE_TIMEOUT_MS } from "./judge-exec.mjs";

const usage = "Usage: node mock2.mjs --playbook <file.md> [--playbook <file2.md>...] [--judge-timeout-ms <n>] [--cache-dir <dir>] [--no-cache]";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const playbooks = [];
let judgeTimeoutMs = DEFAULT_JUDGE_TIMEOUT_MS;
let cacheDir = resolve(here, "../target/test-artifacts/playbook2-cache");
let cacheOn = process.env.PLAYBOOK2_CACHE !== "0";
let compileOnly = false;
let observationPath = null;
for (let i = 0; i < args.length; i += 1) {
	if (args[i] === "--playbook" && args[i + 1]) { playbooks.push(args[i + 1]); i += 1; }
	else if (args[i] === "--judge-timeout-ms" && args[i + 1]) { judgeTimeoutMs = Number(args[i + 1]); i += 1; }
	else if (args[i] === "--cache-dir" && args[i + 1]) { cacheDir = args[i + 1]; i += 1; }
	else if (args[i] === "--no-cache") cacheOn = false;
	else if (args[i] === "--compile") compileOnly = true;
	else if (args[i] === "--compile-observations" && args[i + 1]) { observationPath = args[i + 1]; i += 1; }
	else { process.stderr.write(`mock2: 未知参数 ${args[i]}\n${usage}\n`); process.exit(1); }
}
if (observationPath) {
	const outcome = exportOutcome(resolve(process.cwd(), observationPath), new Map());
	process.stdout.write(JSON.stringify(outcome));
	process.exit(0);
}

if (!playbooks.length) { process.stderr.write(`mock2: 至少一个 --playbook\n${usage}\n`); process.exit(1); }

const configError = (message) => {
	process.stdout.write(JSON.stringify({ error: { status: 422, code: "playbook_invalid", message } }));
	process.exit(0);
};

const unitCache = new Map();
const opts = {
	judgeTimeoutMs,
	timeoutMs: judgeTimeoutMs,
	loadUnit: (path) => loadUnit(path, unitCache),
	cwdOf: (unit) => dirname(unit.path),
	systemText: (input, messages) => systemTextOf(input, messages),
	compactionSubject: (input, messages) => compactionSubjectOf(input, messages),
	transcriptPath: null,
	ensureTranscript() {
		if (this.transcriptPath) return this.transcriptPath;
		const dir = this.transcriptDir ?? mkdtempSync(join(tmpdir(), "pb2-transcript-"));
		this.transcriptDir = dir;
		this.transcriptPath = join(dir, `transcript-${this.requestId}.json`);
		writeFileSync(this.transcriptPath, this.transcriptSource);
		return this.transcriptPath;
	},
};

const rootPaths = playbooks.map((p) => resolve(process.cwd(), p));
for (const path of rootPaths) {
	try {
		statSync(path);
	} catch {
		configError(`playbook 文件不存在: ${path}`);
	}
}
try {
	for (const path of rootPaths) opts.loadUnit(path);
} catch (error) {
	configError(`${error.message}`);
}

if (compileOnly) {
	const summary = rootPaths.map((path) => {
		const unit = unitCache.get(path);
		return { path, nodes: unit.nodes.map((node) => node.kind), labels: Object.keys(unit.labels), matches: unit.matches.map((m) => m.data) };
	});
	process.stdout.write(JSON.stringify({ ok: true, roots: summary }));
	process.exit(0);
}

let input;
try {
	input = JSON.parse(await readStdinAll());
} catch (error) {
	process.stderr.write(`mock2: cannot parse stdin JSON: ${error}\n`);
	process.exit(1);
}

async function readStdinAll() {
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks).toString("utf8");
}

const requestId = randomUUID();
opts.requestId = requestId;
opts.transcriptSource = JSON.stringify(input);
let ownTempDir = false;
if (cacheOn) {
	try {
		mkdirSync(cacheDir, { recursive: true });
		opts.transcriptDir = join(cacheDir, "transcripts");
		mkdirSync(opts.transcriptDir, { recursive: true });
	} catch { /* 回落 tmpdir */ }
}
if (!opts.transcriptDir) {
	opts.transcriptDir = mkdtempSync(join(tmpdir(), "pb2-transcript-"));
	ownTempDir = true;
}

const rootUnits = new Map(rootPaths.map((path) => [path, unitCache.get(path)]));
const messages = input?.request?.context?.messages ?? [];
const keySpace = keySpaceOf([...unitCache.values()], input);

const hashesFresh = (continuation) => {
	if (!continuation?.unitHashes) return false;
	for (const [path, hash] of Object.entries(continuation.unitHashes)) {
		try {
			if (opts.loadUnit(path).hash !== hash) return false;
		} catch { return false; }
	}
	return true;
};

let session = null;
let leasedKey = null;
if (cacheOn) {
	const hit = cache.restore(cacheDir, keySpace, messages);
	if (hit && hashesFresh(hit.continuation)) {
		if (hit.prefixLen === messages.length && hit.reply) {
			process.stdout.write(JSON.stringify(hit.reply));
			process.exit(0);
		}
		const units = new Map(rootUnits);
		for (const path of hit.continuation.unitPaths ?? []) {
			if (!units.has(path)) units.set(path, opts.loadUnit(path));
		}
		session = restoreSession(hit.continuation, units, opts);
		leasedKey = hit.key;
	}
}
if (!session) session = freshSession(rootUnits, opts);

const lease = cacheOn && leasedKey ? cache.acquire(cacheDir, leasedKey, { requestId }) : null;
try {
	const outcome = handleRequest(session, input);
	if (outcome.error) {
		process.stderr.write(`mock2: ${outcome.error.code}: ${outcome.error.message}\n`);
		process.stdout.write(JSON.stringify({ error: outcome.error }));
		process.exitCode = 0;
	} else {
		if (cacheOn) {
			cache.save(cacheDir, keySpace, messages, continuationOf(session), session.executedVolatile.length > 0, { reply: outcome.reply });
			cache.scheduleCleanup(cacheDir);
		}
		process.stdout.write(JSON.stringify(outcome.reply));
	}
} finally {
	if (lease) cache.release(lease);
	if (opts.transcriptPath) {
		try { rmSync(opts.transcriptPath, { force: true }); } catch { /* best-effort */ }
	}
	if (ownTempDir && opts.transcriptDir) {
		try { rmSync(opts.transcriptDir, { recursive: true, force: true }); } catch { /* best-effort */ }
	}
}
