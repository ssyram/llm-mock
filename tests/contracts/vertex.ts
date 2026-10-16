import { ProviderContract } from "./provider-contract.ts";
import { preserve, drop, transform } from "./behavior.ts";
import { canonicalVertex } from "../canonical-family-variants.mjs";
import { fillGoogle } from "../canonical-google-reply.mjs";
export class VertexContract extends ProviderContract {
	constructor() { super("google-vertex", canonicalVertex, fillGoogle, {
		maxTokens: preserve, temperature: preserve, sessionId: drop("no Vertex session field"),
		toolChoice: transform({ tag: "lookup", values: { auto: "auto", none: "none", any: "any" } }),
		reasoning: drop("thinking is a separate native input"),
	}); }
}
