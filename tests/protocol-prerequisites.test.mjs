import test from "node:test";
import assert from "node:assert/strict";
import { protocolSelection } from "./protocol-prerequisites.mjs";
import { testRequirements } from "./test-requirements.mjs";

const protocols = ["openai-completions", "openai-codex-responses", "google-vertex", "pi-messages"].map((api) => ({ api }));
test("missing compression excludes only Codex HTTP and records NOT VERIFIED", () => {
	const plan = protocolSelection(protocols, { missing: "test missing zstd" });
	assert.deepEqual(plan.available.map(({ api }) => api), ["openai-completions", "google-vertex", "pi-messages"]);
	assert.deepEqual(plan.skipped, [{ api: "openai-codex-responses", reason: "test missing zstd" }]);
	assert.equal(protocolSelection(protocols, {}).available.length, 4);
});
test("broken compression is failure, not a successful skip, while other protocols remain selected", () => {
	const previous = process.exitCode;
	try {
		const plan = protocolSelection(protocols, { invalid: "test broken zstd" });
		assert.equal(process.exitCode, 1); assert.equal(plan.skipped[0].failed, true); assert.equal(plan.available.length, 3);
	} finally { process.exitCode = previous; }
});
test("shared experiments and non-compressed transports have no file-wide CLI dependency", () => {
	for (const name of ["contract-field-probes", "tool-traces", "stream-transport-cancel", "transport-unblock", "script-envelope", "final-four"]) {
		assert.equal(testRequirements(new URL(`./${name}.test.mjs`, import.meta.url).pathname).has("zstd"), false, name);
	}
	assert.deepEqual([...testRequirements(new URL("./missing-zstd.test.mjs", import.meta.url).pathname)].sort(), ["node-zstd"]);
});
