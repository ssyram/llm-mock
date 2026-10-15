import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { readFuzzEvidence } from "./read-fuzz-evidence.mjs";
import { deepDiff } from "./harness.mjs";
import { PROTOCOLS } from "./protocol-matrix.mjs";
import { rng, genContext, genReplyCase } from "./fuzz-message-generator.mjs";
import { makeModel, streamOptions } from "./models-shared.mjs";
import { canonicalReply, compareReply } from "./canonical-reply.mjs";
import { classify, summaryPath } from "./fuzz-expand-report.mjs";

const summary = JSON.parse(readFileSync(summaryPath));
const path = process.argv[2] ?? new URL("./fuzz-expand-results.jsonl.gz", import.meta.url);
let count = 0;
let generated;
const seen = new Set();
const coverage = {};
for await (const row of readFuzzEvidence(path)) {
	count++;
	assert.equal(row.line, count);
	const index = PROTOCOLS.findIndex(({ api }) => api === row.api);
	assert.ok(index >= 0);
	const key = `${row.api}/${row.seed}/${row.dir}`;
	assert.ok(!seen.has(key), key);
	seen.add(key);
	assert.equal(row.category, classify(row), key);
	assert.ok(row.seed >= 1 && row.seed <= summary.seedCount);
	assert.equal(row.vision, Math.floor((row.seed - 1) / 8) % 2 === 0);
	const model = { ...makeModel(row.api, 0), input: row.vision ? ["text", "image"] : ["text"] };
	if (row.dir === "req") {
		const random = rng(row.seed * 1000003 + index);
		const ident = { api: row.api, provider: model.provider, id: model.id };
		generated = { req: genContext(random, ident, row.seed), reply: genReplyCase(random, ident, row.seed) };
	}
	assert.deepEqual(row.source, generated[row.dir], `${key} reproducible source`);
	const shapeKey = `${row.api}/${row.dir}/${row.shape}/${row.vision}`;
	coverage[shapeKey] = (coverage[shapeKey] ?? 0) + 1;
	if (row.category === "green") {
		assert.equal(row.captureCount, 1);
		assert.deepEqual(row.diffs, []);
		const expected = row.dir === "req" ? PROTOCOLS[index].canonical(row.source, model, streamOptions(row.api)) : canonicalReply(row.api, row.source.message, model);
		assert.deepEqual(deepDiff(row.expected, expected, [], "$", [], row.api), [], `${key} independently regenerated frozen expectation`);
		const diffs = row.dir === "req" ? deepDiff(row.actual, expected, [], "$", [], row.api)
			: compareReply(row.actual, expected, deepDiff, Date.parse(summary.startedAt), Date.parse(summary.updatedAt));
		assert.deepEqual(diffs, [], `${key} independent actual comparison`);
	} else if (row.category === "external-boundary") {
		assert.equal(row.captureCount, 0);
		assert.equal(row.expected, null);
		assert.equal(row.actual, null);
	}
	const ledger = summary.rows[count - 1];
	for (const field of ["api", "dir", "name", "seed", "shape", "vision", "category", "captureCount", "line"]) assert.deepEqual(row[field], ledger[field], `${key}/${field}`);
}
assert.equal(summary.status, "completed");
assert.equal(count, summary.seedCount * 20);
assert.equal(count, summary.rows.length);
assert.deepEqual(summary.crashFindings, []);
assert.equal(summary.seedCount, 800);
assert.equal(Object.keys(coverage).length, 10 * 2 * 8 * 2);
assert.ok(Object.values(coverage).every((value) => value === 50));
const result = { evidenceRows: count, uniqueKeys: seen.size, coverage, oracleRecomputedForGreen: summary.counts.green, counts: summary.counts, verifiedAt: new Date().toISOString() };
writeFileSync(new URL("./fuzz-expand-validation.json", import.meta.url), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ evidenceRows: count, uniqueKeys: seen.size, shapeDirectionVisionBuckets: Object.keys(coverage).length, eachBucket: 50, counts: summary.counts }));
