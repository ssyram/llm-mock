import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const directory = new URL("./fixtures/corpus-discovery/", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("manifest.json", directory), "utf8"));
const cases = manifest.cases.map((entry) => {
	const raw = readFileSync(new URL(entry.file, directory), "utf8");
	return { ...entry, raw, rows: raw.trimEnd().split("\n").map((line) => JSON.parse(line)) };
});
const byName = Object.fromEntries(cases.map((entry) => [entry.name, entry.rows.map((r) => r.message)]));
const blocks = (message) => message.content.map((block) => block.type);

// No private source files are needed to validate the distributed material.
test("sanitized materials: manifest hashes, JSONL wrappers and message counts", () => {
	assert.equal(manifest.classification, "sanitized-real-excerpts");
	assert.equal(cases.length, 5);
	assert.equal(cases.reduce((sum, entry) => sum + entry.rows.length, 0), 25);
	assert.deepEqual(readdirSync(directory).sort(), ["manifest.json", ...manifest.cases.map((e) => e.file)].sort());
	for (const entry of cases) {
		assert.equal(entry.rows.length, manifest.cases.find((e) => e.name === entry.name).rows);
		assert.equal(createHash("sha256").update(entry.raw).digest("hex"), entry.sha256);
		for (const row of entry.rows) {
			assert.deepEqual(Object.keys(row).sort(), entry.source.kind === "extension-capture"
				? ["capturedAt", "message"] : ["message"]);
			assert.ok(["system", "user", "assistant", "toolResult"].includes(row.message.role));
			assert.ok(Number.isInteger(row.message.timestamp));
		}
	}
});

test("sanitized materials: all nine tool calls pair once, in order, with matching names", () => {
	let pairs = 0;
	for (const entry of cases) {
		const pending = new Map();
		const seen = new Set();
		for (const { message } of entry.rows) {
			if (message.role === "assistant") {
				assert.equal(pending.size, 0);
				for (const block of message.content.filter((b) => b.type === "toolCall")) {
					assert.equal(message.stopReason, "toolUse");
					assert.ok(!seen.has(block.id));
					seen.add(block.id);
					pending.set(block.id, block.name);
				}
			}
			if (message.role === "toolResult") {
				assert.equal(message.toolCallId, pending.keys().next().value);
				assert.equal(pending.get(message.toolCallId), message.toolName);
				pending.delete(message.toolCallId);
				assert.equal(typeof message.isError, "boolean");
				pairs++;
			}
		}
		assert.equal(pending.size, 0);
	}
	assert.equal(pairs, 9);
});

test("sanitized materials: thinking before successful tool and after tool are distinct", () => {
	const post = byName["post-tool-thinking"];
	assert.deepEqual(blocks(post[2]), ["toolCall"]);
	assert.deepEqual(blocks(post[4]), ["thinking", "text"]);
	const before = byName["thinking-tool-success"];
	assert.deepEqual(blocks(before[2]), ["thinking", "toolCall"]);
	assert.deepEqual(blocks(before[4]), ["text"]);
	assert.equal(post[3].isError, false);
	assert.equal(before[3].isError, false);
	assert.equal(post[4].content[0].thinkingSignature, "reasoning_content");
	assert.equal(before[2].content[0].thinkingSignature, "reasoning_content");
});

test("sanitized materials: provider rejection strings remain errors with empty content", () => {
	for (const [name, code] of [["provider-model-not-found", "model_not_found"],
		["provider-thinking-rejected", "1210"]]) {
		const message = byName[name][2];
		assert.equal(message.stopReason, "error");
		assert.deepEqual(message.content, []);
		assert.ok(message.errorMessage.includes(code));
		assert.match(message.errorMessage, /^(400|404) /);
	}
});

test("sanitized materials: native excerpt retains consecutive mixed three/four-tool rounds", () => {
	const native = byName["native-mixed-tool-rounds"];
	assert.deepEqual(blocks(native[0]), ["thinking", "text", "toolCall", "toolCall", "toolCall"]);
	assert.deepEqual(blocks(native[4]), ["thinking", "text", "toolCall", "toolCall", "toolCall", "toolCall"]);
	assert.deepEqual(native[0].content.slice(2).map((b) => b.name), ["bash", "read", "bash"]);
	assert.deepEqual(native[4].content.slice(2).map((b) => b.name), ["bash", "read", "bash", "read"]);
	assert.ok(Object.hasOwn(native[6], "details"));
	assert.deepEqual(native.filter((m) => m.role === "toolResult").map((m) => m.isError),
		[true, false, false, false, false, true, false]);
	assert.equal(cases.find((e) => e.name === "native-mixed-tool-rounds").source.completeConversation, false);
	for (const message of [native[0], native[4]]) {
		const thinking = JSON.parse(message.content[0].thinkingSignature);
		assert.deepEqual(Object.keys(thinking), ["type", "id", "summary", "content", "encrypted_content"]);
		assert.equal(thinking.type, "reasoning");
		assert.match(thinking.encrypted_content, /^sanitized-\d+$/);
		const text = JSON.parse(message.content[1].textSignature);
		assert.deepEqual(Object.keys(text), ["v", "id", "phase"]);
	}
});

test("sanitized materials: every nonblank string is a safe enum or replacement", () => {
	const safe = new Set(["system", "user", "assistant", "toolResult", "text", "thinking", "toolCall",
		"object", "string", "number", "integer", "boolean", "array", "null", "reasoning", "summary_text",
		"reasoning_text", "json_schema", "openai-completions", "openai-responses", "openai-codex-responses",
		"stop", "length", "toolUse", "error", "aborted", "tool_calls", "completed", "end_turn",
		"off", "minimal", "low", "medium", "high", "xhigh", "commentary", "final", "read", "bash",
		"edit", "write", "grep", "find", "ls", "path", "offset", "limit", "command", "timeout",
		"reasoning_content"]);
	function check(value, field = "") {
		if (Array.isArray(value)) return value.forEach((item) => check(item, field));
		if (value && typeof value === "object") return Object.entries(value).forEach(([key, item]) => check(item, key));
		if (typeof value !== "string" || !value.trim()) return;
		if (field.endsWith("Signature") && value.startsWith("{")) return check(JSON.parse(value));
		if (field === "errorMessage") {
			assert.match(value, /^(404 \{"error":\{"code":"model_not_found","message":"Sanitized rejection"\}\}|400 \{"error":\{"code":"1210","message":"Sanitized thinking rejection"\}\})$/);
			return;
		}
		assert.ok(safe.has(value) || /^sanitized-\d{4}$/.test(value), `unexpected string at ${field}`);
	}
	for (const entry of cases) for (const row of entry.rows) check(row);
});
