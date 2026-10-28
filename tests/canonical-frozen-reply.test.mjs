import test from "node:test";
import assert from "node:assert/strict";
import { canonicalReply, compareReply } from "./canonical-reply.mjs";
import { canonicalRequestOptions } from "./canonical-request-options.mjs";
import { deepDiff } from "./harness.mjs";
import { makeModel } from "./models-shared.mjs";

const source = (changes = {}) => ({ api: "origin", provider: "origin", model: "origin", timestamp: 1, content: [{ type: "text", text: "hi" }], stopReason: "stop",
	usage: { input: 11, output: 5, cacheRead: 13, cacheWrite: 17, totalTokens: 123, cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 } }, ...changes });
const predict = (api, changes = {}, modelChanges = {}) => canonicalReply(api, source(changes), { ...makeModel(api, 1234), ...modelChanges });

test("Frozen response IDs and usage expectations do not depend on actual", () => {
	assert.equal(predict("openai-responses").responseId, "resp_mock");
	assert.equal(predict("anthropic-messages").responseId, "msg_mock");
	assert.equal(predict("mistral-conversations").responseId, "mock-mistral");
	assert.equal(predict("openai-completions").responseId, undefined);
	assert.equal(predict("openai-completions", { responseId: "id" }).responseId, "id");
	assert.equal(predict("openai-responses").usage.totalTokens, 123);
	assert.equal(predict("google-generative-ai").usage.totalTokens, 123);
	assert.equal(predict("openai-completions").usage.totalTokens, 46);
	assert.equal(predict("anthropic-messages").usage.totalTokens, 46);
});

test("Frozen Responses C23/C28: v1, no-call toolUse, missing/empty failed text and zero usage", () => {
	const out = predict("openai-responses", { content: [{ type: "text", text: "x", textSignature: "legacy" }], stopReason: "toolUse" });
	assert.equal(out.content[0].textSignature, '{"v":1,"id":"legacy"}');
	assert.equal(out.stopReason, "stop");
	assert.equal(out.rawStopReason, "completed");
	for (const [value, suffix] of [[undefined, "unknown error"], ["", "no message"], ["failure", "failure"]]) {
		const failed = predict("openai-responses", { stopReason: "error", errorMessage: value });
		assert.equal(failed.errorMessage, `server_error: ${suffix}`);
		assert.equal(failed.usage.totalTokens, 0);
		assert.equal(failed.usage.reasoning, undefined);
	}
	for (const value of ["pending", "aborted", "deferred"]) assert.throws(() => predict("openai-responses", { stopReason: value }), /rejects/);
});

test("Frozen OCC prefix matching also remaps reserved native stop values", () => {
	assert.equal(predict("openai-completions", { stopReason: "error", errorMessage: "Provider finish_reason: length" }).stopReason, "length");
	assert.equal(predict("openai-completions", { stopReason: "error", errorMessage: "noise Provider finish_reason: length" }).errorMessage, "Provider finish_reason: error");
	assert.equal(predict("openai-completions", { responseModel: "mock-gpt" }).responseModel, undefined);
	assert.equal(predict("openai-completions", { responseModel: "foreign" }).responseModel, "foreign");
	// pi-ai 1.4: a repeated tool-call id still merges into the FIRST block (id
	// lookup wins on the second delta), but finishBlock now parses strictly:
	// the concatenated arguments texts fail parseToolCallArguments and the call
	// lands as {} + argumentsError instead of the v1.2 lenient prefix parse.
	const duplicate = predict("openai-completions", { content: [
		{ type: "toolCall", id: "same", name: "first", arguments: { first: 1 } },
		{ type: "toolCall", id: "same", name: "second", arguments: { second: 2 } },
	] });
	assert.deepEqual(duplicate.content, [{ type: "toolCall", id: "same", name: "first",
		arguments: {},
		argumentsError: 'Unexpected non-whitespace character after JSON at position 11 (line 1 column 12)\n\nReceived arguments:\n{"first":1}{"second":2}' }]);
});

test("Frozen Google signatures are last nonempty; raw reason drives outcome, not source stop", () => {
	const out = predict("google-generative-ai", { content: [{ type: "text", text: "a", textSignature: "first" }, { type: "text", text: "b", textSignature: "" }, { type: "text", text: "c", textSignature: "last" }], stopReason: "error", rawStopReason: "STOP" });
	assert.deepEqual(out.content, [{ type: "text", text: "abc", textSignature: "last" }]);
	assert.equal(out.stopReason, "stop");
	assert.equal(out.errorMessage, undefined);
	assert.equal(predict("google-generative-ai", { stopReason: "deferred", rawStopReason: "MAX_TOKENS" }).stopReason, "length");
	assert.throws(() => predict("google-generative-ai", { stopReason: "error", rawStopReason: "UNKNOWN" }), /Unknown/);
});

