import { streamedReasoningDetails, appendReasoningDetail } from "./canonical-occ-reasoning.mjs";

const REASONING_FIELDS = ["reasoning", "reasoning_content", "reasoning_text"];

export function fillCompletions(out, _unused, model) {
	if (out.usage) {
		out.usage.reasoning ??= 0;
		delete out.usage.cacheWrite1h;
	}
	if (!out.responseId) delete out.responseId;
	if (!out.responseModel || out.responseModel === model?.id) delete out.responseModel;
	delete out.endTurn;
	const rebuilt = [];
	let textSlot;
	let thinkingSlot;
	const details = [];
	for (const b of out.content) {
		if (b.type === "text") {
			if (!b.text.length) continue;
			if (!textSlot) {
				textSlot = { type: "text", text: "" };
				rebuilt.push(textSlot);
			}
			textSlot.text += b.text;
		} else if (b.type === "thinking") {
			const emitted = streamedReasoningDetails(b.thinkingSignature);
			if (!b.thinking.length && !emitted.length) continue;
			if (!thinkingSlot) {
				const sig = b.thinking.length
					? REASONING_FIELDS.includes(b.thinkingSignature) ? b.thinkingSignature : "reasoning_content" : "";
				thinkingSlot = { type: "thinking", thinking: "", thinkingSignature: sig };
				rebuilt.push(thinkingSlot);
			}
			thinkingSlot.thinking += b.thinking;
			for (const detail of emitted) appendReasoningDetail(details, detail);
		} else {
			const existing = rebuilt.find((block) => block.type === "toolCall" && block.id === b.id);
			if (existing) {
				existing.name ||= b.name;
				// pi-ai 1.4 openai-completions decode: a repeated tool-call id is
				// routed back to the FIRST block (id lookup wins once the second
				// delta carries the same id), so the arguments texts concatenate;
				// finishBlock then parses strictly (parseToolCallArguments) and the
				// call lands as {} + argumentsError instead of the v1.2 lenient
				// prefix parse.
				const first = JSON.stringify(existing.arguments ?? {});
				const second = JSON.stringify(b.arguments ?? {});
				existing.arguments = {};
				existing.argumentsError = `Unexpected non-whitespace character after JSON at position ${first.length} (line 1 column ${first.length + 1})\n\nReceived arguments:\n${first}${second}`;
			} else {
				const { type, id, name, arguments: args } = b;
				rebuilt.push({ type, id, name, arguments: args });
			}
		}
	}
	if (details.length) thinkingSlot.thinkingSignature = JSON.stringify(details);
	out.content = rebuilt;
	if (["pending", "aborted", "deferred"].includes(out.stopReason)) throw new Error(`Completions encoder rejects ${out.stopReason}`);
	const match = /^Provider finish_reason: (.+)$/.exec(out.errorMessage ?? "");
	const raw = out.stopReason === "error" ? match?.[1] ?? "error" : ({ stop: "stop", length: "length", toolUse: "tool_calls" })[out.stopReason];
	out.rawStopReason = raw;
	delete out.errorMessage;
	out.stopReason = ({ stop: "stop", end: "stop", length: "length", function_call: "toolUse", tool_calls: "toolUse" })[raw] ?? "error";
	if (out.stopReason === "error") out.errorMessage = `Provider finish_reason: ${raw}`;
}
