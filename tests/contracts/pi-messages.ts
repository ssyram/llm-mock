import { ProviderContract } from "./provider-contract.ts";
import { preserve, transform } from "./behavior.ts";
import { canonicalPiMessages } from "../canonical-pi-messages.mjs";
import { fillPiMessages } from "../canonical-reply-additional.mjs";
export class PiMessagesContract extends ProviderContract {
	constructor() { super("pi-messages", canonicalPiMessages, fillPiMessages, {
		cacheRetention: ({ options }) => transform({ tag: "program", name: "pi-retention-or-legacy-env", apply: () => options.cacheRetention || ((options.env?.PI_CACHE_RETENTION || process.env.PI_CACHE_RETENTION) === "long" ? "long" : undefined) }), maxTokens: preserve, temperature: preserve, sessionId: preserve, toolChoice: preserve, reasoning: preserve,
	}); }
}
