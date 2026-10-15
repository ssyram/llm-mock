// Local URLs follow each protocol's transport contract, not the family root's path.
export function makeModel(api, port) {
	const base = {
		id: "mock-gpt", name: "Mock", api, provider: "duality", reasoning: false,
		input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 100000, maxTokens: 1024,
	};
	const root = `http://127.0.0.1:${port}`;
	switch (api) {
		case "openai-completions":
		case "openai-responses": return { ...base, baseUrl: `${root}/v1` };
		case "azure-openai-responses": return { ...base, baseUrl: `${root}/openai/v1` };
		case "openai-codex-responses": return { ...base, baseUrl: `${root}/backend-api` };
		case "anthropic-messages":
		case "pi-messages":
		case "mistral-conversations": return { ...base, baseUrl: root };
		case "google-generative-ai": return { ...base, id: "mock-gemini", baseUrl: `${root}/v1beta` };
		case "google-vertex": return { ...base, id: "mock-gemini", baseUrl: `${root}/v1` };
		case "bedrock-converse-stream": return { ...base, id: "anthropic.claude-mock", baseUrl: root };
		default: throw new Error(`unknown API: ${api}`);
	}
}

export function streamOptions(api) {
	const options = { apiKey: "duality", sessionId: "d-s1", maxTokens: 64, timeout: 10000 };
	if (api === "openai-codex-responses") {
		// The client requires an account claim even when authenticating to a local mock.
		const payload = Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "duality" } })).toString("base64");
		options.apiKey = `e30.${payload}.mock`;
		options.transport = "sse";
	}
	if (api === "bedrock-converse-stream") {
		options.region = "us-east-1";
		options.env = { AWS_BEDROCK_FORCE_HTTP1: "1" };
	}
	return options;
}