test("Frozen Mistral C19/C20: R sanitize before empty filtering and existing stop projection", () => {
	const out = predict("mistral-conversations", { content: [{ type: "text", text: "\ud800" }, { type: "text", text: "a\udc00" }, { type: "text", text: "b" }], stopReason: "aborted" });
	assert.deepEqual(out.content, [{ type: "text", text: "ab" }]);
	assert.equal(out.stopReason, "error");
	assert.equal(out.rawStopReason, "abort");
	assert.equal(out.errorMessage, "Provider stopped with: abort");
	assert.equal(predict("mistral-conversations", { stopReason: "deferred" }).stopReason, "stop");
});

test("Frozen vendor cost uses highest exceeded tier; PM cost and total remain source values", () => {
	const cost = { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, tiers: [{ inputTokensAbove: 40, input: 5, output: 6, cacheRead: 7, cacheWrite: 8 }, { inputTokensAbove: 10, input: 2, output: 3, cacheRead: 4, cacheWrite: 5 }] };
	const out = predict("anthropic-messages", { usage: { ...source().usage, cacheWrite1h: 7 } }, { cost });
	assert.equal(out.usage.cost.input, (5 / 1e6) * 11);
	assert.equal(out.usage.cost.cacheWrite, (8 * 10 + 5 * 2 * 7) / 1e6);
	assert.deepEqual(predict("pi-messages").usage, source().usage);
});

test("Frozen pi-messages has exactly five legal terminal states and drops success error text", () => {
	for (const stopReason of ["stop", "length", "toolUse", "error", "aborted"]) {
		const out = predict("pi-messages", { stopReason, errorMessage: "original", providerThinkingLevel: "custom" });
		assert.equal(out.stopReason, stopReason);
		assert.equal(out.errorMessage, ["error", "aborted"].includes(stopReason) ? "original" : undefined);
		assert.equal(out.providerThinkingLevel, "custom");
	}
	for (const stopReason of ["pending", "deferred"]) assert.throws(() => predict("pi-messages", { stopReason }), /rejects/);
});

test("Comparator mutation checks expose ID, raw stop, total, cost and error corruption", () => {
	const expected = predict("openai-responses", { responseId: "independent" });
	const actual = { ...structuredClone(expected), timestamp: 150, durationMs: 2 };
	assert.deepEqual(compareReply(actual, expected, deepDiff, 100, 200), []);
	for (const mutate of [
		(value) => { value.responseId = "wrong"; }, (value) => { value.rawStopReason = "wrong"; },
		(value) => { value.usage.totalTokens++; }, (value) => { value.usage.cost.input++; }, (value) => { value.errorMessage = "wrong"; },
	]) { const changed = structuredClone(actual); mutate(changed); assert.ok(compareReply(changed, expected, deepDiff, 100, 200).length); }
});

test("Google ID comparator checks generated branches without ignoring deterministic IDs", () => {
	const content = [{ type: "toolCall", id: "fixed", name: "echo", arguments: {} }, { type: "toolCall", id: "fixed", name: "echo", arguments: {} }];
	const expected = predict("google-generative-ai", { model: "gemini-3-test", content });
	const actual = { ...structuredClone(expected), timestamp: 150 };
	actual.content[1].id = "echo_150_7";
	assert.deepEqual(compareReply(actual, expected, deepDiff, 100, 200), []);
	actual.content[0].id = "wrong";
	assert.ok(compareReply(actual, expected, deepDiff, 100, 200).some((diff) => diff.includes("expected \"fixed\"")));
	actual.content[0].id = "fixed";
	actual.content[1].id = "echo_99_7";
	assert.ok(compareReply(actual, expected, deepDiff, 100, 200).some((diff) => diff.includes("invalid pi-generated")));
});

test("Native maxTokens truthiness is protocol-specific, not an unconditional fixture 64", () => {
	for (const api of ["openai-completions", "openai-responses", "azure-openai-responses"]) assert.equal(canonicalRequestOptions(api, makeModel(api, 1), { maxTokens: 0 }).maxTokens, undefined);
	for (const api of ["google-generative-ai", "google-vertex", "mistral-conversations", "pi-messages", "bedrock-converse-stream"]) assert.equal(canonicalRequestOptions(api, makeModel(api, 1), { maxTokens: 0 }).maxTokens, 0);
	assert.equal(canonicalRequestOptions("openai-responses", makeModel("openai-responses", 1), { maxTokens: 1 }).maxTokens, 16);
});

test("Only OCC/Responses reasoning JSON is semantic; opaque and v1 text signatures are exact", () => {
	const first = '{"a":1,"b":2}';
	const second = '{"b":2,"a":1}';
	for (const api of ["openai-completions", "openai-responses"]) assert.deepEqual(deepDiff({ api, content: [{ thinkingSignature: first }] }, { api, content: [{ thinkingSignature: second }] }), []);
	for (const api of ["anthropic-messages", "google-generative-ai", "pi-messages"]) assert.ok(deepDiff({ api, content: [{ thinkingSignature: first }] }, { api, content: [{ thinkingSignature: second }] }).length);
	assert.ok(deepDiff({ api: "openai-responses", textSignature: first }, { api: "openai-responses", textSignature: second }).length);
});
