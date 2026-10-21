import test from "node:test";
import assert from "node:assert/strict";
import { zstdCompressSync } from "node:zlib";
import { startServer } from "./harness.mjs";
test("Codex missing CLI reports protocol JSON and install guide with only Node compression available", async () => {
	const server = await startServer(0, { PATH: "" });
	try {
		const response = await fetch(`http://127.0.0.1:${server.port}/codex/responses`, { method: "POST", headers: { "content-encoding": "zstd" }, body: zstdCompressSync(Buffer.from('{"model":"m","input":[]}')) });
		assert.equal(response.status, 400);
		const body = await response.json();
		assert.equal(body.error.type, "invalid_request_error"); assert.match(body.error.message, /https:\/\/facebook.github.io\/zstd\//);
	} finally { await server.stop(); }
});
