import type { Model } from "./behavior.ts";
const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
export function clampLevel(model: Model, requested: string): string {
	const available = model.reasoning ? levels.filter((level) => model.thinkingLevelMap?.[level] !== null && (!["xhigh", "max"].includes(level) || model.thinkingLevelMap?.[level] !== undefined)) : ["off"];
	if (available.includes(requested)) return requested;
	const index = levels.indexOf(requested);
	if (index < 0) return available[0] ?? "off";
	return levels.slice(index).find((level) => available.includes(level)) ?? levels.slice(0, index).reverse().find((level) => available.includes(level)) ?? available[0] ?? "off";
}
