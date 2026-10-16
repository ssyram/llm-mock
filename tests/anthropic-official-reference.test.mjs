import test from "node:test";
import assert from "node:assert/strict";
import { am, piAi } from "./pi-ai-imports.mjs";
import { canonicalAm } from "./canonical-am.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { startServer, withCapture } from "./harness.mjs";

const image = { type: "image", data: "AQID", mimeType: "image/png" };
const wireImage = { type: "image", source: { type: "base64", data: "AQID", media_type: "image/png" } };
const decodedImage = { data: "AQID", mimeType: "image/png" };
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

test("official Anthropic converter, Rust decoder and canonical preserve error-result image order", async () => {
	const server = await startServer(0);
	try {
		for (const isError of [false, true]) {
			for (const imageOnly of [false, true]) {
				const model = { ...makeModel("anthropic-messages", server.port), input: ["text", "image"] };
				const context = { messages: [
					{ role: "assistant", api: model.api, provider: model.provider, model: model.id,
						content: [{ type: "toolCall", id: "call", name: "echo", arguments: {} }], usage, stopReason: "toolUse", timestamp: 1 },
					{ role: "toolResult", toolCallId: "call", toolName: "echo", content: imageOnly ? [image] : [image, { type: "text", text: "middle" }, image], isError, timestamp: 2 },
				] };
				let payload;
				const { record } = await withCapture(server, () => am.stream(model, piAi.normalizeContext(context), {
					...streamOptions(model.api), signal: AbortSignal.timeout(5000), onPayload: (value) => { payload = structuredClone(value); },
				}).result());
				const expectedWire = imageOnly ? [{ type: "text", text: "(see attached image)" }, wireImage]
					: [wireImage, { type: "text", text: "middle" }, wireImage];
				const expectedDecoded = imageOnly ? [{ text: "(see attached image)" }, decodedImage]
					: [decodedImage, { text: "middle" }, decodedImage];
				const result = payload.messages[1].content[0];
				assert.equal(result.type, "tool_result");
				assert.equal(result.is_error, isError);
				assert.deepEqual(result.content, expectedWire);
				assert.equal(record.request.context.messages[1].isError, isError);
				assert.deepEqual(record.request.context.messages[1].content, expectedDecoded);
				assert.deepEqual(canonicalAm(context, model, streamOptions(model.api)).context.messages[1].content, expectedDecoded);
			}
		}
	} finally { await server.stop(); }
});
