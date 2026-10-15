import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const matrix = JSON.parse(readFileSync(new URL("./matrix-ten-results.json", import.meta.url)));
const fuzz = JSON.parse(readFileSync(new URL("./w06-fuzz-results.json", import.meta.url)));
function classify(result) {
	if (result.ok) return { category: "green", mechanism: "matched-frozen-oracle" };
	const evidence = result.diffs.join("\n");
	if (result.api === "openai-codex-responses" && evidence.includes("capture file, got 0") && evidence.includes("valid UTF-8")) return { category: "T", mechanism: "codex-zstd-before-capture" };
	if (result.name === "w06-unicode-session" && evidence.includes("capture file, got 0") && evidence.includes("ByteString")) return { category: "T", mechanism: "node-header-ByteString" };
	if (["openai-responses", "azure-openai-responses"].includes(result.api) && result.phase === "oracle" && evidence.includes('"reasoning_content" is not valid JSON')) return { category: "finding", mechanism: "O18-existing-domain-rejection" };
	if (result.api === "anthropic-messages" && ["w06-r-aborted", "w06-r-deferred"].includes(result.name)) return { category: "finding", mechanism: "W06-F1-unsupported-refusal-text" };
	if (result.api === "mistral-conversations" && result.name === "w06-retention-none") return { category: "finding", mechanism: "W06-F2-mistral-routing" };
	if (result.api === "mistral-conversations" && result.name === "w06-surrogate-order") return { category: "finding", mechanism: "W06-F3-mistral-empty-chunk" };
	throw new Error(`Unclassified failure: ${result.api}/${result.dir}/${result.name}: ${evidence}`);
}
const rows = [...matrix.results.map((result) => ({ suite: "duality", ...result, ...classify(result) })),
	...fuzz.results.map((result) => ({ suite: "fuzz", ...result, ...classify(result) }))];
assert.equal(new Set(rows.map((row) => `${row.suite}/${row.api}/${row.dir}/${row.name}`)).size, rows.length);
const summary = {};
for (const row of rows) {
	const key = `${row.suite}/${row.api}`;
	const counts = summary[key] ??= { green: 0, T: 0, finding: 0 };
	counts[row.category]++;
}
const mechanisms = {};
for (const row of rows) mechanisms[row.mechanism] = (mechanisms[row.mechanism] ?? 0) + 1;
assert.deepEqual(fuzz.crashFindings, []);
writeFileSync(new URL("./w06-results-ledger.json", import.meta.url), JSON.stringify({ matrixStartedAt: matrix.startedAt, matrixUpdatedAt: matrix.updatedAt, seedCount: fuzz.seedCount, summary, mechanisms, rows }, null, 2));
console.log(JSON.stringify({ total: rows.length, summary, mechanisms }, null, 2));
