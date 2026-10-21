import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { startServer } from "./harness.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { STREAMERS } from "./matrix-lib.mjs";
import { PROVIDER_CONTRACTS } from "./provider-contracts.mjs";
import { protocolSelection } from "./protocol-prerequisites.mjs";

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const command = (mode, exit) => `${quote(process.execPath)} ${quote(fileURLToPath(new URL("./script-exit-fixture.mjs", import.meta.url)))} ${mode} ${exit}`;
const context = { messages: [{ role: "user", content: "go", timestamp: 1 }] };
const selection = protocolSelection(PROVIDER_CONTRACTS);

for (const [mode, pattern] of [["success", /script exited unsuccessfully:.*7/], ["error", /simulated retry later/]]) {
	test(`${mode} JSON with exit 7 reaches ordinary provider error events, not done`, { timeout: 120000 }, async () => {
		const server = await startServer(0, {}, { type: "script", command: command(mode, 7) });
		try {
			for (const { api } of selection.available) {
				const stream = STREAMERS[api](makeModel(api, server.port), context, { ...streamOptions(api), maxRetries: 0, signal: AbortSignal.timeout(10000) });
				const events = [];
				for await (const event of stream) events.push(event.type);
				const result = await stream.result();
				assert.equal(result.stopReason, "error", api);
				if (api === "openai-codex-responses" && mode === "error") assert.equal(result.errorMessage, "You have hit your ChatGPT usage limit.");
				else assert.match(result.errorMessage, pattern, api);
				assert.ok(events.includes("error"), api); assert.equal(events.includes("done"), false, api);
				assert.equal(JSON.stringify(result.content).includes("MUST_NOT_HIDE_EXIT_FAILURE"), false, api);
			}
		} finally { await server.stop(); }
	});
}

test("HTTP failures use pre-stream 500/native JSON; valid simulated errors keep 429 even with exit 7", async () => {
	for (const [mode, exit, status, code, message] of [["success", 7, 500, "script_failed", /exited unsuccessfully:.*7/], ["error", 7, 429, "planned", /simulated retry later/], ["success", 0, 200]]) {
		const server = await startServer(0, {}, { type: "script", command: command(mode, exit) });
		try {
			for (const [path, body] of [
				["/v1/chat/completions", { model: "m", messages: context.messages, stream: true }],
				["/v1/responses", { model: "m", input: [{ role: "user", content: "go" }], stream: true }],
				["/v1/messages", { model: "m", messages: context.messages, max_tokens: 64, stream: true }],
				["/messages", { model: "m", context }],
			]) {
				const response = await fetch(`http://127.0.0.1:${server.port}${path}`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer duality", "x-api-key": "duality" }, body: JSON.stringify(body) });
				assert.equal(response.status, status, path);
				if (status === 200) { assert.match(await response.text(), /MUST_NOT_HIDE_EXIT_FAILURE/); continue; }
				assert.match(response.headers.get("content-type"), /application\/json/);
				const error = (await response.json()).error;
				assert.equal(error.code ?? error.type, code); assert.match(error.message, message);
			}
		} finally { await server.stop(); }
	}
});

test("an established WebSocket reports native error code/message without a successful response", async () => {
	for (const [mode, code, message] of [["success", "script_failed", /exited unsuccessfully:.*7/], ["error", "planned", /simulated retry later/]]) {
		const server = await startServer(0);
		let socket, timer;
		try {
			const response = await fetch(`http://127.0.0.1:${server.port}/__admin/scripts`, { method: "POST", body: JSON.stringify({ name: "exit-ws", command: command(mode, 7) }) });
			assert.equal(response.status, 201);
			socket = new WebSocket(`ws://127.0.0.1:${server.port}/exit-ws/backend-api/codex/responses`);
			const event = await new Promise((resolve, reject) => {
				timer = setTimeout(() => reject(new Error("missing WebSocket error")), 10000);
				socket.onopen = () => socket.send(JSON.stringify({ type: "response.create", model: "m", instructions: "test", input: [{ role: "user", content: "go" }] }));
				socket.onerror = reject;
				socket.onmessage = ({ data }) => { const event = JSON.parse(data); if (event.type === "error" || event.type === "response.completed") resolve(event); };
			});
			assert.equal(event.type, "error"); assert.equal(event.error.code, code); assert.match(event.error.message, message);
		} finally { clearTimeout(timer); socket?.close(); await server.stop(); }
	}
});
