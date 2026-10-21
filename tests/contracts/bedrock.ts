import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { canonicalBedrock } from "../canonical-bedrock.mjs";
import { canonicalBedrockReasoning } from "../canonical-bedrock-reasoning.mjs";
import { fillBedrock } from "../canonical-bedrock-reply.mjs";
export class BedrockContract extends ProviderContract {
	constructor() { super("bedrock-converse-stream", canonicalBedrock, fillBedrock, {
		cacheRetention: drop("cache points do not decode to a scalar retention option"),
		maxTokens: ({ model }) => {
			const id = model.id.toLowerCase(), name = model.name?.toLowerCase() ?? "";
			const claude = id.includes("anthropic.claude") || id.includes("anthropic/claude") || name.includes("anthropic.claude") || name.includes("anthropic/claude") || name.includes("claude");
			return claude ? transform({ tag: "nullish-default", value: model.maxTokens }) : preserve;
		},
		temperature: preserve, toolChoice: ({ tools, options }) => tools.length && options.toolChoice !== "none" ? preserve : drop("no toolConfig emitted"), sessionId: drop("no Bedrock session field"),
		reasoning: ({ model, options }) => model.reasoning ? transform({ tag: "program", name: "bedrock-reasoning-envelope", apply: (value) => canonicalBedrockReasoning(model, { ...options, reasoning: value }) }) : drop("model reasoning disabled"),
	}); }
}
