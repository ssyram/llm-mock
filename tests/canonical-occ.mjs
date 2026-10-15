import { canonicalRequestOptions } from "./canonical-request-options.mjs";
// canonical for openai-completions: decode(convert(C)) ≡ canonical(C).
// Reference: docs/design/mock-llm-server/api/openai-completions.md (§a/§b).
// Reuses pi-ai's own transcript/transform pipeline (T0-T2), then applies the
// wire-emission → decode materialization declared by the spec.
import { sanitize } from "./canonical-sanitize.mjs";
import { shortHash } from "./canonical-short-hash.mjs";
import { requestReasoningDetails } from "./canonical-occ-request-reasoning.mjs";
import * as piAi from "./canonical-transcript.mjs";
import * as tm from "./canonical-transform-messages.mjs";
import * as sampling from "./canonical-strict-schema.mjs";

const { getSystemMessageText } = piAi;

const REASONING_FIELDS = ["reasoning", "reasoning_content", "reasoning_text"];
const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };

function zeroUsage() {
	return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { ...ZERO_COST } };
}

function decodeAssistantMeta(model) {
	return {
		api: "openai-completions",
		provider: "",
		model: model.id,
		usage: zeroUsage(),
		stopReason: "stop",
		timestamp: 0,
	};
}

export function canonicalOcc(context, model, options) {
	const transcript = piAi.resolveTranscript(piAi.normalizeContext(context), false);
	const tools = piAi.resolveTranscriptTools(transcript.messages, false);
	const transformed = tm.transformMessages(transcript.messages, model, (id) =>
		normalizeToolCallId(id, model),
	);

	const outMessages = [];
	let systemEmitted = false;
	for (let i = 0; i < transformed.length; i++) {
		const msg = transformed[i];
		if (msg.role === "system") {
			// collapsed transcript: exactly one leading system; wire sends its text
			// as one string message only when non-empty (default compat).
			const text = sanitize(getSystemMessageText(msg));
			if (text.length > 0 && !systemEmitted) {
				systemEmitted = true;
				outMessages.push({
					role: "system",
					content: text,
					timestamp: 0,
					...(tools.requestTools.length > 0
						? { toolsAdded: tools.requestTools.map(decodeTool) }
						: {}),
				});
			} else if (text.length > 0) {
				throw new Error("canonical: unexpected mid-convo system under default compat");
			}
		} else if (msg.role === "user") {
			const wire = emitUser(msg);
			if (wire !== undefined) outMessages.push(wire);
		} else if (msg.role === "assistant") {
			const wire = emitAssistant(msg);
			if (wire !== undefined) outMessages.push(decodeAssistant(wire, model));
		} else if (msg.role === "toolResult") {
			let j = i;
			const imageBlocks = [];
			for (; j < transformed.length && transformed[j].role === "toolResult"; j++) {
				const tr = transformed[j];
				const textResult = sanitize(tr.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"));
				const hasImages = tr.content.some((b) => b.type === "image");
				outMessages.push({
					role: "toolResult",
					toolCallId: tr.toolCallId,
					toolName: "", // default compat: `name` not sent (lossy, spec L1)
					content: [{ text: textResult || (hasImages ? "(see attached image)" : "(no tool output)") }],
					isError: false,
					timestamp: 0,
				});
				if (hasImages && model.input.includes("image")) {
					for (const b of tr.content) if (b.type === "image") imageBlocks.push(b);
				}
			}
			i = j - 1;
			if (imageBlocks.length > 0) {
				outMessages.push({
					role: "user",
					content: [
						{ text: "Attached image(s) from tool result:" },
						...imageBlocks.map((b) => ({ data: b.data, mimeType: b.mimeType })),
					],
					timestamp: 0,
				});
			}
		}
	}

	// The system message with tools can exist even when its text is empty
	// (synthesized by decode when wire has tools but no system message).
	if (!systemEmitted && tools.requestTools.length > 0) {
		outMessages.unshift({ role: "system", content: "", toolsAdded: tools.requestTools.map(decodeTool), timestamp: 0 });
	}

	return { model: model.id, context: { messages: outMessages }, options: canonicalRequestOptions(model.api, model, options) };
}

function decodeTool(tool) {
	// wire: {type:"function", function:{name, description, parameters}}; decode drops strict.
	return {
		name: tool.name,
		description: tool.description,
		parameters: sampling.getJsonSchemaToolParameters(tool, sampling.resolveJsonSchemaStrictSampling(tool, false)),
	};
}

// Simulated OCC emission of a user message (returns wire content or undefined if skipped).
function emitUser(msg) {
	if (typeof msg.content === "string") return { role: "user", content: sanitize(msg.content), timestamp: 0 };
	const parts = [];
	for (const block of msg.content) {
		if (block.type === "text") {
			if (block.text.length > 0) parts.push({ text: sanitize(block.text) });
		} else if (block.type === "image") {
			parts.push({ data: block.data, mimeType: block.mimeType });
		}
	}
	if (parts.length === 0) return undefined;
	return { role: "user", content: parts, timestamp: 0 };
}

// Simulated OCC emission of an assistant message in wire shape (internal),
// then spec §a decode back to unified shape.
function emitAssistant(msg) {
	const thinkingBlocks = msg.content.filter((b) => b.type === "thinking" && b.thinking.trim().length > 0);
	const textParts = msg.content.filter((b) => b.type === "text" && b.text.trim().length > 0);
	const toolCalls = msg.content.filter((b) => b.type === "toolCall");
	const assistantText = sanitize(textParts.map((p) => p.text).join(""));
	const wire = {};
	if (assistantText.length > 0) wire.content = assistantText;
	const details = requestReasoningDetails(msg.content.filter((b) => b.type === "thinking"), toolCalls);
	if (details) wire.reasoningDetails = details;
	else if (thinkingBlocks.length && REASONING_FIELDS.includes(thinkingBlocks[0].thinkingSignature)) {
		wire[thinkingBlocks[0].thinkingSignature] = thinkingBlocks.map((b) => b.thinking).join("\n");
	}
	if (toolCalls.length > 0) {
		wire.toolCalls = toolCalls.map((tc) => ({
			id: tc.id,
			name: tc.name,
			arguments: tc.arguments,
		}));
	}
	if (wire.content === undefined && !wire.toolCalls) return undefined; // skipped on wire
	return decodeAssistantWire(wire);
}

function decodeAssistantWire(wire) {
	const content = [];
	// decode order: Thinking(reasoning field) → Thinking(details) → Text → ToolCalls
	const sigField = ["reasoning_content", "reasoning", "reasoning_text"].find((f) => typeof wire[f] === "string");
	// decode order: Thinking(details+field) → Thinking(field) → Text → ToolCalls;
	// the server emits ONE thinking block per assistant wire message.
	if (wire.reasoningDetails) {
		content.push({
			type: "thinking",
			thinking: sigField ? wire[sigField] : "",
			thinkingSignature: JSON.stringify(wire.reasoningDetails),
		});
	} else if (sigField) {
		content.push({ type: "thinking", thinking: wire[sigField], thinkingSignature: sigField });
	}
	if (typeof wire.content === "string" && wire.content.length > 0) {
		content.push({ type: "text", text: wire.content });
	}
	for (const tc of wire.toolCalls ?? []) {
		content.push({ type: "toolCall", id: tc.id, name: tc.name, arguments: tc.arguments });
	}
	return content;
}

function decodeAssistant(wire, model) {
	return { role: "assistant", content: wire, ...decodeAssistantMeta(model) };
}

function normalizeToolCallId(id, model) {
	if (id.includes("|")) {
		const sep = id.indexOf("|");
		const callId = id.slice(0, sep).replace(/[^a-zA-Z0-9_-]/g, "_");
		const itemId = id.slice(sep + 1).replace(/[^a-zA-Z0-9_-]/g, "_");
		const combined = itemId.length > 0 ? `${callId}_${itemId}` : callId;
		if (combined.length <= 40) return combined;
		const hash = shortHash(id).slice(0, 8);
		const prefix = callId.slice(0, Math.max(1, 40 - hash.length - 1));
		return `${prefix}_${hash}`;
	}
	if (model.provider === "openai") return id.length > 40 ? id.slice(0, 40) : id;
	return id;
}

export { shortHash } from "./canonical-short-hash.mjs";
