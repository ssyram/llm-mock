import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { canonicalOres } from "../canonical-ores.mjs";
import { fillResponses } from "../canonical-responses-reply.mjs";
export class ResponsesContract extends ProviderContract {
	constructor() { super("openai-responses", canonicalOres, fillResponses, {
		maxTokens: ({ model }) => model.compat?.supportsMaxOutputTokens === false || model.compat?.omitUnsupportedFields
			? drop("compat suppresses output limit") : transform({ tag: "minimum-truthy", minimum: 16 }),
		temperature: preserve, toolChoice: preserve,
		sessionId: ({ options }) => options.cacheRetention === "none" || !options.sessionId ? drop("no retained session") : preserve,
		reasoning: drop("reasoningEffort/summary are separate native inputs"),
	}); }
}
