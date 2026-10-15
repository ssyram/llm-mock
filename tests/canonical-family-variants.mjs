import { canonicalOres } from "./canonical-ores.mjs";
import { canonicalGai } from "./canonical-gai.mjs";
import * as piAi from "./canonical-transcript.mjs";
import * as sampling from "./canonical-strict-schema.mjs";

export function canonicalAzure(context, model, options) {
	const out = retag(canonicalOres(context, model, options), "azure-openai-responses", "azure");
	return strictTools(out, context, model);
}

export function canonicalCodex(context, model, options) {
	const out = strictTools(retag(canonicalOres(context, model, options), "openai-codex-responses", "openai-codex"), context, model);
	const first = out.context.messages[0];
	if (first?.role === "system") {
		if (!first.content) first.content = "You are a helpful assistant.";
	} else {
		out.context.messages.unshift({ role: "system", content: "You are a helpful assistant.", timestamp: 0 });
	}
	delete out.options.maxTokens;
	out.options.toolChoice ??= "auto";
	return out;
}

export function canonicalVertex(context, model, options) {
	// family-variants §3a calls convertTools(..., false, strict): full JSON schema.
	return retag(canonicalGai(context, model, options), "google-vertex");
}

function retag(out, api, provider) {
	for (const message of out.context.messages) {
		if (message.role !== "assistant") continue;
		message.api = api;
		if (provider !== undefined) message.provider = provider;
	}
	return out;
}

function strictTools(out, context, model) {
	const transcript = piAi.resolveTranscript(piAi.normalizeContext(context), false);
	const tools = piAi.resolveTranscriptTools(transcript.messages, false).requestTools;
	for (const message of out.context.messages) {
		for (const tool of message.toolsAdded ?? []) {
			const source = tools.find((candidate) => candidate.name === tool.name);
			const strict = sampling.resolveJsonSchemaStrictSampling(source, model.compat?.supportsStrictMode ?? true);
			tool.parameters = sampling.getJsonSchemaToolParameters(source, strict);
		}
	}
	return out;
}
