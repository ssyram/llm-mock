import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { protocolSelection } from "./protocol-prerequisites.mjs";
import { PROVIDER_CONTRACTS as ALL_CONTRACTS } from "./provider-contracts.mjs";
import { artifactPath } from "./test-artifacts.mjs";
import { referenceState } from "./pi-ai-reference.mjs";
import { startServer } from "./harness.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { replyCases } from "./corpus.mjs";
import { captureWireReply } from "./capture-wire-reply.mjs";
const { available: PROVIDER_CONTRACTS, skipped: skippedProtocols } = protocolSelection(ALL_CONTRACTS);

function textPrefix(bytes, binary) {
	const marker = bytes.indexOf(Buffer.from("界😀"));
	assert.ok(marker >= 0);
	if (!binary) {
		const end = bytes.indexOf(Buffer.from("\n\n"), marker);
		assert.ok(end > marker);
		return end + 2;
	}
	for (let offset = 0; offset < bytes.length;) {
		const length = bytes.readUInt32BE(offset);
		if (marker < offset + length) return offset + length;
		offset += length;
	}
	throw new Error("no text EventStream frame");
}

test("real HTTP response remains unfinished until the locked client cancels after its first text delta", { timeout: 120000 }, async (t) => {
	const server = await startServer(0), rows = [];
	try {
		for (const contract of PROVIDER_CONTRACTS) {
			const model = makeModel(contract.api, server.port), abort = new AbortController();
			const source = replyCases({ api: contract.api, provider: model.provider, id: model.id })[0].message;
			source.content = [{ type: "text", text: "界😀" }, { type: "toolCall", id: "call", name: "echo", arguments: { value: "not executed after cancel" } }];
			source.stopReason = "toolUse";
			let sawDelta = false, sentBytes;
			const toolEvents = [];
			const deadline = setTimeout(() => abort.abort(), 5000);
			try {
				const result = await captureWireReply(contract.api, source, model, { ...streamOptions(contract.api), signal: abort.signal }, server, undefined, {
					prefixLength: (bytes) => { sentBytes = textPrefix(bytes, contract.api === "bedrock-converse-stream"); assert.ok(sentBytes < bytes.length); return sentBytes; },
					onEvent: (event) => {
						if (event.type.startsWith("toolcall_")) toolEvents.push(event.type);
						if (event.type === "text_delta") { sawDelta = true; abort.abort(); }
					},
				});
				assert.equal(sawDelta, true, `${contract.api}: cancelled by delta, not timeout`);
				assert.equal(result.parsed.stopReason, "aborted", `${contract.api}: ${result.parsed.errorMessage}`);
				assert.equal(result.connection.unfinished, true, `${contract.api}: transport closed before response end`);
				assert.deepEqual(toolEvents, [], `${contract.api}: no tool events after cancellation`);
				assert.equal(result.parsed.content.some((block) => block.type === "toolCall"), false);
				rows.push({ api: contract.api, sentBytes, totalBytes: result.wire.body.length, sawDelta, stopReason: result.parsed.stopReason, incompleteConnectionClosed: true, toolEvents });
			} finally { clearTimeout(deadline); }
		}
		writeFileSync(artifactPath("stream-transport-cancel.json"), JSON.stringify({ reference: referenceState(), node: process.version, skippedProtocols, cases: rows }, null, 2));
		t.diagnostic(JSON.stringify({ cancelledLiveResponses: rows.length }));
	} finally { await server.stop(); }
});
