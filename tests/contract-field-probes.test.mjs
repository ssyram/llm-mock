import test from "node:test";
import assert from "node:assert/strict";
import { PROVIDER_CONTRACTS, providerContract } from "./provider-contracts.mjs";
import { evaluate } from "./contracts/behavior.ts";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { startServer, withCapture, deepDiff } from "./harness.mjs";
import { STREAMERS } from "./matrix-lib.mjs";
import { piAi } from "./pi-ai-imports.mjs";
import { canonicalReply, compareReply } from "./canonical-reply.mjs";
import { captureWireReply } from "./capture-wire-reply.mjs";
import { replyCases } from "./corpus.mjs";

export const TEST_DEPENDENCIES = ["zstd"];

async function observe(contract, server, timestamp, maxTokens, overrides = {}) {
	const model = { ...makeModel(contract.api, server.port), ...overrides };
	let wire;
	const context = { messages: [{ role: "user", content: "paired 中文 😀", timestamp }] };
	const options = { ...streamOptions(contract.api), maxTokens, onPayload: (value) => { wire = JSON.parse(JSON.stringify(value)); } };
	const cap = await withCapture(server, () => STREAMERS[contract.api](model, piAi.normalizeContext(context), { ...options, signal: AbortSignal.timeout(10000) }).result());
	assert.equal(cap.record.api, contract.api);
	assert.equal(cap.value.stopReason, "stop", cap.value.errorMessage);
	assert.ok(wire, `${contract.api} payload observation`);
	return { wire, request: cap.record.request, model, context, options };
}

test("timestamp pairs independently verify preserved versus absent wire information for all ten providers", async () => {
	const server = await startServer(0);
	try {
		for (const contract of PROVIDER_CONTRACTS) {
			const first = await observe(contract, server, 11, 64), second = await observe(contract, server, 12, 64);
			if (contract.api === "pi-messages") assert.notDeepEqual(first.wire, second.wire);
			else assert.deepEqual(first.wire, second.wire, contract.api);
			for (const [value, observation] of [[11, first], [12, second]]) {
				const actual = observation.request.context.messages.findLast((m) => m.role === "user").timestamp;
				assert.equal(actual, contract.api === "pi-messages" ? value : 0, contract.api);
				assert.equal(evaluate(contract.behavior("request", "timestamp", value, observation), value), actual);
				assert.deepEqual(deepDiff(observation.request, contract.request(observation.context, observation.model, observation.options)), []);
			}
		}
	} finally { await server.stop(); }
});

test("token boundary pairs verify executable field rules against the real client and decoder", async () => {
	const server = await startServer(0);
	try {
		for (const contract of PROVIDER_CONTRACTS) for (const maximum of [undefined, 0, 1, 15, 16, 17]) {
			const observation = await observe(contract, server, 1, maximum);
			const expected = evaluate(contract.behavior("request", "maxTokens", maximum, observation), maximum);
			assert.equal(observation.request.options.maxTokens, expected, `${contract.api}/${maximum}`);
			const w = observation.wire;
			const limit = w.max_tokens ?? w.max_completion_tokens ?? w.max_output_tokens ?? w.maxTokens ?? w.generationConfig?.maxOutputTokens ?? w.config?.maxOutputTokens ?? w.inferenceConfig?.maxTokens ?? w.options?.maxTokens;
			assert.equal(limit, expected, `${contract.api}/${maximum}: real payload`);
		}
	} finally { await server.stop(); }
});

test("Bedrock only defaults the budget for Claude IDs or names", async () => {
	const server = await startServer(0);
	try {
		const contract = providerContract("bedrock-converse-stream");
		for (const [overrides, expected] of [[{ id: "openai.gpt-oss-test", name: "GPT OSS" }, undefined], [{ id: "profile-id", name: "Claude profile" }, 1024]]) {
			const observation = await observe(contract, server, 1, undefined, overrides);
			assert.equal(observation.request.options.maxTokens, expected);
			assert.equal(observation.wire.inferenceConfig?.maxTokens, expected);
			assert.equal(evaluate(contract.behavior("request", "maxTokens", undefined, observation), undefined), expected);
		}
	} finally { await server.stop(); }
});

