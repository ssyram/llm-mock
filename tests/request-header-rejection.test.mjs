import test from "node:test";
import assert from "node:assert/strict";
import { requestDirection, STREAMERS } from "./matrix-lib.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { requestDomain } from "./property-request-domain.mjs";
import { matrixSummary } from "./matrix-summary.mjs";
import { startServer } from "./harness.mjs";

const invalid = { name: "unicode-session", options: { sessionId: "😀".repeat(70) }, messages: [{ role: "user", content: "body 中文 😀", timestamp: 1 }] };
const canonicalMustNotRun = () => { throw new Error("rejected input has no decoded canonical value"); };

test("real client header refusals are asserted and counted separately from duality matches", async () => {
	const server = await startServer(0);
	try {
		for (const api of ["openai-completions", "openai-responses", "openai-codex-responses", "mistral-conversations", "anthropic-messages"]) {
			const rows = [];
			const model = { ...makeModel(api, server.port), compat: { sendSessionAffinityHeaders: true } };
			await requestDirection(api, model, server, [invalid], canonicalMustNotRun, rows);
			assert.equal(rows.length, 1);
			assert.equal(rows[0].ok, true, JSON.stringify(rows[0].diffs));
			assert.equal(rows[0].outcome, "expected-rejection");
			assert.equal(rows[0].actual.fetchCalls, 0);
			assert.equal(rows[0].actual.captures, 0);
			assert.match(rows[0].actual.errorMessage, /ByteString.*greater than 255/);
			assert.deepEqual(matrixSummary(rows), { matched: 0, expectedRejections: 1, failed: 0 });
		}
	} finally { await server.stop(); }
});

test("unexpected success, wrong error and any fetch call fail the rejection assertion", async () => {
	const server = await startServer(0);
	const api = "openai-responses";
	const original = STREAMERS[api];
	try {
		const model = makeModel(api, server.port);
		const reason = requestDomain(api, model, { ...streamOptions(api), ...invalid.options }).reason;
		for (const mode of ["success", "wrong-error", "fetch"]) {
			STREAMERS[api] = (_model, _context, options) => ({ result: async () => {
				if (mode === "fetch") await options.fetch("data:application/json,%7B%7D");
				return { stopReason: mode === "success" ? "stop" : "error", errorMessage: mode === "wrong-error" ? "unrelated implementation bug" : reason };
			} });
			const rows = [];
			await requestDirection(api, model, server, [invalid], canonicalMustNotRun, rows);
			assert.equal(rows[0].ok, false, mode);
			assert.deepEqual(matrixSummary(rows), { matched: 0, expectedRejections: 0, failed: 1 });
		}
	} finally {
		STREAMERS[api] = original;
		await server.stop();
	}
});

test("retention and explicit affinity overrides obey the fixed clients' header rules", () => {
	for (const api of ["openai-responses", "openai-codex-responses", "mistral-conversations"]) {
		const model = makeModel(api, 1);
		assert.equal(requestDomain(api, model, { sessionId: "😀", cacheRetention: "none" }), undefined);
		assert.equal(requestDomain(api, model, { sessionId: "ASCII session" }), undefined);
	}
	const model = makeModel("mistral-conversations", 1);
	assert.equal(requestDomain(model.api, model, { sessionId: "😀", headers: { "X-Affinity": "ascii" } }), undefined);
	assert.equal(requestDomain(model.api, model, { sessionId: "😀", headers: { "x-affinity": null } }), undefined);
});
