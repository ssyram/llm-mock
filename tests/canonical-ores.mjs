import { canonicalRequestOptions } from "./canonical-request-options.mjs";
// canonical for openai-responses: decode(convert(C)) ≡ canonical(C).
// Reference: docs/design/mock-llm-server/api/openai-responses.md (§a/§b T0-T6).
// Reuses pi-ai's resolveTranscript/transformMessages (responses id-normalizer)
// and the strict-tools transform, then materializes the Rust decode result.
import { sanitize } from "./canonical-sanitize.mjs";
import { normalizeResponseId, responseTextSignature } from "./canonical-responses-identity.mjs";
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

export function canonicalOres(context, model, options) {
	const transcript = piAi.resolveTranscript(piAi.normalizeContext(context), false);
	const tools = piAi.resolveTranscriptTools(transcript.messages, false);
	const transformed = tm.transformMessages(transcript.messages, model, (id, target, source) => normalizeResponseId(id, source, target));

	// --- simulate item emission (SH:219-352) ---
	const items = [];
	let msgIndex = 0;
	let sourceIndex = 0;
	for (const msg of transformed) {
		const isLeadingSystem = sourceIndex++ === 0 && msg.role === "system";
		if (msg.role === "system") {
			const text = isLeadingSystem ? sanitize(getSystemMessageText(msg)) : "";
			if (text.length > 0) items.push({ role: "system", content: text });
		} else if (msg.role === "user") {
			const parts =
				typeof msg.content === "string"
					? [{ type: "input_text", text: sanitize(msg.content) }]
					: msg.content.map((b) =>
							b.type === "text"
								? { type: "input_text", text: sanitize(b.text) }
								: { type: "input_image", image_url: `data:${b.mimeType};base64,${b.data}` },
						);
			if (parts.length === 0) {
				// pi-ai emission `continue`s on empty-block users without bumping
				// msgIndex (openai-responses-shared.ts user branch).
				continue;
			}
			items.push({ role: "user", content: parts });
		} else if (msg.role === "assistant") {
			const isSameModel = msg.provider === model.provider && msg.api === model.api && msg.model === model.id;
			let textBlockIndex = 0;
			const itemsBefore = items.length;
			for (const block of msg.content) {
				if (block.type === "thinking") {
					if (block.thinkingSignature) {
						items.push(JSON.parse(block.thinkingSignature));
					}
				} else if (block.type === "text") {
					const fallback =
						textBlockIndex === 0 ? `msg_pi_${msgIndex}` : `msg_pi_${msgIndex}_${textBlockIndex}`;
					textBlockIndex++;
					const signature = responseTextSignature(block.textSignature, fallback, true);
					items.push({ type: "message", role: "assistant", ...signature, status: "completed", text: sanitize(block.text) });
				} else if (block.type === "toolCall") {
					const [callId, itemIdRaw] = block.id.split("|");
					const differentModel = msg.provider === model.provider && msg.api === model.api && msg.model !== model.id;
					const itemId = itemIdRaw?.startsWith("fc_") && !differentModel ? itemIdRaw : undefined;
					items.push({
						type: "function_call",
						call_id: callId,
						...(itemId !== undefined ? { id: itemId } : {}),
						name: block.name,
						arguments: block.arguments,
						...(isSameModel && block.namespace !== undefined ? { namespace: block.namespace } : {}),
					});
				}
			}
			if (items.length === itemsBefore) continue; // pi-ai: empty assistant skips the msgIndex bump
		} else if (msg.role === "toolResult") {
			const [callId] = msg.toolCallId.split("|");
			const text = sanitize(msg.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"));
			const hasImages = msg.content.some((b) => b.type === "image");
			items.push({
				type: "function_call_output",
				call_id: callId,
				output: hasImages && model.input.includes("image")
					? [...(text ? [{ text }] : []), ...msg.content.filter((b) => b.type === "image").map((b) => ({ data: b.data, mimeType: b.mimeType }))]
					: text.trim() || (hasImages ? "(see attached image)" : "(no tool output)"),
			});
		}
		if (!isLeadingSystem) msgIndex++;
	}

	// --- simulate Rust decode (src/api/openai_responses/decode.rs) ---
	const messages = [];
	const calls = new Map();
	let pending = [];
	const flushAssistant = () => {
		if (pending.length === 0) return;
		messages.push({
			role: "assistant",
			content: pending,
			api: "openai-responses",
			provider: "openai",
			model: model.id,
			usage: zeroUsage(),
			stopReason: "stop",
			timestamp: 0,
		});
		pending = [];
	};
	for (const item of items) {
		if (item.role === "system" || item.role === "developer") {
			flushAssistant();
			messages.push({ role: "system", content: item.content, timestamp: 0 });
		} else if (item.role === "user") {
			flushAssistant();
			messages.push({
				role: "user",
				content: item.content.map((p) =>
					p.type === "input_text" ? { text: p.text } : { data: p.data ?? splitUri(p.image_url).data, mimeType: splitUri(p.image_url).mime },
				),
				timestamp: 0,
			});
		} else if (item.type === "message") {
			pending.push({
				type: "text",
				text: item.text,
				textSignature: JSON.stringify({ v: 1, id: item.id, ...(item.phase ? { phase: item.phase } : {}) }),
			});
		} else if (item.type === "reasoning") {
			const summary = (item.summary ?? []).map((s) => s.text).join("\n\n");
			const content = (item.content ?? []).map((s) => s.text).join("\n\n");
			pending.push({
				type: "thinking",
				thinking: summary.length > 0 ? summary : content,
				thinkingSignature: JSON.stringify(item),
			});
		} else if (item.type === "function_call") {
			const fullId = item.id !== undefined ? `${item.call_id}|${item.id}` : item.call_id;
			calls.set(item.call_id, { fullId, name: item.name });
			pending.push({ type: "toolCall", id: fullId, name: item.name, arguments: item.arguments, ...(item.namespace !== undefined ? { namespace: item.namespace } : {}) });
		} else if (item.type === "function_call_output") {
			flushAssistant();
			const call = calls.get(item.call_id);
			if (!call) throw new Error(`unpaired tool output for call_id ${item.call_id}`);
			messages.push({
				role: "toolResult",
				toolCallId: call.fullId,
				toolName: call.name,
				content: typeof item.output === "string" ? [{ text: item.output }] : item.output,
				isError: false,
				timestamp: 0,
			});
		}
	}
	flushAssistant();

	// attach tools to first system message (or synthesize one)
	if (tools.requestTools.length > 0) {
		const decodedTools = tools.requestTools.map((t) => ({
			name: t.name,
			description: t.description,
			parameters: sampling.getJsonSchemaToolParameters(t, sampling.resolveJsonSchemaStrictSampling(t, model.compat?.supportsStrictMode ?? false)),
		}));
		if (messages.length > 0 && messages[0].role === "system") {
			messages[0].toolsAdded = decodedTools;
		} else {
			messages.unshift({ role: "system", content: "", toolsAdded: decodedTools, timestamp: 0 });
		}
	}

	return {
		model: model.id,
		context: { messages },
		options: canonicalRequestOptions(model.api, model, options),
	};
}

export function canonicalOresThinking(block, index) {
	const item = block.thinkingSignature
		? JSON.parse(block.thinkingSignature)
		: { type: "reasoning", id: `rs_${index}`, summary: [{ type: "summary_text", text: block.thinking }] };
	if (item?.type !== "reasoning") throw new Error("Responses thinking signature must be a reasoning-item JSON (SH:265-267,688-693)");
	const summary = (item.summary ?? []).map((s) => s.text).join("\n\n");
	const content = (item.content ?? []).map((s) => s.text).join("\n\n");
	return { thinking: summary || content || block.thinking, thinkingSignature: JSON.stringify(item) };
}

function splitUri(url) {
	const rest = url.slice("data:".length);
	const comma = rest.indexOf(",");
	const meta = rest.slice(0, comma);
	const semi = meta.indexOf(";");
	return { mime: meta.slice(0, semi), data: rest.slice(comma + 1) };
}
