import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { canonicalAm } from "../canonical-am.mjs";
import { anthropicReasoning } from "./anthropic-reasoning.ts";
import { nativeSession } from "../native-session-headers.mjs";
import { fillAnthropic } from "../canonical-anthropic-reply.mjs";
export class AnthropicContract extends ProviderContract {
	constructor() { super("anthropic-messages", canonicalAm, fillAnthropic, {
		cacheRetention: drop("cache controls do not decode to a scalar retention option"),
		maxTokens: ({ model }) => transform({ tag: "nullish-default", value: model.maxTokens }),
		temperature: ({ model, options }) => options.thinkingEnabled || model.compat?.supportsTemperature === false || model.compat?.supportsMidConvoEffort === true ? drop("thinking/compat disables temperature") : preserve,
		toolChoice: preserve,
		sessionId: ({ model, options }) => transform({ tag: "program", name: "anthropic-session-headers", apply: () => nativeSession(model.api, model, options) }),
		reasoning: ({ model, options }) => transform({ tag: "program", name: "anthropic-native-thinking", apply: () => anthropicReasoning(model, options) }),
	}); }
}
