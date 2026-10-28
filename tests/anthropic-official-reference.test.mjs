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

test("pi-ai 1.4 error-result image split: placeholder content, images after tool results (#10794)", async () => {
	const server = await startServer(0);
	try {
		const caption = "Images from the error result of tool call call (echo):";
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
				const userContent = payload.messages[1].content;
				const result = userContent[0];
				assert.equal(result.type, "tool_result");
				assert.equal(result.is_error, isError);
				if (!isError) {
					// Non-error results keep images inline (v1.2 semantics unchanged).
					const expectedWire = imageOnly ? [{ type: "text", text: "(see attached image)" }, wireImage]
						: [wireImage, { type: "text", text: "middle" }, wireImage];
					const expectedDecoded = imageOnly ? [{ text: "(see attached image)" }, decodedImage]
						: [decodedImage, { text: "middle" }, decodedImage];
					assert.deepEqual(result.content, expectedWire);
					assert.equal(userContent.length, 1);
					assert.equal(record.request.context.messages[1].isError, false);
					assert.deepEqual(record.request.context.messages[1].content, expectedDecoded);
					assert.deepEqual(canonicalAm(context, model, streamOptions(model.api)).context.messages[1].content, expectedDecoded);
				} else {
					// v1.4: error results carry text placeholders only (joined into one
					// string); caption + images follow the tool results in the same
					// user message.
					const placeholder = "(image attached after the tool results)";
					assert.equal(result.content, imageOnly ? placeholder : `${placeholder}\nmiddle\n${placeholder}`);
					const trailing = userContent.slice(1).map((block, index, all) =>
					index === all.length - 1 ? { ...block, ...(block.cache_control ? { cache_control: block.cache_control } : {}) } : block);
				const stripCache = (blocks) => blocks.map((block) => ({ ...block, ...(block.cache_control ? { cache_control: block.cache_control } : {}) }));
				assert.deepEqual(trailing.map((b) => ({ type: b.type, ...(b.type === "text" ? { text: b.text } : { source: b.source }) })),
					stripCache([{ type: "text", text: caption }, wireImage, ...(imageOnly ? [] : [wireImage])]).map((b) => ({ type: b.type, ...(b.type === "text" ? { text: b.text } : { source: b.source }) })));
				if (trailing.length > 0 && "cache_control" in trailing[trailing.length - 1]) {
					assert.equal(trailing[trailing.length - 1].cache_control.type, "ephemeral");
				}
					// Canonical round-trip: tool result with placeholder text, then the
					// caption + images as the following user message.
					const decoded = record.request.context.messages;
					assert.equal(decoded[1].isError, true);
					assert.deepEqual(decoded[1].content, [{ text: imageOnly ? placeholder : `${placeholder}\nmiddle\n${placeholder}` }]);
					assert.equal(decoded[2].role, "user");
					assert.deepEqual(decoded[2].content, [{ text: caption }, decodedImage, ...(imageOnly ? [] : [decodedImage])]);
					const canonical = canonicalAm(context, model, streamOptions(model.api)).context.messages;
					assert.deepEqual(canonical[1].content, decoded[1].content);
					assert.deepEqual(canonical[2].content, decoded[2].content);
				}
			}
		}
	} finally { await server.stop(); }
});
