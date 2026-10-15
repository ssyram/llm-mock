import { normalizeContext } from "@earendil-works/pi-ai";
import { stream as occStream } from "@earendil-works/pi-ai/api/openai-completions";
import { getCompat } from "@earendil-works/pi-ai/api/openai-completions";

const model = {
	id: "mock-gpt",
	name: "Mock",
	api: "openai-completions",
	provider: "duality",
	baseUrl: "http://127.0.0.1:8799/v1",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 100000,
	maxTokens: 1024,
};
console.log("compat:", JSON.stringify(getCompat(model), null, 0).slice(0, 600));
console.log("normalizeContext ok:", JSON.stringify(normalizeContext({ messages: [{ role: "user", content: "hi" }] })).slice(0, 200));
console.log("occStream:", typeof occStream);
