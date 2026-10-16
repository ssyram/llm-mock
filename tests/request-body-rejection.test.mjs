import test from "node:test";
import assert from "node:assert/strict";
import { emptyGoogleRejection } from "./request-body-rejection.mjs";
import { startServer } from "./harness.mjs";
import { STREAMERS } from "./matrix-lib.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { piAi } from "./pi-ai-imports.mjs";

test("Google empty contents is a real pre-fetch refusal, not a silently skipped request", async () => {
	const server = await startServer(0);
	try {
		const model = makeModel("google-generative-ai", server.port);
		const context = piAi.normalizeContext({ messages: [{ role: "system", content: "system only", timestamp: 1 }] });
		const result = await emptyGoogleRejection(server, STREAMERS[model.api], model, context, streamOptions(model.api));
		assert.equal(result.ok, true, JSON.stringify(result.diffs));
		assert.equal(result.outcome, "expected-rejection");
		assert.equal(result.actual.fetchCalls, 0);
		assert.equal(result.actual.captures, 0);
		for (const mode of ["wrong-error", "fetch", "success"]) {
			const stream = () => ({ result: async () => {
				if (mode === "fetch") await globalThis.fetch("data:text/plain,unexpected");
				return { stopReason: mode === "success" ? "stop" : "error", errorMessage: mode === "wrong-error" ? "unrelated bug" : "contents are required" };
			} });
			assert.equal((await emptyGoogleRejection(server, stream, model, context, {})).ok, false, mode);
		}
	} finally { await server.stop(); }
});
