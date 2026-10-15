import test from "node:test";
import assert from "node:assert/strict";
import { canonicalAm } from "./canonical-am.mjs";
import { canonicalMistral } from "./canonical-mistral.mjs";
import { canonicalGai } from "./canonical-gai.mjs";
import { canonicalVertex } from "./canonical-family-variants.mjs";
import { canonicalOresThinking } from "./canonical-ores.mjs";
import { projectEncodeThinking } from "./canonical-encode-thinking.mjs";
import { fillMistral } from "./canonical-reply-additional.mjs";
import { fillBedrock } from "./canonical-bedrock-reply.mjs";
import { makeModel } from "./models-shared.mjs";
import { additionalContexts, additionalReplies } from "./extended-matrix-cases.mjs";

test("Anthropic legacy tools project schema metadata without changing the input", () => {
	const model = makeModel("anthropic-messages", 1234);
	const context = additionalContexts(model)[1];
	const original = structuredClone(context);
	const schema = canonicalAm(context, model).context.messages[0].toolsAdded[0].parameters;
	assert.deepEqual(schema, { type: "object", properties: { text: { type: "string" } }, required: ["text"] });
	assert.deepEqual(context, original);
	for (const [api, canonical] of [["google-generative-ai", canonicalGai], ["google-vertex", canonicalVertex]]) {
		const google = makeModel(api, 1234);
		assert.equal(canonical(context, google).context.messages[0].toolsAdded[0].parameters.$comment, "schema metadata");
	}
});

test("Responses item parser rejects unprojected signatures; encode projection handles foreign domains first", () => {
	assert.throws(() => canonicalOresThinking({ thinking: "delta", thinkingSignature: "reasoning_content" }, 1), SyntaxError);
	assert.throws(() => canonicalOresThinking({ thinking: "delta", thinkingSignature: '{"type":"message"}' }, 1), /must be a reasoning-item JSON/);
	const item = { type: "reasoning", id: "rs", summary: [] };
	assert.deepEqual(canonicalOresThinking({ thinking: "delta", thinkingSignature: JSON.stringify(item) }, 1),
		{ thinking: "delta", thinkingSignature: JSON.stringify(item) });
	assert.equal(canonicalOresThinking({ thinking: "", thinkingSignature: JSON.stringify(item) }, 1).thinking, "");
});

test("Mistral drops only unsupported write count and signatures, preserving cache read/input", () => {
	const out = { content: [{ type: "thinking", thinking: "reason", thinkingSignature: "opaque" }], stopReason: "stop",
		usage: { input: 11, output: 5, cacheRead: 13, cacheWrite: 17, cacheWrite1h: 7, reasoning: 2 } };
	out.content = projectEncodeThinking("mistral-conversations", out.content);
	fillMistral(out);
	assert.deepEqual(out.usage, { input: 11, output: 5, cacheRead: 13, cacheWrite: 0 });
	assert.deepEqual(out.content, [{ type: "text", text: "reason" }]);
});

test("Bedrock metadata cannot represent responseId/reasoning but retains cache read/write/1h", () => {
	const out = { content: [{ type: "thinking", thinking: "reason", thinkingSignature: "opaque" }], responseId: "foreign",
		stopReason: "error", errorMessage: "foreign error", usage: { input: 11, output: 5, cacheRead: 13, cacheWrite: 17, cacheWrite1h: 7, reasoning: 2 } };
	fillBedrock(out);
	assert.equal(out.responseId, undefined);
	assert.equal(out.errorMessage, "Provider stopped with: guardrail_intervened");
	assert.deepEqual(out.usage, { input: 11, output: 5, cacheRead: 13, cacheWrite: 17, cacheWrite1h: 7 });
	assert.equal(out.content[0].thinkingSignature, "opaque");
});

test("Mistral request canonical preserves individual text/thinking chunks in wire order", () => {
	const model = makeModel("mistral-conversations", 1234);
	const content = [
		{ type: "text", text: "before" }, { type: "thinking", thinking: "first", thinkingSignature: "opaque" },
		{ type: "thinking", thinking: "second" }, { type: "text", text: "after-one" },
		{ type: "text", text: "after-two" }, { type: "text", text: " " },
	];
	const context = { messages: [{ role: "assistant", api: model.api, provider: model.provider,
		model: model.id, content, stopReason: "stop", timestamp: 1 }] };
	const original = structuredClone(context);
	const output = canonicalMistral(context, model).context.messages[0].content;
	assert.deepEqual(output, [
		{ type: "text", text: "before" }, { type: "thinking", thinking: "first" },
		{ type: "thinking", thinking: "second" }, { type: "text", text: "after-one" }, { type: "text", text: "after-two" },
	]);
	assert.deepEqual(context, original);
});

test("All ten APIs keep nonzero cache fixtures, including unavailable Codex", () => {
	const apis = ["openai-completions", "openai-responses", "azure-openai-responses", "openai-codex-responses",
		"anthropic-messages", "google-generative-ai", "google-vertex", "bedrock-converse-stream", "mistral-conversations", "pi-messages"];
	for (const api of apis) {
		const base = { content: [{ type: "text", text: "cache" }] };
		const original = structuredClone(base);
		const tc = additionalReplies(makeModel(api, 1234), base)[0];
		assert.equal(tc.name, "reply-nonzero-cache-usage");
		assert.equal(tc.message.usage.input, 11);
		assert.equal(tc.message.usage.cacheRead, 13);
		assert.equal(tc.message.usage.cacheWrite, 17);
		assert.equal(tc.message.usage.cacheWrite1h, 7);
		assert.deepEqual(base, original);
	}
});
