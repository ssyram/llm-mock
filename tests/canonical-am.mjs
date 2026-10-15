import { canonicalRequestOptions } from "./canonical-request-options.mjs";
// Anthropic §4 C01–C14, default transcript/cache/OAuth-free stream domain.
import * as piAi from "./canonical-transcript.mjs";
import * as tm from "./canonical-transform-messages.mjs";
import * as sampling from "./canonical-strict-schema.mjs";
import { sanitize } from "./canonical-sanitize.mjs";

export function canonicalAm(context, model, options) {
	const transcript = piAi.resolveTranscript(piAi.normalizeContext(context), false);
	const transformed = tm.transformMessages(transcript.messages, model, (id) => id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64));
	const currentTools = piAi.getCurrentTools(transcript.messages);
	const wire = [];
	const toolNames = new Map();
	for (const msg of transformed) {
		if (msg.role === "system") continue;
		if (msg.role === "user") {
			if (typeof msg.content === "string") {
				if (msg.content.trim()) wire.push({ role: "user", content: sanitize(msg.content), timestamp: 0 });
			} else {
				const content = msg.content.flatMap((b) => b.type === "text"
					? sanitize(b.text).trim() ? [{ text: sanitize(b.text) }] : [] : [{ data: b.data, mimeType: b.mimeType }]);
				if (content.length) wire.push({ role: "user", content, timestamp: 0 });
			}
		} else if (msg.role === "assistant") {
			const same = msg.api === model.api && msg.provider === model.provider && msg.model === model.id;
			const content = msg.content.flatMap((b) => {
				if (b.type === "text") return b.text.trim() ? [{ type: "text", text: sanitize(b.text) }] : [];
				if (b.type === "toolCall") {
					toolNames.set(b.id, b.name);
					return [{ type: "toolCall", id: b.id, name: b.name, arguments: b.arguments }];
				}
				if (b.redacted) return same ? [{ type: "thinking", thinking: "[Reasoning redacted]", thinkingSignature: b.thinkingSignature, redacted: true }] : [];
				const signed = same && !!b.thinkingSignature?.trim();
				if (!b.thinking.trim() && !signed) return [];
				return signed ? [{ type: "thinking", thinking: sanitize(b.thinking), thinkingSignature: b.thinkingSignature }]
					: [{ type: "text", text: sanitize(b.thinking) }];
			});
			if (content.length) wire.push({ role: "assistant", content, api: "anthropic-messages", provider: "anthropic", model: model.id,
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 0 });
		} else if (msg.role === "toolResult") {
			if (!toolNames.has(msg.toolCallId)) throw new Error(`unpaired tool result ${msg.toolCallId}`);
			const blocks = msg.content.map((b) => b.type === "image"
				? msg.isError ? { text: "[image omitted: error tool results cannot contain images]" } : { data: b.data, mimeType: b.mimeType }
				: { text: sanitize(b.text) });
			const hasImages = blocks.some((b) => "data" in b);
			let content = hasImages ? blocks : [{ text: blocks.map((b) => b.text).join("\n") }];
			if (hasImages && !blocks.some((b) => "text" in b)) content = [{ text: "(see attached image)" }, ...blocks];
			wire.push({ role: "toolResult", toolCallId: msg.toolCallId, toolName: toolNames.get(msg.toolCallId), content, isError: msg.isError, timestamp: 0 });
		}
	}
	// The final toolResult is a wire user too; never wrap an earlier user past it.
	const last = wire.at(-1);
	if (options?.cacheRetention !== "none" && last?.role === "user" && typeof last.content === "string") last.content = [{ text: last.content }];
	const initial = transcript.messages.find((m) => m.role === "system");
	const systemText = initial ? sanitize(piAi.getSystemMessageText(initial)) : "";
	if (systemText || currentTools.length) wire.unshift({ role: "system", content: systemText, timestamp: 0,
		...(currentTools.length ? { toolsAdded: currentTools.map((tool) => {
			const parameters = sampling.getJsonSchemaToolParameters(tool, sampling.resolveJsonSchemaStrictSampling(tool, model.compat?.supportsStrictMode ?? false));
			return { name: tool.name, description: tool.description, parameters: { ...parameters, type: "object", properties: parameters.properties ?? {}, required: parameters.required ?? [] } };
		}) } : {}) });
	if (wire[0]?.toolsAdded) {
		for (const tool of wire[0].toolsAdded) {
			const original = currentTools.find((candidate) => candidate.name === tool.name);
			if (!sampling.resolveJsonSchemaStrictSampling(original, model.compat?.supportsStrictMode ?? false)) {
				const { properties, required } = tool.parameters;
				tool.parameters = { type: "object", properties, required };
			}
		}
	}
	return { model: model.id, context: { messages: wire }, options: canonicalRequestOptions(model.api, model, options) };
}
