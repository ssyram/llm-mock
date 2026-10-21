import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { sampledOutputLimit } from "./sampled-output-limit.ts";
import { completionReasoning } from "./completion-reasoning.ts";
import { sampled } from "./native-sampling.ts";
import { nativeSession } from "../native-session-headers.mjs";
import { canonicalOcc } from "../canonical-occ.mjs";
import { fillCompletions } from "../canonical-occ-reply.mjs";
export class CompletionsContract extends ProviderContract {
	constructor() { super("openai-completions", canonicalOcc, (output, model) => fillCompletions(output, undefined, model), {
		cacheRetention: drop("no decoded scalar retention option"),
		maxTokens: ({ model, options }) => transform({ tag: "program", name: "completion-final-output-limit", apply: (value) => sampledOutputLimit(model, options, value || undefined) }), temperature: ({ model, options }) => transform({ tag: "program", name: "completion-final-temperature", apply: () => sampled(model, options, "temperature", options.temperature) }), toolChoice: preserve,
		sessionId: ({ model, options }) => transform({ tag: "program", name: "completion-cache-key-or-affinity", apply: () => nativeSession(model.api, model, options) }),
		reasoning: ({ model, options }) => transform({ tag: "program", name: "completion-native-reasoning", apply: () => completionReasoning(model, options) }),
	}); }
}
