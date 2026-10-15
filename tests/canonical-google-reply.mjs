export function requiresGoogleToolId(model) {
	return /^(claude-|gpt-oss-)/.test(model.id) || Number(/gemini-(\d+)/.exec(model.id)?.[1]) >= 3;
}

const ERRORS = new Set(["BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "SAFETY", "IMAGE_SAFETY", "IMAGE_PROHIBITED_CONTENT", "IMAGE_RECITATION", "IMAGE_OTHER", "RECITATION", "FINISH_REASON_UNSPECIFIED", "OTHER", "LANGUAGE", "MALFORMED_FUNCTION_CALL", "UNEXPECTED_TOOL_CALL", "TOO_MANY_TOOL_CALLS", "NO_IMAGE"]);

export function fillGoogle(out, model, source = out) {
	delete out.responseModel;
	delete out.endTurn;
	if (!out.responseId) delete out.responseId;
	delete out.usage.cacheWrite1h;
	out.usage.cacheWrite = 0;
	out.usage.reasoning ??= 0;
	out.usage.output = Math.max(out.usage.output, out.usage.reasoning);
	const rebuilt = [];
	const ids = new Set();
	let counter = 0;
	for (const original of out.content) {
		const block = structuredClone(original);
		delete block.redacted;
		delete block.namespace;
		if (block.type === "toolCall") {
			if (!requiresGoogleToolId({ id: source.model }) || !block.id || ids.has(block.id)) block.id = `@pi-generated:${++counter}`;
			ids.add(block.id);
			if (!block.thoughtSignature) delete block.thoughtSignature;
			block.arguments ??= {};
		} else {
			const signature = block.type === "text" ? "textSignature" : "thinkingSignature";
			if (!block[signature]) delete block[signature];
		}
		const last = rebuilt.at(-1);
		if (["text", "thinking"].includes(block.type) && last?.type === block.type) {
			const text = block.type === "text" ? "text" : "thinking";
			const signature = block.type === "text" ? "textSignature" : "thinkingSignature";
			last[text] += block[text];
			if (block[signature]) last[signature] = block[signature];
		} else rebuilt.push(block);
	}
	out.content = rebuilt;
	const raw = ["stop", "toolUse"].includes(out.stopReason) ? "STOP" : out.stopReason === "length" ? "MAX_TOKENS" : out.rawStopReason ?? "OTHER";
	out.rawStopReason = raw;
	delete out.errorMessage;
	if (raw === "STOP") out.stopReason = out.content.some((b) => b.type === "toolCall") ? "toolUse" : "stop";
	else if (raw === "MAX_TOKENS") out.stopReason = "length";
	else if (ERRORS.has(raw)) {
		out.stopReason = "error";
		out.errorMessage = `Provider stopped with: ${raw}`;
	} else throw new Error(`Unknown Google finishReason: ${raw}`);
}
