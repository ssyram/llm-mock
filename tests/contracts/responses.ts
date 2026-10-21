import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { sampledOutputLimit } from "./sampled-output-limit.ts";
import { responseReasoning } from "./response-reasoning.ts";
import { sampled } from "./native-sampling.ts";
import { nativeSession } from "../native-session-headers.mjs";
import { canonicalOres } from "../canonical-ores.mjs";
import { fillResponses } from "../canonical-responses-reply.mjs";
export class ResponsesContract extends ProviderContract {
	constructor() { super("openai-responses", canonicalOres, fillResponses, {
		cacheRetention: drop("no decoded scalar retention option"),
		maxTokens: ({ model, options }) => transform({ tag: "program", name: "responses-final-output-limit", apply: (value) => sampledOutputLimit(model, options, model.compat?.supportsMaxOutputTokens === false || model.compat?.omitUnsupportedFields ? undefined : value ? Math.max(16, Number(value)) : undefined) }),
		temperature: ({ model, options }) => transform({ tag: "program", name: "responses-final-temperature", apply: () => sampled(model, options, "temperature", model.compat?.omitUnsupportedFields ? undefined : options.temperature) }), toolChoice: ({ model, options }) => transform({ tag: "program", name: "responses-final-tool-choice", apply: () => sampled(model, options, "tool_choice", options.toolChoice) }),
		sessionId: ({ model, options }) => transform({ tag: "program", name: "responses-affinity-or-cache-key", apply: () => nativeSession(model.api, model, options) }),
		reasoning: ({ model, options }) => transform({ tag: "program", name: "responses-native-reasoning", apply: () => responseReasoning(model, options) }),
	}); }
}
