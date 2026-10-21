import type { Model, Options } from "./behavior.ts";
import { sampled } from "./native-sampling.ts";
export function responseReasoning(model: Model, options: Options): unknown {
	if (model.api === "openai-codex-responses") {
		const level = options.reasoningEffort;
		if (level !== undefined) return level === "none" ? model.thinkingLevelMap?.off === undefined ? "none" : model.thinkingLevelMap.off ?? undefined : model.thinkingLevelMap?.[level] ?? level;
		return model.reasoning && model.thinkingLevelMap?.off !== null ? model.thinkingLevelMap?.off ?? "none" : undefined;
	}
	const requested = options.reasoningEffort ?? (options.reasoningSummary ? "medium" : undefined);
	let effort;
	if (model.reasoning) {
		if (requested) effort = options.reasoningEffort ? model.thinkingLevelMap?.[requested] ?? requested : requested;
		else if ((model.api === "azure-openai-responses" || model.provider !== "github-copilot") && model.thinkingLevelMap?.off !== null) effort = model.thinkingLevelMap?.off ?? "none";
	}
	const reasoning = model.api === "openai-responses" ? sampled(model, options, "reasoning", { effort }) : { effort };
	return reasoning && typeof reasoning === "object" && "effort" in reasoning && typeof reasoning.effort === "string" ? reasoning.effort : undefined;
}
