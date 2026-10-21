import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { freePort, withCapture, deepDiff } from "./harness.mjs";
import { startReceiptServer } from "./request-receipt-server.mjs";
import { startTraceServer, runTraceScenario } from "./trace-driver.mjs";
import { makeModel } from "./models-shared.mjs";
import { codex, vertex, piAi } from "./pi-ai-imports.mjs";
import { withVertexAdc } from "./vertex-adc-fixture.mjs";
import { providerContract } from "./provider-contracts.mjs";

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const command = `${quote(process.execPath)} ${quote(fileURLToPath(new URL("./request-receipt-script.mjs", import.meta.url)))}`;
const scenario = { count: 1, sameName: true, sameId: false, errors: [false], order: [0] };

test("forced Codex WebSocket tools verify actual script envelope on both model requests", async () => {
	const server = await startTraceServer();
	try {
		const result = await runTraceScenario(server, "openai-codex-responses", "openai-codex-responses", scenario, { streamOptions: { transport: "websocket" } });
		assert.equal(result.envelopeVerified, true);
		assert.equal(result.executions, 1);
	} finally { codex.closeOpenAICodexWebSocketSessions(); await server.stop(); }
});

async function mount(server, name, api) {
	const port = await freePort(), root = `http://127.0.0.1:${server.port}`;
	const response = await fetch(`${root}/__admin/scripts`, { method: "POST", body: JSON.stringify({ name, command, port, protocols: [api] }) });
	assert.equal(response.status, 201, await response.text());
	return [`${root}/${name}`, `http://127.0.0.1:${port}`];
}
function assertEnvelope(receipt, api, session, request) {
	assert.equal(receipt.api, api); assert.equal(receipt.model, request.model);
	assert.equal(receipt.keyId, ""); assert.equal(receipt.sessionSignal, session);
	assert.deepEqual(deepDiff(receipt.request, request), []);
}

test("named and dedicated unauthenticated HTTP/WS mounts deliver empty key and body sessions to script", async () => {
	const server = await startReceiptServer();
	try {
		for (const base of await mount(server, "envelope-pi", "pi-messages")) {
			const request = { model: "mounted-model", context: { messages: [{ role: "user", content: "go", timestamp: 1 }] }, options: { sessionId: "pi-body" } };
			const response = await fetch(`${base}/messages`, { method: "POST", body: JSON.stringify(request) });
			assert.equal(response.status, 200);
			const frames = (await response.text()).split("\n\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
			assertEnvelope(JSON.parse(frames.find((frame) => frame.type === "text_delta").delta), "pi-messages", "pi-body", request);
		}
		for (const base of await mount(server, "envelope-ws", "openai-codex-responses")) {
			const socket = new WebSocket(`${base.replace("http:", "ws:")}/backend-api/codex/responses`);
			let timer;
			try {
				const text = await new Promise((resolve, reject) => {
					let text = "";
					timer = setTimeout(() => reject(new Error("WebSocket receipt timed out")), 10000);
					socket.onopen = () => socket.send(JSON.stringify({ type: "response.create", model: "mounted-model", instructions: "mounted", input: [{ role: "user", content: "go" }], prompt_cache_key: "ws-body" }));
					socket.onerror = reject;
					socket.onmessage = ({ data }) => {
						const event = JSON.parse(data);
						if (event.type === "error") reject(new Error(JSON.stringify(event.error)));
						if (event.type === "response.output_text.delta") text += event.delta;
						if (event.type === "response.completed") resolve(text);
					};
				});
				assertEnvelope(JSON.parse(text), "openai-codex-responses", "ws-body", { model: "mounted-model", context: { messages: [{ role: "system", content: "mounted", timestamp: 0 }, { role: "user", content: "go", timestamp: 0 }] }, options: { sessionId: "ws-body" } });
			} finally { clearTimeout(timer); socket.close(); }
		}
	} finally { await server.stop(); }
});

test("Vertex ADC script receives the exact outgoing auth token and resource model, not parser restamps", async () => {
	const server = await startReceiptServer(), originalFetch = globalThis.fetch;
	try {
		const [base] = await mount(server, "envelope-adc", "google-vertex");
		await withVertexAdc(async (options) => {
			const model = { ...makeModel("google-vertex", server.port), baseUrl: `${base}/v1` };
			const context = piAi.normalizeContext({ messages: [{ role: "user", content: "go", timestamp: 1 }] });
			let token;
			globalThis.fetch = (input, init) => {
				const url = String(input.url ?? input);
				if (url.startsWith(base)) token = new Headers(init?.headers ?? input.headers).get("authorization")?.replace(/^Bearer /, "");
				return originalFetch(input, init);
			};
			const cap = await withCapture(server, () => vertex.stream(model, context, options).result());
			assert.equal(cap.value.stopReason, "stop");
			const receipt = JSON.parse(cap.value.content[0].text);
			assert.ok(token); assert.equal(receipt.keyId, token);
			assert.equal(receipt.api, model.api); assert.equal(receipt.model, model.id); assert.equal(receipt.sessionSignal, null);
			assert.deepEqual(deepDiff(receipt.request, providerContract(model.api).request(context, model, options)), []);
		});
	} finally { globalThis.fetch = originalFetch; await server.stop(); }
});
