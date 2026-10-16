import { fillCompletions } from "./canonical-occ-reply.mjs";
import { fillResponses } from "./canonical-responses-reply.mjs";
import { fillAnthropic } from "./canonical-anthropic-reply.mjs";
import { fillGoogle } from "./canonical-google-reply.mjs";
import { fillBedrock } from "./canonical-bedrock-reply.mjs";
import { fillMistral, fillPiMessages } from "./canonical-reply-additional.mjs";
import { finalizeUsage } from "./canonical-reply-usage.mjs";
import { projectEncodeThinking } from "./canonical-encode-thinking.mjs";
import { expectsGeneratedToolId } from "./generated-tool-id.mjs";

export function canonicalReply(api, source, model) {
	const out = structuredClone(source);
	out.content = projectEncodeThinking(api, out.content);
	Object.assign(out, { role: "assistant", api: model.api, provider: model.provider, model: model.id });
	for (const key of ["timestamp", "durationMs", "thinkingLevel", "providerThinkingLevel", "diagnostics", "deferred"]) delete out[key];
	if (api === "openai-completions") fillCompletions(out, undefined, model);
	else if (api.endsWith("responses")) fillResponses(out);
	else if (api === "anthropic-messages") fillAnthropic(out, model, source);
	else if (["google-generative-ai", "google-vertex"].includes(api)) fillGoogle(out, model, source);
	else if (api === "bedrock-converse-stream") fillBedrock(out);
	else if (api === "mistral-conversations") fillMistral(out);
	else if (api === "pi-messages") {
		if (["pending", "deferred"].includes(out.stopReason)) throw new Error(`pi-messages encoder rejects ${out.stopReason}`);
		if (source.providerThinkingLevel !== undefined) out.providerThinkingLevel = source.providerThinkingLevel;
		fillPiMessages(out);
	}
	finalizeUsage(out, model, api);
	return out;
}

export function compareReply(actual, expected, deepDiff, started, ended) {
	const comparableActual = structuredClone(actual);
	const comparableExpected = structuredClone(expected);
	const diffs = [];
	const ids = new Set();
	let lastCounter;
	for (let index = 0; index < expected.content.length; index++) {
		const block = expected.content[index];
		if (block.type !== "toolCall") continue;
		if (!expectsGeneratedToolId(block)) {
			ids.add(block.id);
			continue;
		}
		const id = actual.content[index]?.id;
		const prefix = `${block.name}_`;
		const suffix = typeof id === "string" && id.startsWith(prefix) ? id.slice(prefix.length) : "";
		const match = /^(\d+)_(\d+)$/.exec(suffix);
		if (!match || Number(match[1]) < started || Number(match[1]) > ended || Number(match[2]) < 1 || (lastCounter !== undefined && Number(match[2]) !== lastCounter + 1) || ids.has(id)) {
			diffs.push(`$.content[${index}].id: invalid pi-generated ID ${JSON.stringify(id)}`);
		}
		if (match) lastCounter = Number(match[2]);
		ids.add(id);
		if (comparableActual.content[index]) delete comparableActual.content[index].id;
		delete comparableExpected.content[index].id;
	}
	if (!Number.isFinite(actual.timestamp) || actual.timestamp < started || actual.timestamp > ended) diffs.push("$.timestamp: outside client request clock interval");
	if (actual.durationMs !== undefined && (!Number.isInteger(actual.durationMs) || actual.durationMs < 0)) diffs.push("$.durationMs: invalid local duration");
	return deepDiff(comparableActual, comparableExpected, ["timestamp", "durationMs"], "$", diffs);
}
