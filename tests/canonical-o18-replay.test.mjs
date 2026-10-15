import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { startServer, freePort } from "./harness.mjs";
import { replyDirection } from "./matrix-lib.mjs";
import { makeModel } from "./models-shared.mjs";
import { loadCorpora, replyCases } from "./corpus.mjs";
import { corpusReplies } from "./extended-matrix-cases.mjs";

const names = ["kahuwo", "claude2", "b4-claude-reason", "b4-deepseek-mixed", "b4-deepseek-codegen", "b4-deepseek-longreason", "b4-kimi-reason", "b4-kimi-toolerr", "b4-glm53-mixed"].map((name) => `reply-corpus-${name}-2`);

test("O18: original 18 corpus replies pass locked Responses/Azure parsers with declared text downgrade", async (t) => {
	const replies = corpusReplies(loadCorpora()).filter((reply) => names.includes(reply.name));
	if (replies.length !== names.length) {
		t.skip("requires all nine private corpus replies; captures are not distributed");
		return;
	}
	const port = await freePort();
	const server = await startServer(port);
	assert.equal(replies.length, 9);
	const results = [];
	const path = new URL("./canonical-o18-results.json", import.meta.url);
	const startedAt = new Date().toISOString();
	try {
		for (const api of ["openai-responses", "azure-openai-responses"]) {
			for (const reply of replies) {
				await replyDirection(api, makeModel(api, port), server, results, [reply]);
				writeFileSync(path, JSON.stringify({ startedAt, updatedAt: new Date().toISOString(), results }, null, 2));
			}
		}
		assert.equal(results.length, 18);
		assert.deepEqual(results.filter((result) => !result.ok).map(({ api, name, diffs }) => ({ api, name, diffs })), []);
		for (const result of results) assert.equal(result.actual.content.some((block) => block.type === "thinking"), false);
	} finally { await server.stop(); }
});

test("encode shared projection reaches nine routable protocol streams including opaque-native preservation", async () => {
	const port = await freePort();
	const server = await startServer(port);
	const apis = ["openai-completions", "openai-responses", "azure-openai-responses", "mistral-conversations", "anthropic-messages", "google-generative-ai", "google-vertex", "bedrock-converse-stream", "pi-messages"];
	const results = [];
	try {
		for (const api of apis) {
			const model = makeModel(api, port);
			const message = replyCases({ api, provider: model.provider, id: model.id })[0].message;
			message.content = [{ type: "thinking", thinking: "reason", thinkingSignature: "opaque" }, { type: "text", text: "answer" }];
			await replyDirection(api, model, server, results, [{ name: "opaque-signature-domain", message }]);
			if (api.endsWith("responses") || ["openai-completions", "mistral-conversations"].includes(api)) {
				await replyDirection(api, model, server, results, [{ name: "opaque-redacted-and-blank", message: { ...message, content: [
					{ type: "thinking", thinking: "secret", thinkingSignature: "opaque", redacted: true },
					{ type: "thinking", thinking: " \n", thinkingSignature: "opaque" },
					{ type: "thinking", thinking: "\ufeff", thinkingSignature: "opaque" },
					{ type: "thinking", thinking: "\u0085", thinkingSignature: "opaque" }, { type: "text", text: "answer" },
				] } }]);
			}
		}
		writeFileSync(new URL("./canonical-o18-wire-results.json", import.meta.url), JSON.stringify({ results }, null, 2));
		assert.deepEqual(results.filter((result) => !result.ok).map(({ api, name, diffs }) => ({ api, name, diffs })), []);
	} finally { await server.stop(); }
});
