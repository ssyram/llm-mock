import test from "node:test";
import { bedrockPartitionExperiment } from "./bedrock-partition-experiment.mjs";

test("Bedrock SDK EventStream decoder: every single cut, byte chunks, bounded double cuts and CRC faults", { timeout: 300000 }, async (t) => {
	const result = await bedrockPartitionExperiment();
	t.diagnostic(JSON.stringify(result.cases));
});
