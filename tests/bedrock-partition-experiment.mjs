import assert from "node:assert/strict";
import { referenceState } from "./pi-ai-reference.mjs";
import { createRequire } from "node:module";
import { Readable } from "node:stream";
import { writeFileSync } from "node:fs";
import { referenceRoot } from "./pi-ai-reference.mjs";
import { artifactPath } from "./test-artifacts.mjs";
import { startServer, deepDiff } from "./harness.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { replyCases } from "./corpus.mjs";
import { captureWireReply } from "./capture-wire-reply.mjs";
import { canonicalReply, compareReply } from "./canonical-reply.mjs";
import { streamPartitions, partitionBytes } from "./stream-partitions.mjs";

export async function bedrockPartitionExperiment() {
	const require = createRequire(`${referenceRoot}/packages/ai/package.json`);
	const { BedrockRuntimeClient, ConverseStreamCommand } = require("@aws-sdk/client-bedrock-runtime");
	const server = await startServer(0);
	let wire;
	let cuts = [];
	const client = new BedrockRuntimeClient({ region: "us-east-1", maxAttempts: 1,
		credentials: { accessKeyId: "mock", secretAccessKey: "mock" },
		requestHandler: { handle: async () => ({ response: { statusCode: 200, headers: wire.headers, body: Readable.from(partitionBytes(wire.body, cuts)) } }) },
	});
	const decode = async (onEvent = () => {}) => {
		const response = await client.send(new ConverseStreamCommand({ modelId: "m", messages: [{ role: "user", content: [{ text: "go" }] }] }));
		const events = [];
		for await (const event of response.stream) { events.push(event); onEvent(event); }
		return events;
	};
	const observe = async () => {
		const events = [];
		try { await decode((event) => events.push(event)); return { events }; }
		catch (error) { return { events, errorName: error.name, errorMessage: error.message }; }
	};
	const report = { api: "bedrock-converse-stream", reference: referenceState(), node: process.version, source: "Rust EventStream -> same locked AWS SDK marshaller; full pi-ai baseline separately asserted", cases: [], prefixes: [], cancellations: 0, faultsDetected: 0 };
	try {
		const model = makeModel(report.api, server.port), options = streamOptions(report.api);
		for (const tool of [false, true]) {
			const source = replyCases({ api: report.api, provider: model.provider, id: model.id })[0].message;
			source.content = [{ type: "text", text: "界😀" }];
			if (tool) source.content.push({ type: "toolCall", id: "call", name: "echo", arguments: { value: "界😀" } });
			source.stopReason = tool ? "toolUse" : "stop";
			const captured = await captureWireReply(report.api, source, model, options, server);
			assert.deepEqual(compareReply(captured.parsed, canonicalReply(report.api, source, model), deepDiff, ...captured.window), []);
			wire = captured.wire; cuts = [];
			const baseline = await decode();
			const result = { tool, bytes: wire.body.length, partitions: 0, labels: {} };
			for (const partition of streamPartitions(wire.body)) {
				cuts = partition.cuts;
				assert.deepEqual(await decode(), baseline, `${partition.label}/${cuts.join(",")}`);
				result.partitions++; result.labels[partition.label] = (result.labels[partition.label] ?? 0) + 1;
				if (partition.window) result.doubleCutWindow = partition.window;
			}
			report.cases.push(result);
			const original = wire;
			const damaged = Buffer.from(wire.body); damaged[damaged.length - 1] ^= 1;
			wire = { ...wire, body: damaged }; cuts = [];
			await assert.rejects(decode, /checksum|crc/i);
			report.faultsDetected++; wire = original;
			if (!tool) for (const length of [0, Math.floor(wire.body.length / 2), wire.body.length - 1]) {
				wire = { ...original, body: original.body.subarray(0, length) }; cuts = [];
				const whole = await observe(); cuts = Array.from({ length: Math.max(0, length - 1) }, (_, n) => n + 1);
				const fragmented = await observe();
				assert.deepEqual({ events: fragmented.events, errorName: fragmented.errorName }, { events: whole.events, errorName: whole.errorName });
				report.prefixes.push({ bytes: length, events: whole.events.length, errorName: whole.errorName, errorMessage: whole.errorMessage });
				wire = original;
			}
		}
		const abort = new AbortController();
		const source = replyCases({ api: report.api, provider: model.provider, id: model.id })[0].message;
		const cancelled = await captureWireReply(report.api, source, model, { ...options, signal: abort.signal }, server, (response) => { abort.abort(); return response; });
		assert.equal(cancelled.parsed.stopReason, "aborted", cancelled.parsed.errorMessage);
		report.cancellations++; report.cancellationPhase = "real pi-ai request cancelled before response delivery";
		writeFileSync(artifactPath("stream-bedrock-converse-stream.json"), JSON.stringify(report, null, 2));
		return report;
	} finally { client.destroy(); await server.stop(); }
}
