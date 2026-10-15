import assert from "node:assert/strict";
import test from "node:test";
import { APIS, rng, genContext, genReplyCase } from "./fuzz.mjs";
import { SHAPES, specialText, longText } from "./fuzz-expanded-shapes.mjs";
import { resolveTranscript, getSystemMessageText } from "./canonical-transcript.mjs";
import { classify } from "./fuzz-expand-report.mjs";

const ident = (api) => ({ api, provider: "duality", id: "mock-model" });
const generate = (api, seed) => {
	const random = rng(seed * 1000003 + APIS.indexOf(api));
	return [genContext(random, ident(api), seed), genReplyCase(random, ident(api), seed)];
};

test("fuzz ten protocols and 800 seeds retain deterministic balanced shapes", () => {
	assert.equal(APIS.length, 10);
	for (const api of APIS) {
		const counts = Object.fromEntries(SHAPES.map((shape) => [shape, 0]));
		for (let seed = 1; seed <= 800; seed++) {
			const [context, reply] = generate(api, seed);
			counts[context.shape]++;
			assert.equal(context.shape, reply.shape);
			assert.equal(reply.message.api, api);
			assert.ok(reply.message.content.every((block) => block.type !== "image"));
			if (seed <= 8) assert.deepEqual(generate(api, seed), [context, reply]);
		}
		assert.deepEqual(Object.values(counts), Array(8).fill(100));
	}
});

test("fuzz system replay source exercises overwrite/delete/remove/add in frozen order", () => {
	const [context] = generate("pi-messages", 2);
	const system = resolveTranscript(context).messages[0];
	assert.deepEqual(system.sections, { z: "new-z", fresh: specialText, remove: "restored" });
	assert.equal(system.toolsAdded.find((tool) => tool.name === "echo").description, "v3");
	assert.ok(!system.toolsAdded.some((tool) => ["retire", "fresh"].includes(tool.name)));
	assert.ok(getSystemMessageText(system).endsWith(`new-z\n\n${specialText}\n\nrestored`));
});

test("fuzz shape fixtures include visual blocks, 12 assistants, long/empty/unicode and large args", () => {
	const [images] = generate("bedrock-converse-stream", 1);
	assert.equal(images.messages.at(-1).content.filter((block) => block.type === "image").length, 2);
	const [deep] = generate("openai-responses", 3);
	assert.ok(deep.messages.filter((message) => message.role === "assistant").length >= 12);
	const [long, longReply] = generate("openai-completions", 4);
	assert.ok(longText(4).length >= 32768);
	assert.equal(long.messages.at(-1).content[0].text, longText(4));
	assert.equal(longReply.message.content.at(-1).text, longText(4));
	const [empty] = generate("anthropic-messages", 5);
	assert.equal(empty.messages.at(-1).content[0].text, "");
	assert.ok(specialText.includes("\u0000") && specialText.includes("🚀") && specialText.includes("e\u0301"));
	const [nested] = generate("bedrock-converse-stream", 7);
	const args = nested.messages.at(-2).content[0].arguments;
	let leaf = args;
	for (let depth = 7; depth >= 0; depth--) { assert.equal(leaf.depth, depth); assert.equal(leaf.items.length, 24); leaf = leaf.child; }
	assert.equal(leaf[""], "Bedrock Q removes this key");
	assert.ok(JSON.stringify(args).length > 5000);
});

test("fuzz mixed results pair every ID and deliberately alternate error/image shapes", () => {
	for (const api of APIS) {
		const [context] = generate(api, 8);
		const results = context.messages.slice(-4);
		assert.deepEqual(results.map((message) => message.isError), [false, true, false, true]);
		const calls = context.messages.at(-5);
		assert.deepEqual(results.map((message) => message.toolCallId), calls.content.map((call) => call.id));
		assert.ok(results.every((message) => message.content.some((block) => block.type === "image")));
		assert.equal(calls.model, ident(api).id);
	}
});

test("fuzz boundary classifier requires exact Codex no-capture UTF-8 mechanism", () => {
	const row = { api: "openai-codex-responses", captureCount: 0, ok: false, diffs: ["expected exactly 1 capture file, got 0; SDK: Request body didn't contain valid UTF-8"] };
	assert.equal(classify(row), "external-boundary");
	assert.equal(classify({ ...row, api: "openai-responses" }), "finding");
	assert.equal(classify({ ...row, captureCount: 1 }), "finding");
	assert.equal(classify({ ...row, diffs: ["fetch failed"] }), "finding");
	assert.equal(classify({ ...row, diffs: ["reasoning_content is not valid JSON"] }), "finding");
	assert.equal(classify({ ...row, ok: true, diffs: [] }), "green");
});

test("fuzz same-model Responses family signatures use reasoning item JSON", () => {
	for (const api of ["openai-responses", "azure-openai-responses", "openai-codex-responses"]) {
		for (let seed = 1; seed <= 50; seed++) {
			const [, reply] = generate(api, seed);
			for (const block of reply.message.content) {
				if (block.type === "thinking" && block.thinkingSignature) assert.equal(JSON.parse(block.thinkingSignature).type, "reasoning");
			}
		}
	}
});
