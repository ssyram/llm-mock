import { evaluate } from "./behavior.ts";
import type { Behavior, Model, Options } from "./behavior.ts";

export const optionFields = ["maxTokens", "temperature", "sessionId", "toolChoice", "reasoning"] as const;
export type OptionField = typeof optionFields[number];
export type OptionEnvironment = { model: Model; options: Options };
export type OptionDefinition = { readonly [Field in OptionField]: Behavior | ((environment: OptionEnvironment) => Behavior) };

export function projectRequestOptions(definition: OptionDefinition, model: Model, options: Options): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	for (const field of optionFields) {
		const declaration = definition[field];
		const behavior = typeof declaration === "function" ? declaration({ model, options }) : declaration;
		const value = evaluate(behavior, options[field]);
		if (value !== undefined) output[field] = value;
	}
	return output;
}
