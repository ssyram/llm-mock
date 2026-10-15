import test from "node:test";
import assert from "node:assert/strict";
import { canonicalOcc } from "./canonical-occ.mjs";
import { canonicalOres } from "./canonical-ores.mjs";
import { canonicalAm } from "./canonical-am.mjs";
import { canonicalGai } from "./canonical-gai.mjs";
import { canonicalBedrock } from "./canonical-bedrock.mjs";
import { canonicalMistral } from "./canonical-mistral.mjs";
import { normalizeContext, resolveTranscript, getSystemMessageText } from "./canonical-transcript.mjs";
import { transformMessages } from "./canonical-transform-messages.mjs";
import { strictSchema, resolveJsonSchemaStrictSampling } from "./canonical-strict-schema.mjs";
import { makeModel } from "./models-shared.mjs";
import { sanitize } from "./canonical-sanitize.mjs";

const assistant = (model, content) => ({ role: "assistant", api: model.api, provider: model.provider, model: model.id, content, stopReason: "stop", timestamp: 1 });
const run = (canonical, model, content) => canonical({ messages: [assistant(model, content)] }, model).context.messages;

test("Frozen G1: section patches and remove/readd order are replayed independently", () => {
	const tool = (name) => ({ name, parameters: { type: "object" } });
	const out = resolveTranscript(normalizeContext({ systemPrompt: "start", messages: [
		{ role: "system", content: [{ type: "text", text: "one" }, { type: "text", text: "two" }], sections: { z: "Z", a: "A" }, toolsAdded: [tool("x"), tool("y")] },
		{ role: "system", content: "end", sections: { z: null, a: "AA", b: "B" }, toolsRemoved: [{ name: "x" }], toolsAdded: [tool("x")] },
	] }));
	assert.equal(getSystemMessageText(out.messages[0]), "start\n\none\ntwo\n\nend\n\nAA\n\nB");
	assert.deepEqual(out.messages[0].toolsAdded.map((tool) => tool.name), ["y", "x"]);
});

test("Frozen G2: sameModel gate, image deduplication and synthesized results", () => {
	const model = makeModel("mistral-conversations", 1234);
	const message = assistant({ ...model, id: "foreign" }, [{ type: "thinking", thinking: "reason" }, { type: "toolCall", id: "x!", name: "echo", arguments: {} }]);
	const out = transformMessages([message, { role: "user", content: [{ type: "image" }, { type: "image" }] }], model, () => "normalized");
	assert.deepEqual(out[0].content[0], { type: "text", text: "reason" });
	assert.equal(out[1].toolCallId, "normalized");
	assert.equal(out[1].content[0].text, "No result provided");
	assert.deepEqual(out[2].content, [{ type: "text", text: "(image omitted: model does not support images)" }]);
	assert.equal(transformMessages([assistant(model, [{ type: "toolCall", id: "x!", name: "echo", arguments: {} }])], model, () => "wrong")[0].content[0].id, "x!");
});

test("Frozen surrogate rule deletes only unpaired units; Mistral Q trim precedes cleaning", () => {
	assert.equal(sanitize("a\ud800b\udc00c😀"), "abc😀");
	const model = makeModel("mistral-conversations", 1234);
	assert.deepEqual(run(canonicalMistral, model, [{ type: "text", text: "\ud800" }, { type: "text", text: " " }, { type: "text", text: "ok" }])[0].content,
		[{ type: "text", text: "" }, { type: "text", text: "ok" }]);
});

test("Frozen OCC C7: opaque is absent, first complete details wins, empty signed thinking is considered", () => {
	const model = makeModel("openai-completions", 1234);
	const first = [{ type: "reasoning.text", text: "first" }];
	const second = [{ type: "reasoning.text", text: "second" }];
	const out = run(canonicalOcc, model, [
		{ type: "thinking", thinking: "", thinkingSignature: JSON.stringify(first) },
		{ type: "thinking", thinking: "visible", thinkingSignature: JSON.stringify(second) }, { type: "text", text: "kept" },
	])[0].content;
	assert.equal(out[0].thinking, "");
	assert.deepEqual(JSON.parse(out[0].thinkingSignature), first);
	assert.deepEqual(run(canonicalOcc, model, [{ type: "thinking", thinking: "secret", thinkingSignature: "opaque" }, { type: "text", text: "kept" }])[0].content, [{ type: "text", text: "kept" }]);
});

