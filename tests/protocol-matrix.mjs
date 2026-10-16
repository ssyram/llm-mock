import { PROVIDER_CONTRACTS } from "./provider-contracts.mjs";

const aliases = ["completions", "responses", "azure", "codex", "anthropic", "google", "vertex", "bedrock", "mistral", "pi-messages"];
export const PROTOCOLS = PROVIDER_CONTRACTS.map((contract, index) => ({
	alias: aliases[index], api: contract.api, contract,
	canonical: (context, model, options) => contract.request(context, model, options),
}));
