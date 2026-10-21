import test from "node:test";
import assert from "node:assert/strict";
import { nativeOptionsCases } from "./native-options-cases.mjs";
import { startServer, withCapture, deepDiff } from "./harness.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { providerContract } from "./provider-contracts.mjs";
import { STREAMERS } from "./matrix-lib.mjs";
import { piAi } from "./pi-ai-imports.mjs";

export function nativeOptionsRegressions(codex) {
	for (const tc of nativeOptionsCases.filter((tc) => (tc.api === "openai-codex-responses") === codex)) {
		test(`${tc.api}: native ${tc.name} uses wire-derived options, not fixture defaults`, async () => {
			const server = await startServer(0);
			try {
				const model = { ...makeModel(tc.api, server.port), ...tc.model };
				const tool = { name: "echo", description: "echo", parameters: { type: "object", properties: { value: { type: "string" } }, required: ["value"] }, ...(tc.strict ? { constrainedSampling: { type: "json_schema", strict: "require" } } : {}) };
				const context = { messages: [{ role: "system", content: "test", toolsAdded: [tool], timestamp: 1 }, { role: "user", content: "go", timestamp: 2 }] };
				let wire;
				const options = { ...streamOptions(tc.api), ...tc.options, onPayload: (value) => { wire = structuredClone(value); } };
				const cap = await withCapture(server, () => STREAMERS[tc.api](model, piAi.normalizeContext(context), options).result());
				assert.equal(cap.value.stopReason, "stop", cap.value.errorMessage);
				assert.deepEqual(deepDiff(cap.record.request, providerContract(tc.api).request(context, model, options), [], "$", [], tc.api), []);
				for (const [field, value] of Object.entries(tc.expected)) assert.deepEqual(cap.record.request.options[field], value, field);
				if (tc.path) assert.deepEqual(tc.path.reduce((value, key) => value?.[key], wire), tc.value, "independent wire observation");
				if (tc.api === "bedrock-converse-stream") {
					assert.equal(wire.toolConfig, undefined);
					assert.equal(cap.record.request.context.messages.some((message) => message.toolsAdded?.length), false);
				}
			} finally { await server.stop(); }
		});
	}
}