test("all eight api/provider/model identity gates are checked against real wire decisions", async () => {
	const server = await startServer(0);
	try {
		for (const contract of PROVIDER_CONTRACTS) for (let mask = 0; mask < 8; mask++) {
			const model = makeModel(contract.api, server.port);
			const signature = contract.api.endsWith("responses") ? JSON.stringify({ type: "reasoning", id: "rs_identity", summary: [{ type: "summary_text", text: "thought" }] })
				: ["google-generative-ai", "google-vertex"].includes(contract.api) ? "AQID" : contract.api === "openai-completions" ? "reasoning_content" : "sig-identity";
			const history = { ...replyCases({ api: contract.api, provider: model.provider, id: model.id })[0].message,
				role: "assistant", api: mask & 1 ? model.api : model.api === "pi-messages" ? "openai-completions" : "pi-messages",
				provider: mask & 2 ? model.provider : "foreign-provider", model: mask & 4 ? model.id : "foreign-model", timestamp: 1,
				content: [{ type: "thinking", thinking: "thought", thinkingSignature: signature }, { type: "text", text: "answer" },
					{ type: "toolCall", id: "call!|fc_item", name: "echo", arguments: { value: "x" } }] };
			const context = { messages: [{ role: "user", content: "first", timestamp: 1 }, history,
				{ role: "toolResult", toolCallId: "call!|fc_item", toolName: "echo", content: [{ type: "text", text: "result" }], isError: false, timestamp: 2 },
				{ role: "user", content: "next", timestamp: 3 }] };
			let wire;
			const options = { ...streamOptions(contract.api), onPayload: (payload) => { wire = JSON.stringify(payload); } };
			const cap = await withCapture(server, () => STREAMERS[contract.api](model, piAi.normalizeContext(context), { ...options, signal: AbortSignal.timeout(10000) }).result());
			assert.equal(cap.record.api, contract.api);
			assert.deepEqual(deepDiff(cap.record.request, contract.request(context, model, options)), [], `${contract.api}/${mask}`);
			const marker = contract.api.endsWith("responses") ? "rs_identity" : contract.api === "mistral-conversations" ? "call!|fc_item" : signature;
			const retained = contract.api === "pi-messages" || mask === 7;
			assert.equal(wire.includes(marker), retained, `${contract.api}/${mask}: independent identity-gate witness`);
			assert.equal(JSON.stringify(cap.record.request).includes(marker), retained, `${contract.api}/${mask}: wire information reached the decoder output`);
		}
	} finally { await server.stop(); }
});

test("a jointly corrupted response and canonical cannot hide from an independent exact-field probe", async () => {
	const server = await startServer(0);
	try {
		const api = "pi-messages", contract = providerContract(api), model = makeModel(api, server.port);
		const source = replyCases({ api, provider: model.provider, id: model.id })[0].message;
		source.content = [{ type: "toolCall", id: "keep-id", name: "echo", arguments: { value: "x" } }]; source.stopReason = "toolUse";
		const captured = await captureWireReply(api, source, model, streamOptions(api), server, (wire) => ({ ...wire,
			body: Buffer.from(wire.body.toString().replaceAll('"keep-id"', '"wrong-id"')) }));
		const correct = canonicalReply(api, source, model);
		assert.ok(compareReply(captured.parsed, correct, deepDiff, ...captured.window).length);
		const corruptedOracle = structuredClone(correct); corruptedOracle.content[0].id = "wrong-id";
		assert.deepEqual(compareReply(captured.parsed, corruptedOracle, deepDiff, ...captured.window), []);
		const law = contract.behavior("reply", "toolCall.id", source.content[0].id, { model });
		assert.equal(law.kind, "preserve");
		assert.notEqual(captured.parsed.content[0].id, evaluate(law, source.content[0].id));
	} finally { await server.stop(); }
});
