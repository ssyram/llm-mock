import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { canonicalGai } from "../canonical-gai.mjs";
import { fillGoogle } from "../canonical-google-reply.mjs";
export class GoogleContract extends ProviderContract {
	constructor() { super("google-generative-ai", canonicalGai, fillGoogle, {
		maxTokens: preserve, temperature: preserve, sessionId: drop("no Google session field"),
		toolChoice: transform({ tag: "lookup", values: { auto: "auto", none: "none", any: "any" } }),
		reasoning: drop("thinking is a separate native input"),
	}); }
}
