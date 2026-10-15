import test from "node:test";
import assert from "node:assert/strict";
import { projectEncodeThinking } from "./canonical-encode-thinking.mjs";
import { canonicalReply } from "./canonical-reply.mjs";
import { makeModel } from "./models-shared.mjs";
import { replyCases } from "./corpus-replies.mjs";
import { tm, ores, am, gai } from "./pi-ai-imports.mjs";

const responses = ["openai-responses", "azure-openai-responses", "openai-codex-responses"];
const native = ["anthropic-messages", "google-generative-ai", "google-vertex", "bedrock-converse-stream", "pi-messages"];
const thinking = (text, sig, redacted) => ({ type: "thinking", thinking: text, thinkingSignature: sig, ...(redacted ? { redacted } : {}) });

test("encode thinking: target domains downgrade opaque to text, never fabricated reasoning", () => {
	for (const api of [...responses, "openai-completions", "mistral-conversations"]) {
		const input = [thinking(" reason ", "opaque"), thinking(" \n", "opaque"), thinking("\ufeff", "opaque"), thinking("\u0085", "opaque"), thinking("secret", "opaque", true)];
		const original = structuredClone(input);
		const output = projectEncodeThinking(api, input);
		assert.deepEqual(output, [{ type: "text", text: " reason " }, { type: "text", text: "\u0085" }]);
		assert.deepEqual(input, original);
		assert.deepEqual(projectEncodeThinking(api, output), output);
	}
	for (const api of native) {
		const content = [thinking("reason", "opaque"), thinking("", "opaque", true)];
		assert.deepEqual(projectEncodeThinking(api, content), content);
	}
});

test("encode thinking: native reasoning JSON and OCC carriers survive, absent signatures unchanged", () => {
	const signed = thinking("", JSON.stringify({ type: "reasoning", encrypted_content: "encrypted", summary: [] }));
	for (const api of responses) {
		assert.deepEqual(projectEncodeThinking(api, [signed]), [signed]);
		for (const sig of ["opaque", "null", "[]", '{"type":"message"}', ""]) {
			assert.deepEqual(projectEncodeThinking(api, [thinking("reason", sig)]), [{ type: "text", text: "reason" }]);
		}
	}
	for (const sig of ["reasoning_content", "reasoning", "reasoning_text", "[]", '[{"type":"reasoning.text","text":"r"}]']) {
		const block = thinking("reason", sig);
		assert.deepEqual(projectEncodeThinking("openai-completions", [block]), [block]);
	}
	for (const api of [...responses, ...native, "openai-completions", "mistral-conversations"]) {
		const unsigned = { type: "thinking", thinking: "unsigned" };
		assert.deepEqual(projectEncodeThinking(api, [unsigned]), [unsigned]);
	}
});

test("Responses providerFill assigns text signatures at projected indices without reading actual", () => {
	for (const api of responses) {
		const model = makeModel(api, 1234);
		const message = replyCases({ api, provider: model.provider, id: model.id })[0].message;
		message.content = [thinking("", "opaque", true), thinking("reason", "opaque"), { type: "text", text: "answer" }];
		const original = structuredClone(message);
		const output = canonicalReply(api, message, model);
		assert.deepEqual(output.content, [
			{ type: "text", text: "reason", textSignature: '{"v":1,"id":"msg_0"}' },
			{ type: "text", text: "answer", textSignature: '{"v":1,"id":"msg_1"}' },
		]);
		assert.deepEqual(message, original);
	}
});

test("locked pi TM and Responses/Anthropic/Google converters emit cross-source thinking as plain text", async () => {
	for (const [api, provider] of [["openai-responses", ores], ["anthropic-messages", am], ["google-generative-ai", gai]]) {
		const model = makeModel(api, 1234);
		const message = { role: "assistant", api: "foreign", provider: "foreign", model: "foreign", stopReason: "stop", timestamp: 0,
			content: [thinking("reason", "opaque"), thinking("", "opaque"), thinking("secret", "opaque", true)] };
		assert.deepEqual(tm.transformMessages([message], model)[0].content, [{ type: "text", text: "reason" }]);
		let wire;
		await provider.stream(model, { messages: [message] }, { apiKey: "test", onPayload(payload) { wire = payload; throw new Error("captured before transport"); } }).result();
		if (api === "openai-responses") assert.deepEqual(wire.input[0].content, [{ type: "output_text", text: "reason", annotations: [] }]);
		else if (api === "anthropic-messages") assert.deepEqual(wire.messages[0].content, [{ type: "text", text: "reason" }]);
		else assert.deepEqual(wire.contents[0].parts, [{ text: "reason" }]);
	}
});
