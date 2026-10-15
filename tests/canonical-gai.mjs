import { canonicalRequestOptions } from "./canonical-request-options.mjs";
// canonical for google-generative-ai: decode(convert(C)) ≡ canonical(C).
// Reference: docs/design/mock-llm-server/api/google-generative-ai.md (§a/§b).
// Harness model "mock-gemini" → requiresToolCallId=false (functionCall carries
// no id; decode backfills id with the tool name — declared lossy point ①),
// supportsMultimodalFunctionResponse=true, no strict tool sampling.
import { sanitize } from "./canonical-sanitize.mjs";
import { requiresGoogleToolId } from "./canonical-google-reply.mjs";
import * as piAi from "./canonical-transcript.mjs";
import * as tm from "./canonical-transform-messages.mjs";
import * as sampling from "./canonical-strict-schema.mjs";

const { getSystemMessageText } = piAi;
const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
const zeroUsage = () => ({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { ...ZERO_COST },
});

const isValidThoughtSignature = (sig) =>
	typeof sig === "string" && sig.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(sig);

export function canonicalGai(context, model, options) {
	const collapsed = piAi.collapseSystemMessages(piAi.normalizeContext(context));
	const conversation = piAi.withoutInitialSystemMessage(collapsed.messages);
	const initialSystem = collapsed.messages.find((m) => m.role === "system");
	const currentTools = piAi.getCurrentTools(collapsed.messages);
	const transformed = tm.transformMessages(conversation, model, (id) => id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64));

	// --- wire contents (google-shared.ts convertMessages) ---
	const contents = [];
	for (const msg of transformed) {
		if (msg.role === "user") {
			const parts =
				typeof msg.content === "string"
					? [{ text: sanitize(msg.content) }]
					: msg.content.map((b) =>
							b.type === "text" ? { text: sanitize(b.text) } : { inlineData: { mimeType: b.mimeType, data: b.data } },
						);
			if (parts.length === 0) continue;
			contents.push({ role: "user", parts });
		} else if (msg.role === "assistant") {
			const isSame = msg.provider === model.provider && msg.model === model.id;
			const parts = [];
			for (const block of msg.content) {
				if (block.type === "text") {
					const sig = isSame && isValidThoughtSignature(block.textSignature) ? block.textSignature : undefined;
					if ((!block.text || block.text.trim() === "") && !sig) continue;
					parts.push({ text: sanitize(block.text), ...(sig ? { thoughtSignature: sig } : {}) });
				} else if (block.type === "thinking") {
					if (isSame) {
						const sig = isValidThoughtSignature(block.thinkingSignature) ? block.thinkingSignature : undefined;
						if ((!block.thinking || block.thinking.trim() === "") && !sig) continue;
						parts.push({ thought: true, text: sanitize(block.thinking), ...(sig ? { thoughtSignature: sig } : {}) });
					} else {
						if (!block.thinking || block.thinking.trim() === "") continue;
						parts.push({ text: sanitize(block.thinking) });
					}
				} else if (block.type === "toolCall") {
					const signature = isSame && isValidThoughtSignature(block.thoughtSignature) ? block.thoughtSignature : undefined;
					parts.push({ functionCall: { name: block.name, args: block.arguments, ...(requiresGoogleToolId(model) ? { id: block.id } : {}) }, ...(signature ? { thoughtSignature: signature } : {}) });
				}
			}
			if (parts.length === 0) continue;
			contents.push({ role: "model", parts });
		} else if (msg.role === "toolResult") {
			const images = msg.content.filter((b) => b.type === "image");
			const text = sanitize(msg.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"));
			const value = text || (images.length ? "(see attached image)" : "");
			const nestedImages = !model.id.includes("gemini-") || Number(/gemini-(\d+)/.exec(model.id)?.[1]) >= 3;
			const part = {
				functionResponse: {
					name: msg.toolName,
					...(requiresGoogleToolId(model) ? { id: msg.toolCallId } : {}),
					...(nestedImages && images.length ? { images } : {}),
					response: msg.isError ? { error: value } : { output: value },
				},
			};
			const last = contents[contents.length - 1];
			if (last?.role === "user" && last.parts.some((p) => p.functionResponse)) {
				last.parts.push(part);
			} else {
				contents.push({ role: "user", parts: [part] });
			}
			if (!nestedImages && images.length) contents.push({ role: "user", parts: [{ text: "Tool result image:" }, ...images.map((b) => ({ inlineData: { data: b.data, mimeType: b.mimeType } }))] });
		}
	}

	// --- decode simulation (src/api/google_generative_ai/decode.rs) ---
	const messages = [];
	const tools = currentTools.map((t) => ({
		name: t.name,
		description: t.description,
		parameters: sampling.getJsonSchemaToolParameters(t, sampling.resolveJsonSchemaStrictSampling(t, Number(/gemini-(\d+)/.exec(model.id)?.[1]) >= 3)),
	}));
	const systemText = initialSystem ? sanitize(getSystemMessageText(initialSystem)) : "";
	if (systemText.length > 0 || tools.length > 0) {
		messages.push({
			role: "system",
			content: systemText,
			...(tools.length > 0 ? { toolsAdded: tools } : {}),
			timestamp: 0,
		});
	}
	for (const content of contents) {
		if (content.role === "user") {
			const results = [];
			const blocks = [];
			for (const part of content.parts) {
				if (part.functionResponse) {
					const fr = part.functionResponse;
					const value = fr.response.error ?? fr.response.output ?? "";
					results.push({
						role: "toolResult",
						toolCallId: fr.id ?? fr.name, // no id on wire → name backfill
						toolName: fr.name,
						content: [...(typeof value === "string" && value.length > 0 ? [{ text: value }] : []), ...(fr.images ?? []).map((b) => ({ data: b.data, mimeType: b.mimeType }))],
						isError: fr.response.error !== undefined,
						timestamp: 0,
					});
				} else if (part.text !== undefined) {
					blocks.push({ text: part.text });
				} else if (part.inlineData) {
					blocks.push({ data: part.inlineData.data, mimeType: part.inlineData.mimeType });
				}
			}
			if (blocks.length > 0) {
				messages.push({
					role: "user",
					content: blocks.length === 1 && blocks[0].text !== undefined ? blocks[0].text : blocks,
					timestamp: 0,
				});
			}
			messages.push(...results);
		} else if (content.role === "model") {
			const blocks = content.parts.map((part) => {
				if (part.functionCall) {
					return {
						type: "toolCall",
						id: part.functionCall.id ?? part.functionCall.name,
						name: part.functionCall.name,
						arguments: part.functionCall.args,
						...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {}),
					};
				}
				if (part.thought === true) {
					return { type: "thinking", thinking: part.text, ...(part.thoughtSignature ? { thinkingSignature: part.thoughtSignature } : {}) };
				}
				return { type: "text", text: part.text, ...(part.thoughtSignature ? { textSignature: part.thoughtSignature } : {}) };
			}).filter((b) => b !== null);
			if (blocks.length > 0) {
				messages.push({
					role: "assistant",
					content: blocks,
					api: "google-generative-ai",
					provider: "",
					model: "",
					usage: zeroUsage(),
					stopReason: "stop",
					timestamp: 0,
				});
			}
		}
	}

	return { model: model.id, context: { messages }, options: canonicalRequestOptions(model.api, model, options) };
}
