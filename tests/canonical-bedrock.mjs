import { canonicalRequestOptions } from "./canonical-request-options.mjs";
import { canonicalBedrockReasoning } from "./canonical-bedrock-reasoning.mjs";
import { sanitize } from "./canonical-sanitize.mjs";
import * as piAi from "./canonical-transcript.mjs";
import * as tm from "./canonical-transform-messages.mjs";
import * as text from "./canonical-transcript.mjs";
import * as sampling from "./canonical-strict-schema.mjs";

const blank = (text) => !sanitize(text).trim();
const userBlocks = (blocks) => blocks.flatMap((b) => b.type === "text"
	? blank(b.text) ? [] : [{ text: sanitize(b.text) }]
	: [{ data: Buffer.from(b.data, "base64").toString("base64"), mimeType: b.mimeType === "image/jpg" ? "image/jpeg" : b.mimeType }]);

function document(value) {
	if (Array.isArray(value)) return value.map(document);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(Object.entries(value).filter(([key]) => key.length).map(([key, nested]) => [key, document(nested)]));
}

export function canonicalBedrock(context, model, options) {
	const collapsed = piAi.collapseSystemMessages(piAi.normalizeContext(context));
	const tools = piAi.getCurrentTools(collapsed.messages).map((tool) => ({ name: tool.name, description: tool.description, parameters: sampling.getJsonSchemaToolParameters(tool, sampling.resolveJsonSchemaStrictSampling(tool, model.compat?.supportsStrictMode ?? false)) }));
	const initial = collapsed.messages[0]?.role === "system" ? collapsed.messages[0] : undefined;
	const conversation = piAi.withoutInitialSystemMessage(collapsed.messages);
	const transformed = tm.transformMessages(conversation, model, (id) => id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64));
	const messages = [];
	const systemText = initial ? sanitize(text.getSystemMessageText(initial)) : "";
	if (systemText || tools.length) messages.push({ role: "system", content: systemText, ...(tools.length ? { toolsAdded: tools } : {}), timestamp: 0 });
	for (const msg of transformed) {
		if (msg.role === "user") {
			const blocks = typeof msg.content === "string" ? [{ text: blank(msg.content) ? "<empty>" : sanitize(msg.content) }] : userBlocks(msg.content);
			if (!blocks.length) blocks.push({ text: "<empty>" });
			messages.push({ role: "user", content: blocks.length === 1 && blocks[0].text !== undefined ? blocks[0].text : blocks, timestamp: 0 });
		} else if (msg.role === "assistant") {
			const content = msg.content.flatMap((b) => {
				if (b.type === "text") return blank(b.text) ? [] : [{ type: "text", text: sanitize(b.text) }];
				if (b.type === "toolCall") return [{ type: "toolCall", id: b.id, name: b.name, arguments: document(b.arguments) }];
				if (b.redacted) {
					const signature = b.thinkingSignature;
					const valid = typeof signature === "string" && signature.length > 0 && signature.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(signature);
					return valid ? [{ type: "thinking", thinking: "", thinkingSignature: Buffer.from(signature, "base64").toString("base64"), redacted: true }] : [];
				}
				if (blank(b.thinking)) return [];
				const claude = /anthropic[./]claude/i.test(model.id) || /claude/i.test(model.name);
				if (claude && !b.thinkingSignature?.trim()) return [{ type: "text", text: sanitize(b.thinking) }];
				return [{ type: "thinking", thinking: sanitize(b.thinking), ...(claude && b.thinkingSignature ? { thinkingSignature: b.thinkingSignature } : {}) }];
			});
			if (content.length) messages.push({ role: "assistant", content, api: "bedrock-converse-stream", provider: "amazon-bedrock", model: model.id,
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 0 });
		} else if (msg.role === "toolResult") {
			const content = userBlocks(msg.content);
			if (!content.length && !msg.content.some((b) => b.type === "image")) content.push({ text: "<empty>" });
			messages.push({ role: "toolResult", toolCallId: msg.toolCallId, toolName: "", content, isError: msg.isError, timestamp: 0 });
		}
	}
	const requestOptions = canonicalRequestOptions(model.api, model, options);
	const reasoning = canonicalBedrockReasoning(model, options ?? {});
	if (reasoning !== undefined) requestOptions.reasoning = reasoning;
	return { model: model.id, context: { messages }, options: requestOptions };
}
