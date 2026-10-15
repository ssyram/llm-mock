import { writeFileSync } from "node:fs";
import { startServer, freePort, withCapture } from "./harness.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { STREAMERS } from "./matrix-lib.mjs";

const port = await freePort();
const server = await startServer(port);
const checks = [];
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
try {
	const model = makeModel("mistral-conversations", port);
	for (const mounted of [false, true]) {
		const { record } = await withCapture(server, () => STREAMERS[model.api]({ ...model, ...(mounted ? { baseUrl: server.mistralBaseUrl } : {}) },
			{ messages: [{ role: "user", content: "session", timestamp: 1 }] }, { ...streamOptions(model.api), cacheRetention: "none" }).result());
		const expectedApi = mounted ? "mistral-conversations" : "openai-completions";
		checks.push({ name: `W06-F2-${mounted ? "explicit-prefer" : "shared-ambiguous"}`, expectedApi, actualApi: record.api,
			actual: record.request, ok: record.api === expectedApi && record.request.options.sessionId === undefined });
	}
	for (const api of ["openai-codex-responses", "openai-responses", "azure-openai-responses"]) {
		const paths = ({ "openai-codex-responses": ["/backend-api/codex/responses", "/codex/responses", "/w08-mistral/backend-api/codex/responses", "/w08-mistral/codex/responses"], "openai-responses": ["/v1/responses"], "azure-openai-responses": ["/openai/v1/responses"] })[api];
		for (const path of paths) for (const stopReason of ["stop", "length", "toolUse", "error"]) for (const endTurn of [undefined, true, false]) {
			writeFileSync(server.replyPath, JSON.stringify({ content: [], api, provider: "mock", model: "m", usage, stopReason, endTurn, timestamp: 0 }));
			const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { authorization: "Bearer duality", "content-type": "application/json", ...(api === "azure-openai-responses" ? { "api-key": "duality" } : {}) },
				body: JSON.stringify({ model: "m", stream: true, input: [{ role: "user", content: [{ type: "input_text", text: "go" }] }] }) });
			const text = await response.text();
			const frames = text.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
			const terminal = frames.find((frame) => ["response.completed", "response.incomplete", "response.failed"].includes(frame.type));
			const expected = api === "openai-codex-responses" && stopReason !== "error" ? endTurn : undefined;
			const actual = terminal?.response?.end_turn;
			checks.push({ name: `${api}/wire/endTurn-${stopReason}-${endTurn}`, path, status: response.status, terminal, ...(!terminal ? { responseText: text } : {}), expected: expected ?? null, actual: actual ?? null,
				ok: response.status === 200 && terminal !== undefined && actual === expected });
		}
	}
} finally {
	await server.stop();
	writeFileSync(new URL("./w08-wire-results.json", import.meta.url), JSON.stringify({ checks }, null, 2));
}
console.log(`wire: ${checks.filter((r) => r.ok).length} pass / ${checks.filter((r) => !r.ok).length} fail`);
for (const row of checks.filter((r) => !r.ok)) console.log(`FAIL ${row.name}: expected ${row.expected}, got ${row.actual}`);
if (checks.some((row) => !row.ok)) process.exitCode = 1;
