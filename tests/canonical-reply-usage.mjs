// Frozen vendor cost rule; pi-messages carries its source usage unchanged.
export function finalizeUsage(out, model, api) {
	if (api === "pi-messages") return;
	const usage = out.usage;
	if (["openai-completions", "anthropic-messages"].includes(api)) usage.totalTokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
	if (api === "bedrock-converse-stream" && !usage.totalTokens) usage.totalTokens = usage.input + usage.output;
	if (api === "mistral-conversations" && !usage.totalTokens) usage.totalTokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
	let rates = model.cost;
	const tokens = usage.input + usage.cacheRead + usage.cacheWrite;
	for (const tier of [...(model.cost.tiers ?? [])].sort((a, b) => a.inputTokensAbove - b.inputTokensAbove)) {
		if (tokens > tier.inputTokensAbove) rates = tier;
	}
	const oneHour = usage.cacheWrite1h ?? 0;
	usage.cost = {
		input: (rates.input / 1e6) * usage.input,
		output: (rates.output / 1e6) * usage.output,
		cacheRead: (rates.cacheRead / 1e6) * usage.cacheRead,
		cacheWrite: (rates.cacheWrite * (usage.cacheWrite - oneHour) + rates.input * 2 * oneHour) / 1e6,
	};
	usage.cost.total = usage.cost.input + usage.cost.output + usage.cost.cacheRead + usage.cost.cacheWrite;
}
