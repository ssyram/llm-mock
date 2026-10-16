import test from "node:test";
import { ssePartitionExperiment } from "./sse-partition-experiment.mjs";
export const TEST_DEPENDENCIES = ["zstd"];

test("Codex SSE: exhaustive single cuts, bounded double cuts and interruption", { timeout: 300000 }, async (t) => {
	const result = await ssePartitionExperiment("openai-codex-responses");
	t.diagnostic(JSON.stringify(result.cases));
});
