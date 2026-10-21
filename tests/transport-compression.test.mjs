import test from "node:test";
import assert from "node:assert/strict";
import { zstdCompressSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { startServer, freePort, withCapture } from "./harness.mjs";
import { codex, piAi } from "./pi-ai-imports.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
export const TEST_DEPENDENCIES = ["zstd"];

async function serverTest(run) {
	const server = await startServer(0);
	try { await run(server); } finally { await server.stop(); }
}
const url = (server) => `http://127.0.0.1:${server.port}`;
test("Codex SSE decodes real zstd and preserves endTurn", () => serverTest(async (server) => {
	const model = makeModel("openai-codex-responses", server.port);
	const reply = { content: [{ type: "text", text: "compressed reply" }], api: model.api, provider: model.provider, model: model.id, usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 0, endTurn: false };
	writeFileSync(server.replyPath, JSON.stringify(reply));
	const cap = await withCapture(server, () => codex.stream(model, piAi.normalizeContext({ messages: [{ role: "user", content: "compressed request", timestamp: 1 }] }), { ...streamOptions(model.api), signal: AbortSignal.timeout(5000) }).result());
	assert.equal(cap.value.content[0].text, "compressed reply"); assert.equal(cap.value.endTurn, false);
	assert.equal(cap.record.keyId, streamOptions(model.api).apiKey);
}));
test("Codex corrupt and oversized zstd fail in protocol shape", () => serverTest(async (server) => {
	for (const [body, pattern] of [[Buffer.from("not zstd"), /invalid zstd/], [zstdCompressSync(Buffer.alloc(2 * 1024 * 1024 + 1, 32)), /exceeds 2 MiB/]]) {
		const response = await fetch(`${url(server)}/codex/responses`, { method: "POST", headers: { "content-encoding": "zstd" }, body });
		assert.equal(response.status, 400); assert.match((await response.json()).error.message, pattern);
	}
}));
test("Codex compressed HTTP works on named and dedicated mounts", () => serverTest(async (server) => {
	const port = await freePort();
	const added = await fetch(`${url(server)}/__admin/scripts`, { method: "POST", body: JSON.stringify({ name: "transport", command: `cat '${server.replyPath}'`, port }) });
	assert.equal(added.status, 201);
	for (const base of [`${url(server)}/transport`, `http://127.0.0.1:${port}`]) {
		const response = await fetch(`${base}/codex/responses`, { method: "POST", headers: { "content-encoding": "zstd" }, body: zstdCompressSync(Buffer.from('{"model":"m","input":[]}')) });
		assert.equal(response.status, 200); assert.match(await response.text(), /response.completed/);
	}
}));
