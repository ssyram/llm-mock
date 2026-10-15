import test from "node:test";
import assert from "node:assert/strict";
import { startServer, freePort } from "./harness.mjs";
import { makeModel } from "./models-shared.mjs";
import { replyDirection } from "./matrix-lib.mjs";
import { rng, genContext, genReplyCase } from "./fuzz.mjs";
import { fillCompletions } from "./canonical-occ-reply.mjs";

const thinking = (text, signature) => ({ type: "thinking", thinking: text, ...(signature === undefined ? {} : { thinkingSignature: signature }) });
const encrypted = { type: "reasoning.encrypted", data: "RW5jcnlwdGVk" };
const details = (items) => JSON.stringify(items);
const usage = { input: 11, output: 5, cacheRead: 13, cacheWrite: 17, totalTokens: 46,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

test("Completions canonical merges metadata without deriving visible thinking from details", () => {
	const source = { content: [thinking("first", details([
		{ type: "reasoning.text", text: "a", id: null, format: "", signature: null },
	])), thinking("second", details([
		{ type: "reasoning.text", text: "b", id: "id", format: "fmt", index: 0, signature: "sig" },
		encrypted,
		{ type: "reasoning.summary", summary: "c" }, { type: "reasoning.summary", summary: "d" },
	]))], usage: structuredClone(usage), stopReason: "stop" };
	const original = structuredClone(source);
	const out = structuredClone(source);
	fillCompletions(out, {});
	assert.equal(out.content[0].thinking, "firstsecond");
	assert.deepEqual(JSON.parse(out.content[0].thinkingSignature), [
		{ type: "reasoning.text", text: "ab", id: "id", format: "fmt", signature: "sig", index: 0 },
		encrypted, { type: "reasoning.summary", summary: "cd" },
	]);
	assert.deepEqual(source, original);
});

test("Completions Rust SSE / locked pi-ai signature regressions including all five fuzz seeds", async () => {
	const port = await freePort();
	const server = await startServer(port);
	const model = makeModel("openai-completions", port);
	const ident = { api: model.api, provider: model.provider, id: model.id };
	try {
		const cases = [];
		for (const seed of [30, 53, 114, 156, 189]) {
			const random = rng(seed * 1000003);
			genContext(random, ident, seed);
			cases.push(genReplyCase(random, ident, seed));
		}
		const vectors = [
			["field-name", thinking("visible", "reasoning_text"), "reasoning_text"],
			["details-opaque", thinking("visible", details([encrypted, { type: "reasoning.text", text: "metadata" }])), details([encrypted, { type: "reasoning.text", text: "metadata" }])],
			["details-only-empty-thinking", thinking("", details([encrypted])), details([encrypted])],
			["summary-text-wrong-shape", thinking("visible", details([{ type: "reasoning.summary", text: "invalid" }])), "reasoning_content"],
			["filter-invalid-detail", thinking("visible", details([encrypted, { type: "reasoning.text", text: 42 }])), details([encrypted])],
			["unrecognized-type-downgrades-to-text", thinking("visible", details([encrypted, { type: "unknown" }])), null],
			["opaque-downgrades-to-text", thinking("visible", "opaque"), null],
		];
		for (const [name, block] of vectors) cases.push({ name, message: { role: "assistant", api: model.api, provider: model.provider, model: model.id,
			content: [{ type: "text", text: "before" }, block, { type: "text", text: "after" }],
			usage: structuredClone(usage), stopReason: "stop", timestamp: 1 } });
		const results = [];
		await replyDirection(model.api, model, server, results, cases);
		assert.deepEqual(results.filter((r) => !r.ok).map((r) => ({ name: r.name, diffs: r.diffs })), []);
		for (const [name, block, signature] of vectors) {
			const actual = results.find((r) => r.name === name).actual;
			if (signature === null) {
				assert.deepEqual(actual.content, [{ type: "text", text: "beforevisibleafter" }]);
				continue;
			}
			assert.equal(actual.content.length, 2);
			assert.equal(actual.content[0].text, "beforeafter");
			assert.equal(actual.content[1].thinking, block.thinking);
			if (signature.startsWith("[")) assert.deepEqual(JSON.parse(actual.content[1].thinkingSignature), JSON.parse(signature));
			else assert.equal(actual.content[1].thinkingSignature, signature);
		}
	} finally { await server.stop(); }
});
