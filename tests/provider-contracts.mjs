import { CompletionsContract } from "./contracts/completions.ts";
import { ResponsesContract } from "./contracts/responses.ts";
import { AzureContract } from "./contracts/azure.ts";
import { CodexContract } from "./contracts/codex.ts";
import { AnthropicContract } from "./contracts/anthropic.ts";
import { GoogleContract } from "./contracts/google.ts";
import { VertexContract } from "./contracts/vertex.ts";
import { BedrockContract } from "./contracts/bedrock.ts";
import { MistralContract } from "./contracts/mistral.ts";
import { PiMessagesContract } from "./contracts/pi-messages.ts";

export const PROVIDER_CONTRACTS = [new CompletionsContract(), new ResponsesContract(), new AzureContract(), new CodexContract(),
	new AnthropicContract(), new GoogleContract(), new VertexContract(), new BedrockContract(), new MistralContract(), new PiMessagesContract()];
export function providerContract(api) {
	const contract = PROVIDER_CONTRACTS.find((value) => value.api === api);
	if (!contract) throw new Error(`unsupported contract: ${api}`);
	return contract;
}
