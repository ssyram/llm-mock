import type { Model, Options } from "./behavior.ts";
import { clampLevel } from "./thinking-levels.ts";

export function nativeSampling(model: Model, options: Options): Record<string, unknown> {
	const level = options.reasoningEffort ?? (options.reasoningSummary ? "medium" : "off");
	return { ...model.samplingParams, ...model.samplingParamsByThinkingLevel?.[clampLevel(model, level)], ...options.samplingParams };
}
export function sampled(model: Model, options: Options, key: string, fallback: unknown): unknown {
	const params = nativeSampling(model, options);
	return Object.hasOwn(params, key) ? params[key] ?? undefined : fallback;
}
