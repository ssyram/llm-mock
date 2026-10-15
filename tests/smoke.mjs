// One-shot smoke: stream via openai-completions adapter against the mock
// server, then dump the capture record for inspection.
import { startServer, freePort, withCapture } from "./harness.mjs";
import { occ, piAi } from "./pi-ai-imports.mjs";

const port = await freePort();
const server = await startServer(port);
const model = {
	id: "mock-gpt",
	name: "Mock",
	api: "openai-completions",
	provider: "duality",
	baseUrl: `http://127.0.0.1:${port}/v1`,
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 100000,
	maxTokens: 1024,
};
try {
	const cap = await withCapture(server, () =>
		occ.stream(model, piAi.normalizeContext({ messages: [{ role: "user", content: "hello" }] }), {
			apiKey: "duality",
			sessionId: "d-s1",
			maxTokens: 64,
		}).result(),
	);
	console.log("CAPTURE:", JSON.stringify(cap, null, 1));
} finally {
	await server.stop();
}
