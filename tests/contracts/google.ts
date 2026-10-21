import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { googleThinking } from "./google-thinking.ts";
import { googleToolMode } from "./google-tool-mode.ts";
import { canonicalGai } from "../canonical-gai.mjs";
import { fillGoogle } from "../canonical-google-reply.mjs";
export class GoogleContract extends ProviderContract {
	constructor() { super("google-generative-ai", canonicalGai, fillGoogle, {
		cacheRetention: drop("no decoded scalar retention option"),
		maxTokens: preserve, temperature: preserve, sessionId: drop("no Google session field"),
		toolChoice: ({ model, options, tools }) => transform({ tag: "program", name: "google-native-tool-mode", apply: () => googleToolMode(model, options, tools) }),
		reasoning: ({ model, options }) => transform({ tag: "program", name: "google-native-thinking", apply: () => googleThinking(model, options) }),
	}); }
}
