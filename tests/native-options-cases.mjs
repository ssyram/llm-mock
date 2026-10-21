const row = (api, name, model, options, expected, path, value) => ({ api, name, model, options, expected, path, value });
export const nativeOptionsCases = [
	row("pi-messages", "legacy-env-retention", {}, { env: { PI_CACHE_RETENTION: "long" } }, { cacheRetention: "long" }, ["options", "cacheRetention"], "long"),
	row("google-generative-ai", "dynamic-budget", { id: "gemini-2.5-test", reasoning: true }, { thinking: { enabled: true, budgetTokens: -1 } }, { reasoning: "budget:-1" }, ["config", "thinkingConfig", "thinkingBudget"], -1),
	row("anthropic-messages", "affinity", { compat: { sendSessionAffinityHeaders: true } }, { sessionId: "session-native" }, { sessionId: "session-native" }),
	row("anthropic-messages", "budget", { reasoning: true }, { thinkingEnabled: true, thinkingBudgetTokens: 2048 }, { reasoning: "budget:2048" }, ["thinking", "budget_tokens"], 2048),
	row("anthropic-messages", "default-budget", { reasoning: true }, { thinkingEnabled: true }, { reasoning: "budget:1024" }, ["thinking", "budget_tokens"], 1024),
	row("anthropic-messages", "disabled", { reasoning: true }, { thinkingEnabled: false }, { reasoning: "off" }, ["thinking", "type"], "disabled"),
	row("anthropic-messages", "adaptive", { reasoning: true, compat: { forceAdaptiveThinking: true } }, { thinkingEnabled: true, effort: "low" }, { reasoning: "low" }, ["output_config", "effort"], "low"),
	row("openai-responses", "effort", { reasoning: true }, { reasoningEffort: "high" }, { reasoning: "high" }, ["reasoning", "effort"], "high"),
	row("openai-responses", "summary-default", { reasoning: true }, { reasoningSummary: "detailed" }, { reasoning: "medium" }, ["reasoning", "effort"], "medium"),
	row("openai-responses", "off", { reasoning: true }, {}, { reasoning: "none" }, ["reasoning", "effort"], "none"),
	row("openai-responses", "mapped", { reasoning: true, thinkingLevelMap: { high: "low" } }, { reasoningEffort: "high" }, { reasoning: "low" }, ["reasoning", "effort"], "low"),
	row("openai-responses", "sampling-last", { reasoning: true, samplingParams: { temperature: 0.4, reasoning: { effort: "medium" }, max_output_tokens: 39 } }, { reasoningEffort: "high", temperature: 0.1 }, { reasoning: "medium", temperature: 0.4, maxTokens: 39 }, ["reasoning", "effort"], "medium"),
	row("azure-openai-responses", "effort", { reasoning: true }, { reasoningEffort: "high" }, { reasoning: "high" }, ["reasoning", "effort"], "high"),
	row("openai-completions", "effort", { reasoning: true, compat: { supportsReasoningEffort: true } }, { reasoningEffort: "high" }, { reasoning: "high" }, ["reasoning_effort"], "high"),
	row("openai-completions", "off-map", { reasoning: true, thinkingLevelMap: { off: "none" } }, {}, { reasoning: "none" }, ["reasoning_effort"], "none"),
	row("openai-completions", "no-effort-support", { reasoning: true, compat: { supportsReasoningEffort: false } }, { reasoningEffort: "high" }, { reasoning: undefined }),
	row("openai-completions", "nested-effort", { reasoning: true, compat: { thinkingFormat: "openrouter" } }, { reasoningEffort: "high" }, { reasoning: "high" }, ["reasoning", "effort"], "high"),
	row("openai-completions", "string-thinking", { reasoning: true, compat: { thinkingFormat: "string-thinking" } }, { reasoningEffort: "high" }, { reasoning: "high" }, ["thinking"], "high"),
	row("openai-completions", "sampling-last", { reasoning: true, samplingParams: { reasoning_effort: "medium", temperature: 0.3, max_completion_tokens: 41 } }, { reasoningEffort: "high", temperature: 0.1 }, { reasoning: "medium", temperature: 0.3, maxTokens: 41 }, ["reasoning_effort"], "medium"),
	row("google-generative-ai", "budget", { id: "gemini-2.5-test", reasoning: true }, { thinking: { enabled: true, budgetTokens: 1234 } }, { reasoning: "budget:1234" }, ["config", "thinkingConfig", "thinkingBudget"], 1234),
	row("google-generative-ai", "disabled", { id: "gemini-2.5-test", reasoning: true }, { thinking: { enabled: false } }, { reasoning: "off" }, ["config", "thinkingConfig", "thinkingBudget"], 0),
	row("google-vertex", "level", { id: "gemini-3-flash-test", reasoning: true }, { thinking: { enabled: true, level: "LOW" } }, { reasoning: "low" }, ["config", "thinkingConfig", "thinkingLevel"], "LOW"),
	row("bedrock-converse-stream", "no-tools-mode", {}, { toolChoice: "none" }, { toolChoice: undefined }),
	row("openai-codex-responses", "native-effort", { reasoning: true }, { reasoningEffort: "high" }, { reasoning: "high" }, ["reasoning", "effort"], "high"),
	row("openai-codex-responses", "off", { reasoning: true }, {}, { reasoning: "none" }, ["reasoning", "effort"], "none"),
];
for (const api of ["google-generative-ai", "google-vertex"]) for (const toolChoice of [undefined, "auto", "none", "any"]) {
	nativeOptionsCases.push({ ...row(api, `strict-${toolChoice}`, { id: "gemini-3-test" }, { toolChoice }, { toolChoice: toolChoice === "none" || toolChoice === "any" ? toolChoice : "validated" }, ["config", "toolConfig", "functionCallingConfig", "mode"], toolChoice === "none" || toolChoice === "any" ? toolChoice.toUpperCase() : "VALIDATED"), strict: true });
}
