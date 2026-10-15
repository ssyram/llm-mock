import test from "node:test";
import assert from "node:assert/strict";
import { PROTOCOLS } from "./protocol-matrix.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { STREAMERS } from "./matrix-lib.mjs";
import { canonicalPiMessages } from "./canonical-pi-messages.mjs";
import { canonicalAzure, canonicalCodex, canonicalVertex } from "./canonical-family-variants.mjs";
import { canonicalBedrock } from "./canonical-bedrock.mjs";
import { canonicalMistral } from "./canonical-mistral.mjs";
import { additionalContexts } from "./extended-matrix-cases.mjs";

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const assistant = (model) => ({ role: "assistant", api: model.api, provider: model.provider, model: model.id,
	content: [{ type: "text", text: "hello" }], usage: structuredClone(usage), stopReason: "stop", timestamp: 17 });

test("all ten protocols have explicit models, streamers and canonicals", () => {
	assert.equal(new Set(PROTOCOLS.map((p) => p.api)).size, 10);
	for (const protocol of PROTOCOLS) {
		assert.equal(typeof STREAMERS[protocol.api], "function");
		const model = makeModel(protocol.api, 1234);
		assert.match(model.baseUrl, /^http:\/\/127\.0\.0\.1:1234/);
		assert.equal(typeof protocol.canonical, "function");
	}
	assert.throws(() => makeModel("unknown", 1234), /unknown API/);
	assert.equal(makeModel("azure-openai-responses", 1234).baseUrl, "http://127.0.0.1:1234/openai/v1");
	assert.equal(makeModel("google-vertex", 1234).baseUrl, "http://127.0.0.1:1234/v1");
	assert.equal(makeModel("mistral-conversations", 1234).baseUrl, "http://127.0.0.1:1234");
	assert.equal(streamOptions("bedrock-converse-stream").env.AWS_BEDROCK_FORCE_HTTP1, "1");
	assert.equal(streamOptions("openai-codex-responses").transport, "sse");
});

test("Responses variants retag identity and Codex defaults instructions without an output budget", () => {
	const azure = makeModel("azure-openai-responses", 1234);
	const decoded = canonicalAzure({ messages: [assistant(azure)] }, azure);
	assert.equal(decoded.context.messages[0].api, azure.api);
	assert.equal(decoded.context.messages[0].provider, "azure");
	const codex = makeModel("openai-codex-responses", 1234);
	const output = canonicalCodex({ messages: [assistant(codex)] }, codex);
	assert.equal(output.context.messages[0].content, "You are a helpful assistant.");
	assert.equal(output.context.messages[1].provider, "openai-codex");
	assert.equal(output.options.maxTokens, undefined);
	assert.equal(output.options.toolChoice, "auto");
});

test("Azure constrained-sampling schema is strict without changing the context", () => {
	const model = makeModel("azure-openai-responses", 1234);
	const context = { messages: [{ role: "system", content: "tools", timestamp: 1, toolsAdded: [{
		name: "echo", description: "Echo", parameters: { type: "object", properties: { text: { type: "string" } } },
		constrainedSampling: { type: "json_schema", strict: "prefer" },
	}] }] };
	const saved = structuredClone(context);
	const schema = canonicalAzure(context, model).context.messages[0].toolsAdded[0].parameters;
	assert.deepEqual(schema.required, ["text"]);
	assert.equal(schema.additionalProperties, false);
	assert.deepEqual(schema.properties.text, { anyOf: [{ type: "string" }, { type: "null" }] });
	assert.deepEqual(context, saved);
});

test("Vertex retags Google identity and retains full JSON schema metadata", () => {
	const model = makeModel("google-vertex", 1234);
	const output = canonicalVertex(additionalContexts(model)[1], model);
	assert.equal(output.context.messages[0].toolsAdded[0].parameters.$schema, "https://json-schema.org/draft/2020-12/schema");
	assert.equal(output.context.messages[0].toolsAdded[0].parameters.$comment, "schema metadata");
	const reply = canonicalVertex({ messages: [assistant(model)] }, model);
	assert.equal(reply.context.messages[0].api, "google-vertex");
	assert.equal(reply.context.messages[0].provider, "");
});

test("pi-messages preserves errors, orphan calls, metadata, timestamps and empty blocks", () => {
	const model = makeModel("pi-messages", 1234);
	const context = additionalContexts(model).at(-1);
	const saved = structuredClone(context);
	const output = canonicalPiMessages(context, model);
	assert.deepEqual(context, saved);
	assert.equal(output.context.messages.length, 5);
	const historical = output.context.messages[2];
	assert.equal(historical.timestamp, 43);
	assert.equal(historical.stopReason, "error");
	assert.equal(historical.content[2].id, "unaltered|call!?");
	assert.equal(historical.content[0].redacted, false);
	assert.equal(historical.content[1].text, "");
	assert.deepEqual(historical.usage, context.messages[2].usage);
	assert.equal(historical.diagnostics, undefined);
	assert.equal(output.context.messages[4].details, undefined);
	assert.deepEqual(output.context.messages[0].sections, { z: "last", a: "first", removed: null });
});

test("Bedrock empty user placeholder and Mistral thinking canonical are explicit", () => {
	const model = makeModel("bedrock-converse-stream", 1234);
	const output = canonicalBedrock({ messages: [{ role: "user", content: [], timestamp: 7 }] }, model);
	assert.equal(output.context.messages[0].content, "<empty>");
	const mistral = makeModel("mistral-conversations", 1234);
	const message = assistant(mistral);
	message.content.unshift({ type: "thinking", thinking: "reason", thinkingSignature: "opaque" });
	const decoded = canonicalMistral({ messages: [message] }, mistral);
	assert.deepEqual(decoded.context.messages[0].content[0], { type: "thinking", thinking: "reason" });
});
