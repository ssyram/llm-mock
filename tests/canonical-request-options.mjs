// Native stream fixture options; Simple, payload hooks and transport are separate domains.
export function canonicalRequestOptions(api, model, options = { maxTokens: 64, sessionId: "d-s1" }) {
	const out = {};
	const responses = api.endsWith("responses");
	if (api !== "openai-codex-responses") {
		let max = options.maxTokens;
		if (api === "anthropic-messages") max ??= model.maxTokens;
		if (responses) {
			if (max && model.compat?.supportsMaxOutputTokens !== false && !model.compat?.omitUnsupportedFields) out.maxTokens = Math.max(16, max);
		} else if (api === "openai-completions") { if (max) out.maxTokens = max; }
		else if (max !== undefined) out.maxTokens = max;
	}
	if (options.temperature !== undefined && !(api === "anthropic-messages" && (options.thinkingEnabled || model.compat?.supportsTemperature === false))) out.temperature = options.temperature;
	let choice = options.toolChoice;
	if (api === "openai-codex-responses") choice ??= "auto";
	if (choice !== undefined) {
		if (["google-generative-ai", "google-vertex"].includes(api)) choice = ({ auto: "auto", none: "none", any: "any" })[choice];
		if (choice !== undefined) out.toolChoice = structuredClone(choice);
	}
	const session = options.sessionId;
	if (["pi-messages", "azure-openai-responses"].includes(api) && session !== undefined) out.sessionId = api === "azure-openai-responses" ? Array.from(session).slice(0, 64).join("") : session;
	else if (options.cacheRetention !== "none" && session) {
		if (api === "openai-responses" || api === "mistral-conversations") out.sessionId = session;
		if (["azure-openai-responses", "openai-codex-responses"].includes(api)) out.sessionId = Array.from(session).slice(0, 64).join("");
		if (api === "openai-completions" && model.provider === "openai") out.sessionId = Array.from(session).slice(0, 64).join("");
	}
	if (api === "pi-messages" && options.reasoning !== undefined) out.reasoning = options.reasoning;
	return out;
}

