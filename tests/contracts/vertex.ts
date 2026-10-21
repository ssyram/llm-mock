import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { googleThinking } from "./google-thinking.ts";
import { googleToolMode } from "./google-tool-mode.ts";
import { canonicalVertex } from "../canonical-family-variants.mjs";
import { fillGoogle } from "../canonical-google-reply.mjs";
export class VertexContract extends ProviderContract {
	constructor() { super("google-vertex", canonicalVertex, fillGoogle, {
		cacheRetention: drop("no decoded scalar retention option"),
		maxTokens: preserve, temperature: preserve, sessionId: drop("no Vertex session field"),
		toolChoice: ({ model, options, tools }) => transform({ tag: "program", name: "vertex-native-tool-mode", apply: () => googleToolMode(model, options, tools) }),
		reasoning: ({ model, options }) => transform({ tag: "program", name: "vertex-native-thinking", apply: () => googleThinking(model, options) }),
	}); }
}
