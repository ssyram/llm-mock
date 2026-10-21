import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { responseReasoning } from "./response-reasoning.ts";
import { canonicalAzure } from "../canonical-family-variants.mjs";
import { fillResponses } from "../canonical-responses-reply.mjs";
export class AzureContract extends ProviderContract {
	constructor() { super("azure-openai-responses", canonicalAzure, fillResponses, {
		cacheRetention: drop("no decoded scalar retention option"),
		maxTokens: ({ model }) => model.compat?.supportsMaxOutputTokens === false || model.compat?.omitUnsupportedFields
			? drop("compat suppresses output limit") : transform({ tag: "minimum-truthy", minimum: 16 }),
		temperature: preserve, toolChoice: preserve,
		sessionId: ({ options }) => options.sessionId === undefined ? preserve : transform({ tag: "codepoint-prefix", length: 64 }),
		reasoning: ({ model, options }) => transform({ tag: "program", name: "azure-native-reasoning", apply: () => responseReasoning(model, options) }),
	}); }
}
