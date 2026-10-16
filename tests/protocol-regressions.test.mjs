import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { am, vertex, piAi } from "./pi-ai-imports.mjs";
import { startServer, withCapture, repoRoot, deepDiff } from "./harness.mjs";
import { canonicalVertex } from "./canonical-family-variants.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { replyDirection } from "./matrix-lib.mjs";
import { replyCases } from "./corpus.mjs";

const user = { messages: [{ role: "user", content: "hello", timestamp: 1 }] };
test("Anthropic metadata-only session reaches scripts without pretending it was a session header", async () => {
	const server = await startServer(0);
	try {
		const base = `http://127.0.0.1:${server.port}`;
		const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
		const response = await fetch(`${base}/__admin/scripts`, { method: "POST", headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "metadata", command: `${quote(process.execPath)} ${quote(resolve(repoRoot, "scripts/mock-scripts/echo-message.mjs"))}` }) });
		assert.equal(response.status, 201);
		const model = { ...makeModel("anthropic-messages", server.port), baseUrl: `${base}/metadata` };
		for (const header of [undefined, "header-session"]) {
			const result = await am.stream(model, piAi.normalizeContext(user), { ...streamOptions(model.api), sessionId: undefined,
				metadata: { user_id: "metadata-session" }, ...(header ? { headers: { "x-session-affinity": header } } : {}), signal: AbortSignal.timeout(5000) }).result();
			assert.equal(result.stopReason, "stop", result.errorMessage);
			const blocks = [...result.content[0].text.matchAll(/```json\n([\s\S]*?)\n```/g)];
			const metadata = JSON.parse(blocks.at(-1)[1]);
			assert.equal(metadata.sessionSignal, header ?? "metadata-session");
			assert.equal(metadata.options.sessionId, header);
		}
	} finally { await server.stop(); }
});

test("Vertex non-Google publisher enters Vertex decoder through the real SDK", async () => {
	const server = await startServer(0);
	try {
		const model = { ...makeModel("google-vertex", server.port), id: "anthropic/claude-test" };
		const { record, value } = await withCapture(server, () => vertex.stream(model, piAi.normalizeContext(user), { ...streamOptions(model.api), signal: AbortSignal.timeout(5000) }).result());
		assert.equal(value.stopReason, "stop", value.errorMessage);
		assert.equal(record.api, "google-vertex");
		assert.equal(record.request.model, "claude-test");
		assert.deepEqual(deepDiff(record.request, canonicalVertex(user, model, streamOptions(model.api))), []);
	} finally { await server.stop(); }
});

test("real parsers preserve marker-looking business IDs and Google live-model IDs", async () => {
	const server = await startServer(0);
	try {
		for (const api of ["pi-messages", "google-generative-ai", "google-vertex"]) {
			const model = { ...makeModel(api, server.port), ...(api === "pi-messages" ? {} : { id: "gemini-live-3-test" }) };
			const message = replyCases({ api, provider: model.provider, id: model.id })[0].message;
			message.content = [{ type: "toolCall", id: "@pi-generated:1", name: "echo", arguments: { x: 1 } }];
			message.stopReason = "toolUse";
			const rows = [];
			await replyDirection(api, model, server, rows, [{ name: "literal-id", message }]);
			assert.equal(rows[0].ok, true, JSON.stringify(rows[0].diffs));
			assert.equal(rows[0].actual.content[0].id, "@pi-generated:1");
		}
	} finally { await server.stop(); }
});
