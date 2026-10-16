import test from "node:test";
import { ssePartitionExperiment } from "./sse-partition-experiment.mjs";

for (const api of ["openai-completions", "openai-responses", "azure-openai-responses", "anthropic-messages", "google-generative-ai", "google-vertex", "mistral-conversations", "pi-messages"]) {
	test(`${api}: every single cut, one-byte chunks, bounded double cuts, EOF and cancellation`, { timeout: 300000 }, async (t) => {
		const result = await ssePartitionExperiment(api);
		t.diagnostic(JSON.stringify({ api, partitions: result.cases.reduce((n, c) => n + c.partitions, 0), cancellations: result.cancellations, faultsDetected: result.faultsDetected }));
	});
}
