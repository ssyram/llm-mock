import { canonicalOresThinking } from "./canonical-ores.mjs";
import { shortHash } from "./canonical-short-hash.mjs";
import { responseTextSignature } from "./canonical-responses-identity.mjs";

export function fillResponses(out) {
	if (["pending", "aborted", "deferred"].includes(out.stopReason)) throw new Error(`Responses encoder rejects ${out.stopReason}`);
	delete out.responseModel;
	if (out.api !== "openai-codex-responses" || out.stopReason === "error") delete out.endTurn;
	out.responseId ??= "resp_mock";
	delete out.usage.cacheWrite1h;
	out.usage.reasoning ??= 0;
	for (let index = 0; index < out.content.length; index++) {
		const block = out.content[index];
		delete block.redacted;
		delete block.thoughtSignature;
		if (block.type === "text") block.textSignature = JSON.stringify(responseTextSignature(block.textSignature, `msg_${index}`));
		if (block.type === "thinking") Object.assign(block, canonicalOresThinking(block, index));
		if (block.type === "toolCall") {
			const separator = block.id.indexOf("|");
			const call = separator < 0 ? block.id : block.id.slice(0, separator);
			const item = separator < 0 ? `fc_${shortHash(call)}` : block.id.slice(separator + 1);
			block.id = `${call}|${item}`;
		}
	}
	if (out.stopReason === "error") {
		if (out.api === "openai-codex-responses") {
			delete out.rawStopReason;
			out.errorMessage = out.errorMessage === undefined ? "unknown error" : out.errorMessage || "Codex response failed";
		} else {
			out.rawStopReason = "failed";
			out.errorMessage = `server_error: ${out.errorMessage === undefined ? "unknown error" : out.errorMessage || "no message"}`;
		}
		out.usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
	} else {
		delete out.errorMessage;
		out.rawStopReason = out.stopReason === "length" ? "incomplete.max_output_tokens" : "completed";
		if (out.stopReason !== "length") out.stopReason = out.content.some((b) => b.type === "toolCall") ? "toolUse" : "stop";
	}
}
