import test from "node:test";
import assert from "node:assert/strict";
import { startServer, freePort, withCapture, deepDiff } from "./harness.mjs";
import { canonicalCodex } from "./canonical-family-variants.mjs";
import { codex, vertex, piAi } from "./pi-ai-imports.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { withVertexAdc } from "./vertex-adc-fixture.mjs";

const user = (text) => ({ role: "user", content: text, timestamp: 1 });
const context = (messages) => piAi.normalizeContext({ messages });
async function serverTest(run) {
	const server = await startServer(0);
	try { await run(server); } finally { codex.closeOpenAICodexWebSocketSessions(); await server.stop(); }
}
const url = (server) => `http://127.0.0.1:${server.port}`;

test("Codex auto uses WebSocket and cached continuation restores full input", () => serverTest(async (server) => {
	const model = makeModel("openai-codex-responses", server.port);
	const sessionId = "transport-cached";
	codex.resetOpenAICodexWebSocketDebugStats(sessionId);
	const options = { ...streamOptions(model.api), sessionId, transport: "auto" };
	const first = await withCapture(server, () => codex.stream(model, context([user("first")]), { ...options, signal: AbortSignal.timeout(5000) }).result());
	assert.equal(first.value.stopReason, "stop");
	const next = context([user("first"), first.value, user("second")]);
	const second = await withCapture(server, () => codex.stream(model, next, { ...options, signal: AbortSignal.timeout(5000) }).result());
	assert.equal(second.value.stopReason, "stop");
	assert.deepEqual(deepDiff(second.record.request, canonicalCodex(next, model, options)), []);
	const stats = codex.getOpenAICodexWebSocketDebugStats(sessionId);
	assert.equal(stats.connectionsCreated, 1); assert.equal(stats.connectionsReused, 1); assert.equal(stats.deltaRequests, 1);
	assert.equal(stats.sseFallbacks, 0); assert.equal(stats.websocketFailures, 0);
}));

test("Codex WS rejects malformed frames and unknown continuation IDs", () => serverTest(async (server) => {
	const socket = new WebSocket(`${url(server).replace("http:", "ws:")}/codex/responses`);
	await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
	try {
		for (const [body, code] of [["not json", "invalid_request"], [JSON.stringify({ type: "response.create", input: [], previous_response_id: "missing" }), "previous_response_not_found"]]) {
			const event = new Promise((resolve) => socket.addEventListener("message", (e) => resolve(JSON.parse(e.data)), { once: true }));
			socket.send(body); assert.equal((await event).error.code, code);
		}
	} finally { socket.close(); }
}));

test("Vertex ADC accepts synthetic service account on local custom baseUrl", () => serverTest(async (server) => withVertexAdc(async (options) => {
	const model = { ...makeModel("google-vertex", server.port), baseUrl: `${server.mistralBaseUrl}/v1` };
	const cap = await withCapture(server, () => vertex.stream(model, context([user("ADC request")]), { ...options, signal: AbortSignal.timeout(5000) }).result());
	assert.equal(cap.value.stopReason, "stop"); assert.equal(cap.record.api, "google-vertex"); assert.equal(cap.record.keyId.split(".").length, 3);
	const claims = JSON.parse(Buffer.from(cap.record.keyId.split(".")[1], "base64url"));
	assert.equal(claims.iss, "mock@mock.invalid"); assert.equal(claims.scope, "https://www.googleapis.com/auth/cloud-platform");
})));

test("unauthenticated WS works on named and dedicated mounts without compression", () => serverTest(async (server) => {
	const port = await freePort();
	const added = await fetch(`${url(server)}/__admin/scripts`, { method: "POST", body: JSON.stringify({ name: "transport", command: `cat '${server.replyPath}'`, port }) });
	assert.equal(added.status, 201);
	for (const base of [`${url(server)}/transport`, `http://127.0.0.1:${port}`]) {
		const socket = new WebSocket(`${base.replace("http:", "ws:")}/backend-api/codex/responses`);
		await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
		try {
			const result = new Promise((resolve) => socket.addEventListener("message", ({ data }) => { const frame = JSON.parse(data); if (frame.type === "response.completed" || frame.type === "error") resolve(frame); }));
			socket.send(JSON.stringify({ type: "response.create", model: "m", input: [] }));
			assert.equal((await result).type, "response.completed");
		} finally { socket.close(); }
	}
}));
