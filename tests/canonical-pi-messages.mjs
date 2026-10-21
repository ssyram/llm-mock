import { canonicalRequestOptions } from "./canonical-request-options.mjs";
import * as piAi from "./canonical-transcript.mjs";

const pick = (value, keys) => Object.fromEntries(keys
	.filter((key) => value[key] !== undefined && value[key] !== null)
	.map((key) => [key, structuredClone(value[key])]));
const record = (value, keys) => Object.fromEntries(keys.filter((key) => value[key] !== undefined).map((key) => [key, structuredClone(value[key])]));
const text = (block) => pick(block, ["text", "textSignature"]);
const image = (block) => pick(block, ["data", "mimeType"]);
const userBlock = (block) => block.type === "image" || "data" in block ? image(block) : text(block);
const tool = (value) => pick(value, ["name", "description", "parameters", "constrainedSampling"]);

// This protocol has no transcript resolution or transformMessages replay step.
export function canonicalPiMessages(context, model, options) {
	const normalized = piAi.normalizeContext(context);
	const messages = normalized.messages.map((message) => {
		if (message.role === "system") {
			const out = pick(message, ["role", "timestamp", "toolsRemoved"]);
			out.content = typeof message.content === "string" ? message.content : message.content.map(text);
			if (message.sections != null) out.sections = structuredClone(message.sections);
			if (message.toolsAdded != null) out.toolsAdded = message.toolsAdded.map(tool);
			return out;
		}
		if (message.role === "user") return {
			...pick(message, ["role", "timestamp"]),
			content: typeof message.content === "string" ? message.content : message.content.map(userBlock),
		};
		if (message.role === "toolResult") return {
			...pick(message, ["role", "toolCallId", "toolName", "isError", "timestamp", "durationMs"]),
			...record(message, ["details", "usage", "nestedCalls"]),
			content: message.content.map(userBlock),
		};
		const out = pick(message, ["role", "api", "provider", "model", "responseModel", "responseId",
			"providerThinkingLevel", "thinkingLevel", "stopReason", "errorMessage", "rawStopReason", "endTurn", "timestamp", "durationMs"]);
		Object.assign(out, record(message, ["diagnostics", "deferred", "nestedCalls"]));
		out.usage = pick(message.usage, ["input", "output", "cacheRead", "cacheWrite", "cacheWrite1h", "reasoning", "totalTokens", "cost"]);
		out.content = message.content.map((block) => pick(block, block.type === "text"
			? ["type", "text", "textSignature"] : block.type === "thinking"
				? ["type", "thinking", "thinkingSignature", "redacted"]
				: ["type", "id", "name", "arguments", "thoughtSignature", "namespace"]));
		return out;
	});
	return { model: model.id, context: { messages }, options: canonicalRequestOptions(model.api, model, options) };
}
