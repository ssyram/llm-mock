import test from "node:test";
import assert from "node:assert/strict";
import { PROVIDER_CONTRACTS, providerContract } from "./provider-contracts.mjs";
import { ProviderContract } from "./contracts/provider-contract.ts";
import { evaluate } from "./contracts/behavior.ts";
import { makeModel } from "./models-shared.mjs";
import { canonicalReply } from "./canonical-reply.mjs";
import { replyCases } from "./corpus.mjs";

const context = { messages: [{ role: "user", content: "hello", timestamp: 7 }] };
test("ten distinct provider implementations expose complete executable request/reply definitions", () => {
	assert.equal(PROVIDER_CONTRACTS.length, 10);
	assert.equal(new Set(PROVIDER_CONTRACTS.map((c) => c.constructor.name)).size, 10);
	for (const contract of PROVIDER_CONTRACTS) {
		assert.ok(contract instanceof ProviderContract);
		const model = makeModel(contract.api, 1), options = { maxTokens: 64, sessionId: "s" };
		const before = structuredClone(context);
		const definition = contract.definition("request", model, options);
		assert.equal(definition.kind, "transform");
		assert.equal(definition.transform.tag, "program");
		assert.deepEqual(evaluate(definition, context), contract.request(context, model, options));
		const source = replyCases({ api: contract.api, provider: model.provider, id: model.id })[0].message;
		assert.deepEqual(contract.reply(source, model), canonicalReply(contract.api, source, model));
		assert.deepEqual(context, before);
	}
	assert.throws(() => providerContract("unknown"), /unsupported/);
	assert.throws(() => providerContract("pi-messages").request(context, makeModel("openai-responses", 1)), /API mismatch/);
});

test("explicit option behaviors generate the actual canonical options", () => {
	for (const contract of PROVIDER_CONTRACTS) {
		const model = makeModel(contract.api, 1);
		for (const maxTokens of [undefined, 0, 1, 15, 16, 17, 64]) {
			const options = { maxTokens };
			const law = contract.behavior("request", "maxTokens", maxTokens, { model, options });
			assert.equal(evaluate(law, maxTokens), contract.request(context, model, options).options.maxTokens, contract.api);
		}
		assert.throws(() => contract.behavior("request", "unclassified-field", 1, { model }), /no scalar behavior/);
	}
});

test("fixture options are not invented by a provider definition", () => {
	const contract = providerContract("openai-responses"), model = makeModel(contract.api, 1);
	const output = contract.request(context, model);
	assert.equal(output.options.maxTokens, undefined);
	assert.equal(output.options.sessionId, undefined);
});

test("tool mode queries require their current-tool precondition", () => {
	for (const api of ["google-generative-ai", "google-vertex", "bedrock-converse-stream"]) {
		const contract = providerContract(api), model = makeModel(api, 1);
		assert.throws(() => contract.behavior("request", "toolChoice", "any", { model }), /current tool collection/);
	}
});

test("runtime injections cannot be fabricated as deterministic expected values", () => {
	const contract = providerContract("pi-messages"), model = makeModel(contract.api, 1);
	assert.equal(contract.behavior("request", "timestamp", 7, { model }).kind, "preserve");
	assert.equal(contract.behavior("reply", "toolCall.id", "@pi-generated:1", { model }).kind, "preserve");
	assert.throws(() => evaluate(contract.behavior("reply", "timestamp", 0, { model }), 0), /requires observation/);
	assert.throws(() => evaluate(contract.behavior("reply", "stopReason", "pending", { model }), "pending"), /rejects/);
	assert.throws(() => evaluate({ kind: "transform", transform: { tag: "unknown" } }, "x"), /unsupported transform/);
	assert.throws(() => contract.definition("unknown", model), /unsupported canonical direction/);
});
