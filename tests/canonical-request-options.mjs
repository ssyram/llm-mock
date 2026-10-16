import { providerContract } from "./provider-contracts.mjs";

export function canonicalRequestOptions(api, model, options) {
	return providerContract(api).options(model, options);
}