test("Frozen Responses C05: invalid JSON rejects; phase and namespace survive sameModel", () => {
	const model = makeModel("openai-responses", 1234);
	assert.throws(() => run(canonicalOres, model, [{ type: "thinking", thinking: "x", thinkingSignature: "not-json" }]), SyntaxError);
	const out = run(canonicalOres, model, [{ type: "text", text: "x", textSignature: '{"v":1,"id":"id","phase":"commentary"}' },
		{ type: "toolCall", id: "call|fc_item", name: "echo", arguments: {}, namespace: "space" }])[0].content;
	assert.deepEqual(JSON.parse(out[0].textSignature), { v: 1, id: "id", phase: "commentary" });
	assert.equal(out[1].namespace, "space");
	assert.equal(out[1].id, "call|fc_item");
});

test("Frozen Google G18: all three signed empty/call carriers survive", () => {
	const model = makeModel("google-generative-ai", 1234);
	const content = [{ type: "text", text: "", textSignature: "AQID" }, { type: "thinking", thinking: "", thinkingSignature: "AQID" },
		{ type: "toolCall", id: "not-sent", name: "echo", arguments: {}, thoughtSignature: "AQID" }];
	const out = run(canonicalGai, model, content)[0].content;
	assert.equal(out[0].textSignature, "AQID");
	assert.equal(out[1].thinkingSignature, "AQID");
	assert.equal(out[2].thoughtSignature, "AQID");
	assert.equal(out[2].id, "echo");
});

test("Frozen Anthropic C08: every error image is replaced in place; image-only has a prefix", () => {
	const model = { ...makeModel("anthropic-messages", 1234), input: ["text", "image"] };
	const call = { type: "toolCall", id: "call", name: "echo", arguments: {} };
	const image = { type: "image", data: "AQID", mimeType: "image/png" };
	const result = { role: "toolResult", toolCallId: "call", toolName: "ignored", content: [image, { type: "text", text: "middle" }, image], isError: true };
	const canonical = (value) => canonicalAm({ messages: [assistant(model, [call]), value] }, model).context.messages[1];
	const note = "[image omitted: error tool results cannot contain images]";
	assert.equal(canonical(result).content[0].text, `${note}\nmiddle\n${note}`);
	assert.equal(canonical({ ...result, content: [image], isError: false }).content[0].text, "(see attached image)");
	assert.throws(() => canonicalAm({ messages: [result] }, model), /unpaired/);
});

test("Frozen Bedrock: Q redacted is empty, bad payload drops, Claude name gate preserves signature", () => {
	const model = { ...makeModel("bedrock-converse-stream", 1234), id: "application-profile", name: "Anthropic Claude" };
	const out = run(canonicalBedrock, model, [{ type: "thinking", thinking: "opaque", redacted: true, thinkingSignature: "AQID" },
		{ type: "thinking", thinking: "bad", redacted: true, thinkingSignature: "!!!" }, { type: "thinking", thinking: "visible", thinkingSignature: "sig" }])[0].content;
	assert.equal(out.length, 2);
	assert.equal(out[0].thinking, "");
	assert.equal(out[1].thinkingSignature, "sig");
});

test("Frozen strict domain: nullable optionals, required keys, rejected schemas and require/prefer", () => {
	const schema = { type: "object", properties: { optional: { type: "string" }, required: { type: "number" } }, required: ["required"] };
	const original = structuredClone(schema);
	const out = strictSchema(schema);
	assert.deepEqual(out.required, ["optional", "required"]);
	assert.deepEqual(out.properties.optional, { anyOf: [{ type: "string" }, { type: "null" }] });
	assert.equal(out.additionalProperties, false);
	assert.deepEqual(schema, original);
	for (const key of ["$ref", "$defs", "definitions", "allOf", "oneOf", "not", "if", "then", "else", "contains", "prefixItems"]) assert.throws(() => strictSchema({ type: "object", [key]: {} }));
	for (const invalid of [{ type: "array" }, { type: "object", required: ["missing"] }, { type: "object", anyOf: [] }, { type: "object", items: [] }]) assert.throws(() => strictSchema(invalid));
	assert.throws(() => resolveJsonSchemaStrictSampling({ parameters: schema, constrainedSampling: { type: "json_schema", strict: "require" } }, false));
	assert.equal(resolveJsonSchemaStrictSampling({ parameters: schema, constrainedSampling: { type: "json_schema", strict: "prefer" } }, false), undefined);
});
