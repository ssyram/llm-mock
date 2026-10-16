import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { artifactPath } from "./test-artifacts.mjs";
import { startServer, deepDiff } from "./harness.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { replyCases } from "./corpus.mjs";
import { canonicalReply, compareReply } from "./canonical-reply.mjs";
import { captureWireReply } from "./capture-wire-reply.mjs";
import { streamPartitions } from "./stream-partitions.mjs";
import { replaySse } from "./replay-sse.mjs";
import { referenceState } from "./pi-ai-reference.mjs";

export async function ssePartitionExperiment(api) {
	const server = await startServer(0);
	const report = { api, reference: referenceState(), node: process.version, source: "Rust HTTP encoder -> locked pi-ai parser", cases: [], cancellations: 0, prefixes: [], faultsDetected: 0 };
	try {
		const model = makeModel(api, server.port), options = streamOptions(api);
		for (const tool of [false, true]) {
			const source = replyCases({ api, provider: model.provider, id: model.id })[0].message;
			source.content = [{ type: "text", text: "界😀" }];
			if (tool) source.content.push({ type: "toolCall", id: "call|fc_item", name: "echo", arguments: { value: "界😀" } });
			source.stopReason = tool ? "toolUse" : "stop";
			const captured = await captureWireReply(api, source, model, options, server);
			const expected = canonicalReply(api, source, model);
			assert.deepEqual(compareReply(captured.parsed, expected, deepDiff, ...captured.window), []);
			const result = { tool, bytes: captured.wire.body.length, partitions: 0, labels: {} };
			for (const partition of streamPartitions(captured.wire.body)) {
				const replay = await replaySse(api, captured.model, options, captured.wire, partition.cuts);
				const diffs = compareReply(replay.parsed, expected, deepDiff, ...replay.window);
				assert.deepEqual(diffs, [], `${api}/${tool}/${partition.label}/${partition.cuts.join(",")}`);
				result.partitions++; result.labels[partition.label] = (result.labels[partition.label] ?? 0) + 1;
				if (partition.window) result.doubleCutWindow = partition.window;
			}
			report.cases.push(result);
			if (tool) continue;
			const length = captured.wire.body.length;
			for (const size of [...new Set([0, Math.floor(length / 2), length - 1])]) {
				const prefix = { ...captured.wire, body: captured.wire.body.subarray(0, size) };
				const baseline = await replaySse(api, captured.model, options, prefix, []);
				const replay = await replaySse(api, captured.model, options, prefix, Array.from({ length: Math.max(0, size - 1) }, (_, n) => n + 1));
				assert.deepEqual(compareReply(replay.parsed, baseline.parsed, deepDiff, ...replay.window), [], `${api}/prefix-${size}`);
				report.prefixes.push({ bytes: size, stopReason: baseline.parsed.stopReason, contentBlocks: baseline.parsed.content.length, errorMessage: baseline.parsed.errorMessage });
			}
			const cancelled = await replaySse(api, captured.model, options, captured.wire, [Math.floor(length / 2)], 1);
			assert.equal(cancelled.aborted, true);
			assert.equal(cancelled.parsed.stopReason, "aborted", `${api}: ${cancelled.parsed.errorMessage}`);
			report.cancellations++;
			const mutant = { ...captured.wire, body: Buffer.from(captured.wire.body.toString().replaceAll("界", "错")) };
			assert.notDeepEqual(mutant.body, captured.wire.body);
			const broken = await replaySse(api, captured.model, options, mutant, []);
			assert.ok(compareReply(broken.parsed, expected, deepDiff, ...broken.window).length, `${api}: mutated Rust response went undetected`);
			report.faultsDetected++;
		}
		writeFileSync(artifactPath(`stream-${api}.json`), JSON.stringify(report, null, 2));
		return report;
	} finally { await server.stop(); }
}
