import type { Model, Options } from "./behavior.ts";
import { clampLevel } from "./thinking-levels.ts";
export function googleThinking(model: Model, options: Options): unknown {
	if (!model.reasoning || !options.thinking) return undefined;
	const thinking = options.thinking;
	if (thinking.enabled) {
		if (thinking.level !== undefined) return thinking.level.toLowerCase();
		return thinking.budgetTokens === undefined ? undefined : thinking.budgetTokens === 0 ? "off" : `budget:${thinking.budgetTokens}`;
	}
	const id = model.id.toLowerCase();
	if (!/gemini-3(?:\.\d+)?-(?:pro|flash)|gemma-?4/.test(id) && !["gemini-flash-latest", "gemini-flash-lite-latest"].includes(id)) return "off";
	const fallback = clampLevel(model, "off");
	if (fallback === "off") return "off";
	return (model.thinkingLevelMap?.[fallback] ?? fallback).toLowerCase();
}
