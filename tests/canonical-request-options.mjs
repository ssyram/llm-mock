import { providerContract } from "./provider-contracts.mjs";

export function canonicalRequestOptions(api, model, options, tools) {
	return providerContract(api).options(model, options, tools);
}
