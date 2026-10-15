import { canonicalRequestOptions } from "./canonical-request-options.mjs";
import { sanitize } from "./canonical-sanitize.mjs";
import * as piAi from "./canonical-transcript.mjs";
import * as tm from "./canonical-transform-messages.mjs";
import * as text from "./canonical-transcript.mjs";
import * as sampling from "./canonical-strict-schema.mjs";
import { shortHash } from "./canonical-occ.mjs";

function idNormalizer() {
	const ids = new Map();
	const owners = new Map();
	return (id) => {
		if (ids.has(id)) return ids.get(id);
		const clean = id.replace(/[^a-zA-Z0-9]/g, "");
		for (let attempt = 0; ; attempt++) {
			const seed = attempt ? `${clean || id}:${attempt}` : clean || id;
			const candidate = !attempt && clean.length === 9 ? clean : shortHash(seed).replace(/[^a-zA-Z0-9]/g, "").slice(0, 9);
			if (owners.has(candidate) && owners.get(candidate) !== id) continue;
			ids.set(id, candidate);
			owners.set(candidate, id);
			return candidate;
		}
	};
}

export function canonicalMistral(context, model, options) {
	const transcript = piAi.resolveTranscript(piAi.normalizeContext(context), false);
	const transformed = tm.transformMessages(transcript.messages, model, idNormalizer());
	const messages = [];
	const tools = piAi.getCurrentTools(transcript.messages).map((tool) => ({ name: tool.name, description: tool.description,
		parameters: sampling.getJsonSchemaToolParameters(tool, sampling.resolveJsonSchemaStrictSampling(tool, true)) }));
	for (const msg of transformed) {
		if (msg.role === "system") {
			const content = sanitize(text.getSystemMessageText(msg));
			if (content) messages.push({ role: "system", content, timestamp: 0 });
		} else if (msg.role === "user") {
			if (typeof msg.content === "string") messages.push({ role: "user", content: sanitize(msg.content), timestamp: 0 });
			else {
				const content = msg.content.flatMap((b) => b.type === "text" ? [{ text: sanitize(b.text) }]
					: model.input.includes("image") ? [{ data: b.data, mimeType: b.mimeType }] : []);
				if (!content.length && msg.content.some((b) => b.type === "image")) content.push({ text: "(image omitted: model does not support images)" });
				if (content.length) messages.push({ role: "user", content: content.length === 1 && content[0].text !== undefined ? content[0].text : content, timestamp: 0 });
			}
		} else if (msg.role === "assistant") {
			// mistral-conversations.ts:840–858 emits text/thinking chunks in source order.
			const content = msg.content.flatMap((b) => {
				if (b.type === "thinking" && b.thinking.trim()) return [{ type: "thinking", thinking: sanitize(b.thinking) }];
				if (b.type === "text" && b.text.trim()) return [{ type: "text", text: sanitize(b.text) }];
				return [];
			});
			for (const b of msg.content.filter((b) => b.type === "toolCall")) content.push({ type: "toolCall", id: b.id, name: b.name, arguments: structuredClone(b.arguments) });
			if (content.length) messages.push({ role: "assistant", content, api: "mistral-conversations", provider: "mistral", model: model.id,
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 0 });
		} else {
			const text = msg.content.filter((b) => b.type === "text").map((b) => sanitize(b.text)).join("\n").trim();
			const images = msg.content.some((b) => b.type === "image");
			let output = text || (images ? model.input.includes("image") ? "(see attached image)" : "(image omitted: model does not support images)" : "(no tool output)");
			if (text && images && !model.input.includes("image")) output += "\n[tool image omitted: model does not support images]";
			if (msg.isError) output = `[tool error] ${output}`;
			messages.push({ role: "toolResult", toolCallId: msg.toolCallId, toolName: msg.toolName, content: [{ text: output }, ...msg.content.filter((b) => b.type === "image" && model.input.includes("image")).map((b) => ({ data: b.data, mimeType: b.mimeType }))], isError: false, timestamp: 0 });
		}
	}
	if (tools.length) {
		if (messages[0]?.role !== "system") messages.unshift({ role: "system", content: "", timestamp: 0 });
		messages[0].toolsAdded = tools;
	}
	return { model: model.id, context: { messages }, options: canonicalRequestOptions(model.api, model, options) };
}
