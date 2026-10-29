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

function isAnthropicClaudeModel(model) {
	// mirrors pi-ai bedrock-converse-stream.ts: Claude via Bedrock follows the
	// Anthropic rules (error-image split, etc.).
	return /claude/i.test(model.id ?? "") || /claude/i.test(model.name ?? "");
}
export function canonicalBedrock(context, model, options) {
	const collapsed = piAi.collapseSystemMessages(piAi.normalizeContext(context));
	const currentTools = options?.toolChoice === "none" ? [] : piAi.getCurrentTools(collapsed.messages);
	const tools = currentTools.map((tool) => ({ name: tool.name, description: tool.description, parameters: sampling.getJsonSchemaToolParameters(tool, sampling.resolveJsonSchemaStrictSampling(tool, model.compat?.supportsStrictMode ?? false)) }));
	const initial = collapsed.messages[0]?.role === "system" ? collapsed.messages[0] : undefined;
	const conversation = piAi.withoutInitialSystemMessage(collapsed.messages);
	const transformed = tm.transformMessages(conversation, model, (id) => id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64));
	const claude = isAnthropicClaudeModel(model);
	const pendingErrorImages = [];
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
			let content = userBlocks(msg.content);
			if (!content.length && !msg.content.some((b) => b.type === "image")) content.push({ text: "<empty>" });
			messages.push({ role: "toolResult", toolCallId: msg.toolCallId, toolName: "", content, isError: msg.isError, timestamp: 0 });
			// pi-ai 1.4 (#10794) on Claude models: images in an ERROR tool result are
			// split out — placeholders stay in the result, caption+images follow all
			// tool results of the turn as plain user blocks. Non-Claude keeps inline.
			if (claude && msg.isError && msg.content.some((b) => b.type === "image")) {
				const placeholder = "(image attached after the tool results)";
				// Bedrock keeps the placeholder TextContent[] as separate blocks
				// (convertToolResultContent), unlike anthropic-messages which joins
				// them into one string.
				messages.at(-1).content = msg.content.map((b) => ({ text: b.type === "image" ? placeholder : b.text }));
				pendingErrorImages.push(
					{ text: `Images from the error result of tool call ${msg.toolCallId} (${msg.toolName}):` },
					...msg.content.filter((b) => b.type === "image").map((b) => ({ data: b.data, mimeType: b.mimeType })),
				);
			}
		}
	}
	if (pendingErrorImages.length) messages.push({ role: "user", content: pendingErrorImages, timestamp: 0 });
	const requestOptions = canonicalRequestOptions(model.api, model, options, currentTools);
	const reasoning = canonicalBedrockReasoning(model, options ?? {});
	if (reasoning !== undefined) requestOptions.reasoning = reasoning;
	return { model: model.id, context: { messages }, options: requestOptions };
}
