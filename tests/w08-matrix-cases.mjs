export function w08RequestCases(model) {
	if (model.api === "bedrock-converse-stream") {
		const make = (name, id, options, overrides = {}) => ({ name: `w08-reasoning-${name}`, modelOverrides: { id, name: id, reasoning: true, ...overrides }, options,
			messages: [{ role: "user", content: "reason", timestamp: 1 }] });
		return [
			make("budget-only", "anthropic.claude-3-7-sonnet", { reasoning: "low", interleavedThinking: false }),
			make("budget-beta", "anthropic.claude-3-7-sonnet", { reasoning: "xhigh", thinkingBudgets: { high: 4096 } }),
			make("adaptive-binding", "anthropic.claude-opus-4-7", { reasoning: "xhigh" }),
			make("adaptive-no-binding", "anthropic.claude-sonnet-4-6", { reasoning: "max" }),
			make("govcloud", "us-gov.anthropic.claude-opus-4-7", { reasoning: "high", region: "us-gov-west-1" }),
			make("gpt-oss", "openai.gpt-oss-120b", { reasoning: "max" }),
			make("gpt-nested", "openai.gpt-5", { reasoning: "medium" }, { thinkingLevelMap: { medium: "xhigh" } }),
			make("unknown-absent", "unknown-model", { reasoning: "high" }),
		];
	}
	if (model.api === "mistral-conversations") return [{ name: "w08-empty-thinking-order", mount: "mistral", messages: [{ role: "assistant", api: model.api, provider: model.provider, model: model.id,
		content: [{ type: "text", text: "\ud800" }, { type: "thinking", thinking: "\ud800" }, { type: "text", text: "ax" }], stopReason: "stop", timestamp: 1 }] }];
	return [];
}

export function w08ReplyCases(model, base) {
	if (model.api === "anthropic-messages") return ["error", "pending", "aborted", "deferred"].flatMap((stopReason) => [undefined, "", "cancelled"].map((errorMessage, index) => ({
		name: `w08-refusal-${stopReason}-${index}`, message: { ...structuredClone(base), content: [], stopReason, errorMessage },
	})));
	if (model.api === "openai-codex-responses") return ["stop", "length", "toolUse", "error"].flatMap((stopReason) => [undefined, true, false].map((endTurn) => ({
		name: `w08-end-turn-${stopReason}-${endTurn}`, message: { ...structuredClone(base), content: [], stopReason, endTurn },
	})));
	return [];
}
