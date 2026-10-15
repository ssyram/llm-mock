import test from "node:test";
import assert from "node:assert/strict";
import { canonicalBedrock } from "./canonical-bedrock.mjs";
import { canonicalMistral } from "./canonical-mistral.mjs";
import { canonicalBedrockReasoning } from "./canonical-bedrock-reasoning.mjs";
import { canonicalReply } from "./canonical-reply.mjs";
import { deepDiff } from "./harness.mjs";
import { makeModel } from "./models-shared.mjs";
import { w08RequestCases } from "./w08-matrix-cases.mjs";

const image = { type: "image", data: "AQID", mimeType: "image/jpg" };
const result = { role: "toolResult", toolCallId: "call", toolName: "echo", isError: true, content: [image, { type: "text", text: "middle" }, image], timestamp: 1 };
const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

test("W07 Bedrock tool result images preserve wire order/bytes and normalize jpg", () => {
	const model = { ...makeModel("bedrock-converse-stream", 1234), input: ["text", "image"] };
	const before = structuredClone(result);
	const run = (content) => canonicalBedrock({ messages: [{ ...result, content }] }, model).context.messages[0];
	const decodedImage = { data: "AQID", mimeType: "image/jpeg" };
	assert.deepEqual(run(result.content).content, [decodedImage, { text: "middle" }, decodedImage]);
	assert.deepEqual(run([image]).content, [decodedImage]);
	assert.equal(run([image]).isError, true);
	assert.deepEqual(result, before);
});

test("W07 Mistral tool result emits aggregate error text then all images; isError remains false", () => {
	const model = { ...makeModel("mistral-conversations", 1234), input: ["text", "image"] };
	const run = (content, isError) => canonicalMistral({ messages: [{ ...result, content, isError }] }, model).context.messages[0];
	const decodedImage = { data: "AQID", mimeType: "image/jpg" };
	assert.deepEqual(run(result.content, true).content, [{ text: "[tool error] middle" }, decodedImage, decodedImage]);
	assert.deepEqual(run([image], false).content, [{ text: "(see attached image)" }, decodedImage]);
	assert.equal(run([image], true).isError, false);
});

test("W07 Mistral tools attach to existing/synthesized System without losing strict schema/order", () => {
	const model = makeModel("mistral-conversations", 1234);
	const tools = ["z", "a"].map((name) => ({ name, description: name, parameters: { type: "object", properties: { x: { type: "string" } } }, constrainedSampling: { type: "json_schema", strict: "prefer" } }));
	for (const messages of [[], [{ role: "user", content: "go" }], [{ role: "system", content: "guide" }]]) {
		const out = canonicalMistral({ tools, messages }, model).context.messages;
		assert.equal(out[0].role, "system");
		assert.deepEqual(out[0].toolsAdded.map((tool) => tool.name), ["z", "a"]);
		assert.deepEqual(out[0].toolsAdded[0].parameters, { type: "object", properties: { x: { anyOf: [{ type: "string" }, { type: "null" }] } }, required: ["x"], additionalProperties: false });
	}
	assert.deepEqual(canonicalMistral({ messages: [] }, model).context.messages, []);
});

test("W07 Bedrock reasoning always uses full envelope; missing/empty is absent", () => {
	const model = makeModel("bedrock-converse-stream", 1234);
	const expected = [
		{ thinking: { type: "enabled", budget_tokens: 2048, display: "summarized" } },
		{ thinking: { type: "enabled", budget_tokens: 4096, display: "summarized" }, anthropic_beta: ["interleaved-thinking-2025-05-14"] },
		{ thinking: { type: "adaptive", display: "summarized", block_binding: { prefix_mismatch_behavior: "drop_block" } }, output_config: { effort: "xhigh" }, anthropic_beta: ["thinking-binding-controls-2026-08-01"] },
		{ thinking: { type: "adaptive", display: "summarized" }, output_config: { effort: "high" } },
		{ thinking: { type: "adaptive" }, output_config: { effort: "high" } },
		{ reasoning_effort: "high" }, { reasoning: { effort: "xhigh" } }, undefined,
	];
	for (const [index, tc] of w08RequestCases(model).entries()) {
		const out = canonicalBedrock(tc, { ...model, ...tc.modelOverrides }, tc.options).options;
		assert.deepEqual(out.reasoning === undefined ? undefined : JSON.parse(out.reasoning), expected[index]);
	}
	assert.equal(canonicalBedrockReasoning(model, { reasoning: "high" }), undefined);
	assert.equal(canonicalBedrockReasoning({ ...model, reasoning: true }, {}), undefined);
});

test("Bedrock envelope comparison ignores key order, not missing/changed extension values", () => {
	const compare = (actual, expected) => deepDiff({ options: { reasoning: JSON.stringify(actual) } }, { options: { reasoning: JSON.stringify(expected) } }, [], "$", [], "bedrock-converse-stream");
	const expected = { thinking: { type: "adaptive" }, output_config: { effort: "high" } };
	assert.deepEqual(compare({ output_config: { effort: "high" }, thinking: { type: "adaptive" } }, expected), []);
	assert.ok(compare({ thinking: { type: "adaptive" } }, expected).length);
	assert.ok(compare({ ...expected, output_config: { effort: "low" } }, expected).length);
	assert.ok(deepDiff({ arguments: { reasoning: '{"b":2,"a":1}' } }, { arguments: { reasoning: '{"a":1,"b":2}' } }, [], "$", [], "bedrock-converse-stream").length);
});

test("W07 Codex canonical retains bool/None only on completed/incomplete, not failed or siblings", () => {
	for (const api of ["openai-codex-responses", "openai-responses", "azure-openai-responses"]) {
		const model = makeModel(api, 1234);
		for (const stopReason of ["stop", "length", "toolUse", "error"]) for (const endTurn of [undefined, true, false]) {
			const out = canonicalReply(api, { content: [], model: model.id, usage: structuredClone(zero), stopReason, endTurn }, model);
			assert.equal(out.endTurn, api === "openai-codex-responses" && stopReason !== "error" ? endTurn : undefined);
		}
	}
});
