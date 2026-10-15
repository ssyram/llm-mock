import test from "node:test";
import assert from "node:assert/strict";
import { decodedContext } from "./property-context.mjs";
import { parseFrames, captureReply } from "./property-transport.mjs";
import { deepDiff, freePort, startServer } from "./harness.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { replyCases } from "./corpus.mjs";

test("decodedContext restores only lossless Rust/TS block discriminants", () => {
	const request = { context: { messages: [
		{ role: "system", content: [{ text: "system" }], timestamp: 0 },
		{ role: "user", content: [{ text: "" }, { data: "AQID", mimeType: "image/png" }], timestamp: 0 },
		{ role: "toolResult", content: [{ text: "result" }], toolCallId: "call|item", isError: true, timestamp: 0 },
		{ role: "assistant", api: "google-generative-ai", provider: "", model: "", content: [{ type: "thinking", thinking: "t", thinkingSignature: "AQID" }], timestamp: 0 },
	] } };
	const before = structuredClone(request);
	const context = decodedContext(request);
	assert.deepEqual(context.messages.slice(0, 3).map((m) => m.content.map((b) => b.type)), [["text"], ["text", "image"], ["text"]]);
	assert.deepEqual(context.messages[3], request.context.messages[3]);
	assert.equal(context.messages[2].toolCallId, "call|item");
	assert.deepEqual(request, before);
});

test("parseFrames compares JSON values, not object key order or CRLF", () => {
	const first = parseFrames('event: item\r\ndata: {"b":2,"a":1}\r\n\r\ndata: [DONE]\r\n\r\n');
	const second = parseFrames('event: item\ndata: {"a":1,"b":2}\n\ndata: [DONE]\n\n');
	assert.deepEqual(first, second);
});

test("frame assertions reject reordering, dropped empty blocks and changed metadata", () => {
	const frames = parseFrames('event: one\ndata: {"text":""}\n\nevent: two\ndata: {"text":"next"}\n\n');
	assert.ok(deepDiff([...frames].reverse(), frames).length);
	assert.ok(deepDiff(frames.slice(1), frames).length);
	assert.ok(deepDiff([{ ...frames[0], metadata: ["event: wrong"] }, frames[1]], frames).length);
});

test("request assertions do not hide identity, ID, usage or signature drift", () => {
	const expected = { api: "google-generative-ai", provider: "", model: "", usage: { input: 0 },
		content: [{ type: "toolCall", id: "call|item", thoughtSignature: "AQID" }] };
	for (const mutate of [
		(a) => { a.provider = "duality"; },
		(a) => { a.content[0].id = "call"; },
		(a) => { a.usage.input = 1; },
		(a) => { delete a.content[0].thoughtSignature; },
	]) {
		const actual = structuredClone(expected);
		mutate(actual);
		assert.ok(deepDiff(actual, expected, [], "$", [], expected.api).length);
	}
});

test("captureReply retains failed Responses frames before SDK stops reading", async () => {
	const port = await freePort();
	const server = await startServer(port);
	try {
		const api = "openai-responses";
		const model = makeModel(api, port);
		const message = replyCases({ api, provider: model.provider, id: model.id })[0].message;
		Object.assign(message, { stopReason: "error", errorMessage: "failed" });
		const got = await captureReply(api, model, streamOptions(api), server, message);
		assert.equal(got.parsed.stopReason, "error");
		assert.equal(got.parsed.errorMessage, "server_error: failed");
		assert.equal(got.frames.at(-1).data.type, "response.failed");
		assert.equal(got.frames.at(-1).data.response.error.message, "failed");
	} finally {
		await server.stop();
	}
});

test("JSON-valued thinking signatures compare semantically only for frozen families", () => {
	const a = { content: [{ thinkingSignature: '{"b":2,"a":1}' }] };
	const b = { content: [{ thinkingSignature: '{"a":1,"b":2}' }] };
	assert.deepEqual(deepDiff(a, b, [], "$", [], "openai-responses"), []);
	assert.ok(deepDiff(a, b, [], "$", [], "anthropic-messages").length);
});
