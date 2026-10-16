import test from "node:test";
import assert from "node:assert/strict";
import { canonicalReply, compareReply } from "./canonical-reply.mjs";
import { requiresGoogleToolId } from "./canonical-google-reply.mjs";
import { deepDiff } from "./harness.mjs";
import { makeModel } from "./models-shared.mjs";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const source = (api, model) => ({ api, provider: model.provider, model: model.id, content: [{ type: "toolCall", id: "@pi-generated:1", name: "echo", arguments: { x: 1 } }], usage, stopReason: "toolUse", timestamp: 1 });

test("source IDs resembling internal markers stay exact, corrupted IDs fail", () => {
	for (const api of ["pi-messages", "openai-completions", "google-generative-ai"]) {
		const model = { ...makeModel(api, 1), id: api === "google-generative-ai" ? "gemini-3-test" : "m" };
		const expected = canonicalReply(api, source(api, model), model);
		const actual = { ...structuredClone(expected), timestamp: 150 };
		assert.deepEqual(compareReply(actual, expected, deepDiff, 100, 200), []);
		actual.content[0].id = "echo_150_1";
		assert.ok(compareReply(actual, expected, deepDiff, 100, 200).some((diff) => diff.includes("id")), api);
	}
});

test("generated expectations never occupy the business ID namespace", () => {
	const model = { ...makeModel("google-generative-ai", 1), id: "gemini-3-test" };
	const value = source(model.api, model);
	value.content.unshift({ type: "toolCall", id: "", name: "echo", arguments: {} });
	const expected = canonicalReply(model.api, value, model);
	const actual = { ...structuredClone(expected), timestamp: 150 };
	actual.content[0].id = "echo_150_1";
	assert.deepEqual(compareReply(actual, expected, deepDiff, 100, 200), []);
	actual.content[1].id = "echo_150_2";
	assert.ok(compareReply(actual, expected, deepDiff, 100, 200).length);
});

test("Google live and case-insensitive model names preserve unique transmitted IDs", () => {
	for (const id of ["gemini-live-3-test", "GEMINI-LIVE-3-test", "gemini-3-test", "claude-test", "gpt-oss-test"]) {
		assert.equal(requiresGoogleToolId({ id }), true, id);
		const model = { ...makeModel("google-generative-ai", 1), id };
		const out = canonicalReply(model.api, source(model.api, model), model);
		assert.equal(out.content[0].id, "@pi-generated:1");
		assert.deepEqual(compareReply({ ...structuredClone(out), timestamp: 150 }, out, deepDiff, 100, 200), []);
	}
	for (const id of ["gemini-2-test", "prefix-gemini-3-test", "gemini-live-2-test", "CLAUDE-test", "GPT-OSS-test"]) assert.equal(requiresGoogleToolId({ id }), false, id);
});
