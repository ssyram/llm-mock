import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { withCapture, startServer, deepDiff } from "./harness.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { providerContract } from "./provider-contracts.mjs";
import { STREAMERS } from "./matrix-lib.mjs";
import { piAi } from "./pi-ai-imports.mjs";
import { canonicalReply, compareReply } from "./canonical-reply.mjs";
import { traceReply, traceFinal, traceTools } from "./trace-language.mjs";
import { executeTrace } from "./trace-executor.mjs";

export async function startTraceServer(fault) {
	const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
	const command = `${quote(process.execPath)} ${quote(fileURLToPath(new URL("./trace-script.mjs", import.meta.url)))}${fault === "drop-result" ? " --fault-drop-result" : ""}`;
	return startServer(0, {}, { type: "script", command });
}
export function traceModel(api, port, oldGoogle = false) {
	const model = makeModel(api, port);
	if (["google-generative-ai", "google-vertex"].includes(api) && !oldGoogle) model.id = "gemini-3-test";
	return model;
}
async function step(api, model, context, server, expectedSource) {
	const options = streamOptions(api), started = Date.now();
	const cap = await withCapture(server, () => STREAMERS[api](model, piAi.normalizeContext(context), { ...options, signal: AbortSignal.timeout(10000) }).result());
	const expectedRequest = providerContract(api).request(context, model, options);
	assert.equal(cap.record.api, api);
	assert.deepEqual(deepDiff(cap.record.request, expectedRequest, [], "$", [], api), [], "request canonical");
	assert.deepEqual(compareReply(cap.value, canonicalReply(api, expectedSource, model), deepDiff, started, Date.now()), [], "reply canonical");
	return { parsed: cap.value, decoded: cap.record.request };
}
async function driveTrace(server, from, to, scenario, options = {}) {
	const firstModel = traceModel(from, server.port, options.oldGoogle);
	const context = { messages: [{ role: "system", content: "bounded trace", toolsAdded: structuredClone(traceTools), timestamp: 1 },
		{ role: "user", content: JSON.stringify(scenario), timestamp: 2 }] };
	const firstSource = traceReply(scenario, from, firstModel.id);
	const first = await step(from, firstModel, context, server, firstSource);
	const calls = first.parsed.content.filter((block) => block.type === "toolCall");
	const expectedCalls = canonicalReply(from, firstSource, firstModel).content.filter((block) => block.type === "toolCall");
	const execution = await executeTrace(calls, expectedCalls, scenario, options.fault);
	const report = { from, to, scenario, oldGoogle: Boolean(options.oldGoogle), sourceCalls: scenario.count, parsedCalls: calls.length,
		executions: execution.effects.length, completionOrder: execution.completionOrder, sourceIdCollision: scenario.sameId && scenario.count > 1 };
	if (!calls.length) { assert.equal(first.parsed.stopReason, "stop"); return report; }
	context.messages.push(first.parsed, ...execution.results);
	const targetModel = traceModel(to, server.port, options.oldGoogle && from === to);
	const projected = providerContract(to).request(context, targetModel, streamOptions(to));
	const source = traceFinal(projected.context.messages, to, projected.model);
	const final = await step(to, targetModel, context, server, source);
	assert.equal(final.parsed.content.some((block) => block.type === "toolCall"), false, "no repeated tool execution");
	assert.equal(final.parsed.stopReason, "stop");
	report.decodedToolResults = final.decoded.context.messages.filter((message) => message.role === "toolResult").length;
	return report;
}

export async function runTraceScenario(server, from, to, scenario, options = {}) {
	try { return await driveTrace(server, from, to, scenario, options); }
	catch (error) { throw new Error(`${from}->${to}/${JSON.stringify(scenario)}/${JSON.stringify(options)}: ${error.message}`, { cause: error }); }
}
