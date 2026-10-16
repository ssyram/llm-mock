import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { canonicalAm } from "../canonical-am.mjs";
import { fillAnthropic } from "../canonical-anthropic-reply.mjs";
export class AnthropicContract extends ProviderContract {
	constructor() { super("anthropic-messages", canonicalAm, fillAnthropic, {
		maxTokens: ({ model }) => transform({ tag: "nullish-default", value: model.maxTokens }),
		temperature: ({ model, options }) => options.thinkingEnabled || model.compat?.supportsTemperature === false ? drop("thinking/compat disables temperature") : preserve,
		toolChoice: preserve, sessionId: drop("native fixture has session-affinity disabled; explicit headers are a separate domain"),
		reasoning: drop("thinking/effort are separate native inputs"),
	}); }
}
