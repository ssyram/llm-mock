import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { startServer, freePort, repoRoot } from "./harness.mjs";

test("mounted script errors preserve 429/code/message on three real HTTP protocols", async () => {
	const port = await freePort();
	const server = await startServer(port);
	const root = `http://127.0.0.1:${port}`;
	const jsonPost = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" },
		body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
	try {
		const added = await jsonPost(`${root}/__admin/scripts`, { name: "finalerror",
			command: `node '${join(repoRoot, "scripts/mock-scripts/failing.mjs")}' --message=retry-later` });
		assert.equal(added.status, 201, await added.text());
		for (const [path, body] of [
			["v1/chat/completions", { model: "mock-gpt", stream: true, messages: [{ role: "user", content: "go" }] }],
			["v1/responses", { model: "mock-gpt", stream: true, input: [{ role: "user", content: "go" }] }],
			["v1/messages", { model: "mock-gpt", stream: true, max_tokens: 64, messages: [{ role: "user", content: "go" }] }],
		]) {
			const response = await jsonPost(`${root}/finalerror/${path}`, body);
			assert.equal(response.status, 429, path);
			const error = (await response.json()).error;
			assert.equal(error.code ?? error.type, "mock_failure", path);
			assert.equal(error.message, "retry-later", path);
		}
		const removed = await fetch(`${root}/__admin/scripts/finalerror`, { method: "DELETE" });
		assert.equal(removed.status, 200);
		const missing = await jsonPost(`${root}/finalerror/v1/chat/completions`, { model: "mock-gpt", messages: [] });
		assert.equal(missing.status, 404);
	} finally { await server.stop(); }
});
