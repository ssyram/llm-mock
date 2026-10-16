import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { canonicalOcc } from "../canonical-occ.mjs";
import { fillCompletions } from "../canonical-occ-reply.mjs";
export class CompletionsContract extends ProviderContract {
	constructor() { super("openai-completions", canonicalOcc, (output, model) => fillCompletions(output, undefined, model), {
		maxTokens: transform({ tag: "truthy" }), temperature: preserve, toolChoice: preserve,
		sessionId: ({ model, options }) => options.cacheRetention !== "none" && options.sessionId && model.provider === "openai"
			? transform({ tag: "codepoint-prefix", length: 64 }) : drop("native OpenAI-only retained prompt cache key"),
		reasoning: drop("native reasoningEffort is a separate input"),
	}); }
}
