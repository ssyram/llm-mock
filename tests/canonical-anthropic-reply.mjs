// Anthropic §4 C15–C17; no expected value comes from the parsed response.
export function fillAnthropic(out, model, source) {
	out.responseId ??= "msg_mock";
	delete out.responseModel;
	if (source.model !== model.id) out.responseModel = source.model;
	delete out.endTurn;
	out.usage.cacheWrite1h ??= 0;
	for (const block of out.content) {
		delete block.textSignature;
		delete block.thoughtSignature;
		delete block.namespace;
		if (block.type === "thinking") {
			block.thinkingSignature ??= "";
			if (block.redacted) block.thinking = "[Reasoning redacted]";
			else delete block.redacted;
		}
	}
	const raw = ({ stop: "end_turn", length: "max_tokens", toolUse: "tool_use" })[out.stopReason] ?? "refusal";
	out.rawStopReason = raw;
	if (raw === "refusal") {
		out.stopReason = "error";
		out.errorMessage ||= "The model refused to complete the request";
	} else delete out.errorMessage;
	if (model.compat?.supportsMidConvoEffort) out.providerThinkingLevel = "high";
}
