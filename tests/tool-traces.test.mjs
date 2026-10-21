import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { artifactPath } from "./test-artifacts.mjs";
import { referenceState } from "./pi-ai-reference.mjs";
import { protocolSelection } from "./protocol-prerequisites.mjs";
import { PROVIDER_CONTRACTS as ALL_CONTRACTS } from "./provider-contracts.mjs";
import { traceLanguage } from "./trace-language.mjs";
import { startTraceServer, runTraceScenario } from "./trace-driver.mjs";
const { available: PROVIDER_CONTRACTS, skipped: skippedProtocols } = protocolSelection(ALL_CONTRACTS);

const language = [...traceLanguage()];
assert.equal(language.length, 35);
test("bounded 0-2 tool language: names, IDs, errors and real completion barriers across available APIs", { timeout: 300000 }, async (t) => {
	const server = await startTraceServer();
	const rows = [];
	try {
		for (const { api } of PROVIDER_CONTRACTS) for (const oldGoogle of [false, ...(["google-generative-ai", "google-vertex"].includes(api) ? [true] : [])]) {
			for (const scenario of language) rows.push(await runTraceScenario(server, api, api, scenario, { oldGoogle }));
		}
		assert.equal(rows.length, language.length * (PROVIDER_CONTRACTS.length + PROVIDER_CONTRACTS.filter(({ api }) => ["google-generative-ai", "google-vertex"].includes(api)).length));
		writeFileSync(artifactPath("tool-traces.json"), JSON.stringify({ reference: referenceState(), node: process.version, skippedProtocols, language: "0 tools; 1 echo tool with either result; 2 tools with first echo, second echo/other, distinct/colliding IDs, all 4 result flags, both completion orders", cases: rows }, null, 2));
		t.diagnostic(JSON.stringify({ traces: rows.length, executions: rows.reduce((n, row) => n + row.executions, 0), collisions: rows.filter((r) => r.sourceIdCollision).length }));
	} finally { await server.stop(); }
});

test("all directed available-provider transitions preserve the declared request/reply composition", { timeout: 300000 }, async (t) => {
	const server = await startTraceServer();
	const rows = [], scenario = { count: 2, sameName: true, sameId: false, errors: [false, true], order: [1, 0] };
	try {
		for (const from of PROVIDER_CONTRACTS) for (const to of PROVIDER_CONTRACTS.filter((p) => p.api !== from.api)) rows.push(await runTraceScenario(server, from.api, to.api, scenario));
		assert.equal(rows.length, PROVIDER_CONTRACTS.length * (PROVIDER_CONTRACTS.length - 1));
		writeFileSync(artifactPath("provider-transitions.json"), JSON.stringify({ reference: referenceState(), node: process.version, skippedProtocols, cases: rows }, null, 2));
		t.diagnostic(JSON.stringify({ transitions: rows.length }));
	} finally { await server.stop(); }
});

test("trace checks detect actual duplicate executor calls and missing fixture receipts", async () => {
	const scenario = { count: 1, sameName: true, sameId: false, errors: [false], order: [0] };
	const server = await startTraceServer();
	try { await assert.rejects(() => runTraceScenario(server, "pi-messages", "pi-messages", scenario, { fault: "duplicate-execution" }), /execution count/); }
	finally { await server.stop(); }
	for (const field of ["all", "api", "model", "keyId", "sessionSignal"]) {
		const corrupt = await startTraceServer(field === "all" ? "envelope" : `envelope:${field}`);
		try { await assert.rejects(() => runTraceScenario(corrupt, "pi-messages", "pi-messages", scenario), /script envelope/); }
		finally { await corrupt.stop(); }
	}
	const broken = await startTraceServer("drop-result");
	try { await assert.rejects(() => runTraceScenario(broken, "pi-messages", "pi-messages", scenario), /reply canonical/); }
	finally { await broken.stop(); }
});
