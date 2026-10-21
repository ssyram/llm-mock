import type { Model, Options } from "./behavior.ts";
export function anthropicReasoning(model: Model, options: Options): unknown {
	if (model.compat?.supportsMidConvoEffort === true) return "high";
	if (!model.reasoning) return undefined;
	if (options.thinkingEnabled) return model.compat?.forceAdaptiveThinking === true ? options.effort || "high" : `budget:${options.thinkingBudgetTokens || 1024}`;
	return options.thinkingEnabled === false && model.thinkingLevelMap?.off !== null ? "off" : undefined;
}
