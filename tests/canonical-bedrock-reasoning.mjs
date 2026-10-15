// Bedrock §4 Q-Claude/other-model reasoning; models/options → wire envelope, never reverse-map effort.
export function canonicalBedrockReasoning(model, options) {
	if (!model.reasoning || !options.reasoning) return undefined;
	const level = options.reasoning;
	const names = [model.id, model.name ?? ""].flatMap((name) => {
		const lower = name.toLowerCase();
		return [lower, lower.replace(/[\s_.:]+/g, "-")];
	});
	const matches = (values) => names.some((name) => values.some((value) => name.includes(value)));
	const claude = [model.id, model.name ?? ""].some((name) => /anthropic[./]claude/i.test(name)) || /claude/i.test(model.name ?? "");
	let fields;
	if (claude) {
		const native = matches(["opus-4-7", "opus-4-8", "opus-5", "sonnet-5", "haiku-5", "fable-5"]);
		const adaptive = native || matches(["opus-4-6", "sonnet-4-6"]);
		const region = options.region || options.env?.AWS_REGION || process.env.AWS_REGION || options.env?.AWS_DEFAULT_REGION || process.env.AWS_DEFAULT_REGION || "";
		const id = model.id.toLowerCase();
		const gov = region.toLowerCase().startsWith("us-gov-") || id.startsWith("us-gov.") || id.startsWith("arn:aws-us-gov:");
		const display = gov ? {} : { display: options.thinkingDisplay ?? "summarized" };
		if (adaptive) {
			const effort = level === "xhigh" && native ? "xhigh" : typeof model.thinkingLevelMap?.[level] === "string" ? model.thinkingLevelMap[level] : ({ minimal: "low", low: "low", medium: "medium" })[level] ?? "high";
			fields = { thinking: { type: "adaptive", ...display, ...(!gov && native ? { block_binding: { prefix_mismatch_behavior: "drop_block" } } : {}) }, output_config: { effort } };
			if (!gov && native) fields.anthropic_beta = ["thinking-binding-controls-2026-08-01"];
		} else {
			const budgetLevel = ["xhigh", "max"].includes(level) ? "high" : level;
			fields = { thinking: { type: "enabled", budget_tokens: options.thinkingBudgets?.[budgetLevel] ?? ({ minimal: 1024, low: 2048, medium: 8192, high: 16384 })[budgetLevel], ...display } };
			if (options.interleavedThinking ?? true) fields.anthropic_beta = ["interleaved-thinking-2025-05-14"];
		}
	} else if (matches(["gpt-oss"])) {
		fields = { reasoning_effort: ({ minimal: "low", low: "low", medium: "medium", high: "high", xhigh: "high", max: "high" })[level] };
	} else if (matches(["gpt-"])) {
		fields = { reasoning: { effort: typeof model.thinkingLevelMap?.[level] === "string" ? model.thinkingLevelMap[level] : level === "minimal" ? "low" : level } };
	}
	return fields === undefined ? undefined : JSON.stringify(fields);
}
