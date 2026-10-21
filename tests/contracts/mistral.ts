import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop } from "./behavior.ts";
import { canonicalMistral } from "../canonical-mistral.mjs";
import { fillMistral } from "../canonical-reply-additional.mjs";
export class MistralContract extends ProviderContract {
	constructor() { super("mistral-conversations", canonicalMistral, fillMistral, {
		cacheRetention: drop("no decoded scalar retention option"),
		maxTokens: preserve, temperature: preserve, toolChoice: preserve,
		sessionId: ({ options }) => options.cacheRetention === "none" || !options.sessionId ? drop("no retained affinity") : preserve,
		reasoning: drop("native thinking is a separate input"),
	}); }
}
