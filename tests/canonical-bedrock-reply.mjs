// bedrock-converse-stream.ts:137-153,605-720,1185-1198.
export function fillBedrock(out) {
	delete out.responseId;
	delete out.responseModel;
	if (out.usage) delete out.usage.reasoning;
	delete out.endTurn;
	for (const block of out.content) {
		delete block.textSignature;
		delete block.thoughtSignature;
		delete block.namespace;
		if (block.type === "thinking") {
			block.thinkingSignature ??= "";
			if (block.redacted === true) {
				const bytes = Buffer.from(block.thinkingSignature, "base64");
				block.thinking = bytes.length ? "[Reasoning redacted]" : "";
				block.thinkingSignature = bytes.toString("base64");
				if (!bytes.length) delete block.redacted;
			} else delete block.redacted;
		}
	}
	if (out.stopReason === "pending") throw new Error("Bedrock encoder rejects pending");
	out.rawStopReason = ({ stop: "end_turn", length: "max_tokens", toolUse: "tool_use", error: "guardrail_intervened", aborted: "guardrail_intervened", deferred: "end_turn" })[out.stopReason];
	if (out.stopReason === "deferred") out.stopReason = "stop";
	if (["error", "aborted"].includes(out.stopReason)) {
		out.stopReason = "error";
		out.errorMessage = "Provider stopped with: guardrail_intervened";
	} else delete out.errorMessage;
}
