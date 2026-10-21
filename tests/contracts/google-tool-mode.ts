import type { Model, Options } from "./behavior.ts";
import { resolveJsonSchemaStrictSampling } from "../canonical-strict-schema.mjs";
export function googleToolMode(model: Model, options: Options, tools: readonly unknown[]): unknown {
	if (!tools.length) return undefined;
	const choice = options.toolChoice;
	if (choice === "none" || choice === "any") return choice;
	const strict = Number(/^gemini(?:-live)?-(\d+)/i.exec(model.id)?.[1]) >= 3;
	if (tools.some((tool) => resolveJsonSchemaStrictSampling(tool, strict) === true)) return "validated";
	return choice ? "auto" : undefined;
}
