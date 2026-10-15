import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROTOCOLS } from "./protocol-matrix.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { requestDomain } from "./property-request-domain.mjs";
import { requestProjection } from "./property-request-projection.mjs";

const baseline = JSON.parse(readFileSync(new URL("./property-p1-counterexamples.json", import.meta.url)));

for (const row of baseline.results.filter((r) => r.phase === "compare")) {
	test(`requestProjection: ${row.api}/${row.name}`, () => {
		const model = makeModel(row.api, 12345);
		if (row.name.includes("vision")) model.input = ["text", "image"];
		const protocol = PROTOCOLS.find((p) => p.api === row.api);
		const result = requestProjection(row.expected, row.actual, protocol.canonical, model, streamOptions(row.api));
		assert.deepEqual(result.diffs, []);
		assert.equal(result.rawIdempotent, false);
		assert.deepEqual(result.rawDiffs, row.diffs);
		const corrupted = structuredClone(row.actual);
		corrupted.model = "not-the-target";
		assert.ok(requestProjection(row.expected, corrupted, protocol.canonical, model, streamOptions(row.api)).diffs.length);
	});
}

test("requestDomain: non-ByteString session is a header rejection, not an idempotence success", () => {
	const model = makeModel("openai-responses", 12345);
	const options = { ...streamOptions(model.api), sessionId: "🚀" };
	assert.equal(requestDomain(model.api, model, options).kind, "expected-rejection");
	assert.equal(requestDomain(model.api, model, { ...options, cacheRetention: "none" }), undefined);
	assert.equal(requestDomain(model.api, model, { ...options, headers: { session_id: "ok", "x-client-request-id": "ok" } }), undefined);
	assert.equal(requestDomain("google-generative-ai", model, options), undefined);
	assert.equal(requestDomain(model.api, model, streamOptions(model.api)), undefined);
});
