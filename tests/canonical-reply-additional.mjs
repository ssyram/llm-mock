import { sanitize } from "./canonical-sanitize.mjs";

export function fillMistral(out) {
	out.responseId ||= "mock-mistral";
	delete out.responseModel;
	delete out.endTurn;
	if (out.usage) {
		delete out.usage.reasoning;
		delete out.usage.cacheWrite1h;
		out.usage.cacheWrite = 0; // mistral-conversations.ts:616-626: parser assigns zero
	}
	const content = [];
	for (const original of out.content) {
		const block = structuredClone(original);
		delete block.textSignature;
		delete block.thinkingSignature;
		delete block.redacted;
		delete block.thoughtSignature;
		delete block.namespace;
		if (block.type === "text") block.text = sanitize(block.text);
		if (block.type === "thinking") block.thinking = sanitize(block.thinking);
		if ((block.type === "text" && !block.text) || (block.type === "thinking" && !block.thinking)) continue;
		const last = content.at(-1);
		if (block.type === "text" && last?.type === "text") last.text += block.text;
		else if (block.type === "thinking" && last?.type === "thinking") last.thinking += block.thinking;
		else content.push(block);
	}
	out.content = content;
	if (out.stopReason === "pending") throw new Error("Mistral encoder rejects pending");
	const raw = ({ stop: "stop", length: "length", toolUse: "tool_calls", error: "error", aborted: "abort", deferred: "stop" })[out.stopReason];
	out.rawStopReason = raw;
	delete out.errorMessage;
	out.stopReason = ({ stop: "stop", length: "length", tool_calls: "toolUse" })[raw] ?? "error";
	if (out.stopReason === "error") out.errorMessage = raw === "error" ? "Provider stopped with: error (server error)" : `Provider stopped with: ${raw}`;
}

export function fillPiMessages(out, _model, source = out) {
	if (["pending", "deferred"].includes(out.stopReason)) throw new Error(`pi-messages encoder rejects ${out.stopReason}`);
	if (source.providerThinkingLevel !== undefined) out.providerThinkingLevel = source.providerThinkingLevel;
	for (const field of ["responseModel", "thinkingLevel", "rawStopReason", "endTurn", "durationMs"]) delete out[field];
	if (!["error", "aborted"].includes(out.stopReason)) delete out.errorMessage;
}
