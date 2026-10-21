import test from "node:test";
import assert from "node:assert/strict";
import { startReceiptServer } from "./request-receipt-server.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { withCapture, deepDiff } from "./harness.mjs";
import { piAi } from "./pi-ai-imports.mjs";
import { STREAMERS } from "./matrix-lib.mjs";
import { providerContract } from "./provider-contracts.mjs";

test("pi-messages wire, capture and real script preserve ordered sections and JSON record fields", async () => {
	const server = await startReceiptServer();
	try {
		const model = makeModel("pi-messages", server.port);
		const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
		const records = { details: null, usage, nestedCalls: { calls: [], complete: true } };
		const history = { diagnostics: [{ type: "fixture", timestamp: 3, details: { retained: true } }], deferred: { provider: model.provider, modelId: model.id, api: model.api, id: "fixture-handle" } };
		const context = { messages: [
			{ role: "system", content: "base", sections: { z: "FIRST", a: "SECOND" }, timestamp: 1 },
			{ role: "user", content: "go", timestamp: 2 },
			{ role: "assistant", api: model.api, provider: model.provider, model: model.id, content: [{ type: "toolCall", id: "c", name: "echo", arguments: { timestamp: 11, durationMs: 22 } }], usage, stopReason: "toolUse", timestamp: 3, ...history },
			{ role: "toolResult", toolCallId: "c", toolName: "echo", content: [{ type: "text", text: "result" }], isError: false, timestamp: 4, ...records },
		] };
		let wire;
		const options = { ...streamOptions(model.api), cacheRetention: "long", onPayload: (value) => { wire = structuredClone(value); } };
		const captured = await withCapture(server, () => STREAMERS[model.api](model, piAi.normalizeContext(context), options).result());
		assert.equal(captured.value.stopReason, "stop");
		const receipt = JSON.parse(captured.value.content[0].text);
		for (const value of [wire.context, captured.record.request.context, receipt.request.context]) {
			assert.deepEqual(Object.entries(value.messages[0].sections), [["z", "FIRST"], ["a", "SECOND"]]);
			for (const key of Object.keys(records)) assert.deepEqual(value.messages[3][key], records[key]);
			for (const key of Object.keys(history)) assert.deepEqual(value.messages[2][key], history[key]);
		}
		assert.equal(wire.options.cacheRetention, "long");
		assert.equal(receipt.request.options.cacheRetention, "long");
		assert.deepEqual(deepDiff(receipt.request, providerContract(model.api).request(context, model, options)), []);
	} finally { await server.stop(); }
});
