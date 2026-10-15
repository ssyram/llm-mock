import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const load = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url)));
const matrix = load("./matrix-ten-results.json");
const fuzz = load("./w06-fuzz-results.json");
const wire = load("./w08-wire-results.json");
const baseline = load("./w08-baseline.json");
const key = (row) => `${row.api}/${row.dir}/${row.name}`;
function classify(row) {
	if (row.ok) return "green";
	const text = row.diffs.join("\n");
	if (row.api === "openai-codex-responses" && text.includes("capture file, got 0") && text.includes("valid UTF-8")) return "T-codex-zstd";
	if (row.name === "w06-unicode-session" && text.includes("capture file, got 0") && text.includes("ByteString")) return "T-header-ByteString";
	if (["openai-responses", "azure-openai-responses"].includes(row.api) && row.phase === "oracle" && text.includes('"reasoning_content" is not valid JSON')) return "O18-domain-rejection";
	throw new Error(`Unclassified failure: ${key(row)}: ${text}`);
}
const rows = [...matrix.results.map((row, index) => ({ suite: "duality", key: key(row), category: classify(row), phase: row.phase, diffs: row.diffs, evidence: `matrix-ten-results.json#results[${index}]` })),
	...fuzz.results.map((row, index) => ({ suite: "fuzz", key: key(row), category: classify(row), phase: row.phase, diffs: row.diffs, evidence: `w06-fuzz-results.json#results[${index}]` }))];
for (const [index, check] of wire.checks.entries()) {
	if (!check.ok) assert.match(check.name, /^openai-codex-responses\/wire\/endTurn-(stop|length|toolUse)-(true|false)$/);
	rows.push({ suite: "wire", key: check.name, category: check.ok ? "green" : "W08-F4-codex-route-endTurn", evidence: `w08-wire-results.json#checks[${index}]` });
}
assert.deepEqual(fuzz.crashFindings, []);
assert.equal(new Set(rows.map((row) => `${row.suite}/${row.key}`)).size, rows.length);
const current = new Map(matrix.results.map((row) => [key(row), row]));
const newGreen = [], newRed = [];
for (const row of baseline.results) {
	assert.ok(current.has(key(row)), `Removed baseline case ${key(row)}`);
	if (!row.ok && current.get(key(row)).ok) newGreen.push(key(row));
	if (row.ok && !current.get(key(row)).ok) newRed.push(key(row));
}
const summary = {};
for (const row of rows) {
	const counts = summary[row.suite] ??= {};
	counts[row.category] = (counts[row.category] ?? 0) + 1;
}
const added = matrix.results.filter((row) => !baseline.results.some((old) => key(old) === key(row))).map((row) => ({ key: key(row), category: classify(row) }));
const out = { matrixStartedAt: matrix.startedAt, matrixUpdatedAt: matrix.updatedAt, seedCount: fuzz.seedCount, summary, newGreen, newRed, added, rows };
writeFileSync(new URL("./w08-results-ledger.json", import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify({ total: rows.length, summary, newGreen, newRed, addedCount: added.length }, null, 2));
