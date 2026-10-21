import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { responseReasoning } from "./response-reasoning.ts";
import { canonicalCodex } from "../canonical-family-variants.mjs";
import { fillResponses } from "../canonical-responses-reply.mjs";
export class CodexContract extends ProviderContract {
	constructor() { super("openai-codex-responses", canonicalCodex, fillResponses, {
		cacheRetention: drop("no decoded scalar retention option"),
		maxTokens: drop("Codex does not emit maxTokens"), temperature: preserve,
		toolChoice: transform({ tag: "nullish-default", value: "auto" }),
		sessionId: ({ options }) => options.cacheRetention === "none" || !options.sessionId ? drop("no retained session") : transform({ tag: "codepoint-prefix", length: 64 }),
		reasoning: ({ model, options }) => transform({ tag: "program", name: "codex-native-reasoning", apply: () => responseReasoning(model, options) }),
	}); }
}
