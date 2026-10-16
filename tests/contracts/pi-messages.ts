import { ProviderContract } from "./provider-contract.ts";
import { preserve } from "./behavior.ts";
import { canonicalPiMessages } from "../canonical-pi-messages.mjs";
import { fillPiMessages } from "../canonical-reply-additional.mjs";
export class PiMessagesContract extends ProviderContract {
	constructor() { super("pi-messages", canonicalPiMessages, fillPiMessages, {
		maxTokens: preserve, temperature: preserve, sessionId: preserve, toolChoice: preserve, reasoning: preserve,
	}); }
}
