// Server lifecycle + capture pairing + deep comparison for the duality harness.
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import net from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { streamOptions } from "./models-shared.mjs";

const testsDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(testsDir, "..");
export const serverBin = process.env.MOCK_SERVER_BIN ?? join(repoRoot, "target/debug/mock-llm-server");

export function freePort() {
	return new Promise((resolve, reject) => {
		const probe = net.createServer();
		probe.once("error", reject);
		probe.listen(0, "127.0.0.1", () => {
			const port = probe.address().port;
			probe.close(() => resolve(port));
		});
	});
}

export async function startServer(port, env = {}, replySource) {
	const dir = mkdtempSync(join(tmpdir(), "duality-"));
	const replyPath = join(dir, "reply.json");
	writeFileSync(replyPath, JSON.stringify(minimalReply));
	const registryPath = join(dir, "registry.json");
	writeFileSync(
		registryPath,
		JSON.stringify({
			entries: ["duality", streamOptions("openai-codex-responses").apiKey].map((keyId) => ({ keyId, matcher: { type: "any" }, reply: replySource ?? { type: "file", path: replyPath } })),
		}),
	);
	const mountsPath = join(dir, "mounts.json");
	writeFileSync(mountsPath, JSON.stringify({ "w08-mistral": { command: `cat '${replyPath}'`, prefer: "mistral-conversations" } }));
	const captureDir = join(dir, "capture");
	mkdirSync(captureDir);
	const child = spawn(serverBin, [
		"--port",
		String(port),
		"--registry",
		registryPath,
		"--capture-dir",
		captureDir,
		"--mounts-file",
		mountsPath,
	], { env: { ...process.env, ...env } });
	let ready = false;
	let listeningPort = port;
	const stdout = [];
	child.stdout.on("data", (d) => {
		stdout.push(String(d));
		const match = stdout.join("").match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
		if (match) {
			listeningPort = Number(match[1]);
			ready = true;
		}
	});
	child.stderr.on("data", (d) => process.stderr.write(`[server] ${d}`));
	for (let i = 0; i < 100 && !ready; i++) {
		await new Promise((r) => setTimeout(r, 50));
	}
	if (!ready) throw new Error(`server did not start: ${stdout.join("")}`);
	return { child, dir, replyPath, captureDir, port: listeningPort, mistralBaseUrl: `http://127.0.0.1:${listeningPort}/w08-mistral`, stop: () => killTree(child) };
}

function killTree(child) {
	return new Promise((res) => {
		child.on("exit", () => res());
		child.kill("SIGTERM");
		setTimeout(() => {
			try {
				child.kill("SIGKILL");
			} catch {}
			res();
		}, 2000);
	});
}

const minimalReply = {
	content: [{ type: "text", text: "ok" }],
	api: "openai-completions",
	provider: "mock",
	model: "m",
	usage: {
		input: 1,
		output: 1,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 2,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	},
	stopReason: "stop",
	timestamp: 0,
};

// Clear capture dir, run fn, return the single new capture record.
export async function withCapture(server, fn, expectedCount = 1) {
	for (const f of readdirSync(server.captureDir)) rmSync(join(server.captureDir, f));
	const value = await fn();
	const files = readdirSync(server.captureDir).filter((f) => f.startsWith("req-"));
	if (files.length !== expectedCount) {
		throw new Error(`expected exactly ${expectedCount} capture file, got ${files.length}: ${files.join(",")}${value?.errorMessage ? `; SDK: ${value.errorMessage}` : ""}`);
	}
	return { record: files.length === 1 ? JSON.parse(readFileSync(join(server.captureDir, files[0]), "utf8")) : undefined, value };
}

const JSON_SIGNATURE_APIS = new Set(["openai-completions", "openai-responses", "azure-openai-responses", "openai-codex-responses"]);

function tryJsonNormalize(s) {
	try {
		const parsed = JSON.parse(s);
		if (parsed && typeof parsed === "object") return JSON.stringify(sortKeysAlpha(parsed));
	} catch {}
	return undefined;
}

function sortKeysAlpha(v) {
	if (Array.isArray(v)) return v.map(sortKeysAlpha);
	if (v && typeof v === "object") {
		const out = {};
		for (const k of Object.keys(v).sort()) out[k] = sortKeysAlpha(v[k]);
		return out;
	}
	return v;
}

// --- deep compare with ignore paths (suffix match on "."-segments, e.g. "usage.cost") ---
function matchesIgnore(pathSegs, ignoreRule) {
	const rule = ignoreRule.split(".");
	const segs = pathSegs.map((s) => s.replace(/\[\d+\]$/, ""));
	if (rule.length > segs.length) return false;
	const off = segs.length - rule.length;
	for (let i = 0; i < rule.length; i++) {
		if (rule[i] === "*") continue;
		if (rule[i] !== segs[off + i]) return false;
	}
	return true;
}

export function deepDiff(actual, expected, ignores = [], path = "$", out = [], protocol = expected?.api) {
	if (actual === expected) return out;
	if (typeof actual !== typeof expected || actual === null || expected === null || typeof actual !== "object") {
		if (!ignores.some((r) => matchesIgnore(path.split("."), r))) {
			out.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
		}
		return out;
	}
	if (Array.isArray(actual) !== Array.isArray(expected)) {
		if (!ignores.some((r) => matchesIgnore(path.split("."), r))) {
			out.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
		}
		return out;
	}
	if (Array.isArray(actual)) {
		if (actual.length !== expected.length && !ignores.some((r) => matchesIgnore(path.split("."), r))) {
			out.push(`${path}: expected length ${expected.length}, got ${actual.length}`);
			return out;
		}
		for (let i = 0; i < Math.min(actual.length, expected.length); i++) {
			deepDiff(actual[i], expected[i], ignores, `${path}[${i}]`, out, protocol);
		}
		return out;
	}
	const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
	for (const k of keys) {
		const p = `${path}.${k}`;
		if (ignores.some((r) => matchesIgnore(p.split("."), r))) continue;
		const aV = actual[k];
		const eV = expected[k];
		if (aV === undefined && eV === undefined) continue;
		// Reasoning JSON carriers ignore key order; opaque and v1 text signatures do not.
		if (typeof aV === "string" && typeof eV === "string" && ((k === "thinkingSignature" && JSON_SIGNATURE_APIS.has(protocol)) || (p === "$.options.reasoning" && protocol === "bedrock-converse-stream"))) {
			const aN = tryJsonNormalize(aV);
			const eN = tryJsonNormalize(eV);
			if (aN !== undefined && eN !== undefined) {
				if (aN !== eN) out.push(`${p}: semantic JSON mismatch: expected ${eN}, got ${aN}`);
				continue;
			}
		}
		if (aV === undefined) out.push(`${p}: missing (expected ${JSON.stringify(eV)})`);
		else if (eV === undefined) out.push(`${p}: unexpected ${JSON.stringify(aV)}`);
		else deepDiff(aV, eV, ignores, p, out, protocol);
	}
	return out;
}
