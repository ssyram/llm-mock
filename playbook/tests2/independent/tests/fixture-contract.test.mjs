import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(join(root, "contract/expectations.json"), "utf8"));
const staticExpected = JSON.parse(readFileSync(join(root, "contract/expected-static-ir.json"), "utf8"));
const obligationMap = JSON.parse(readFileSync(join(root, "contract/static-dynamic-obligation-map.json"), "utf8"));
const listed = new Set([...contract.parseCases, ...contract.rejectCases].map((item) => item.file));
const required = [
  "response-batching", "affine-per-response", "label-loop-dynamic-id", "import-frame-main",
  "import-default-param", "recursive-import", "value-reference", "external-counter", "segment-aggregator",
  "system-import-main", "reader-isolation", "cache-hit-probe", "cache-volatile", "label-on-tool-result",
  "ordered-cases", "compaction-classifier", "pi-loop-child", "representative-pi-flow",
  "affine-two-holders", "affine-local-with-agg", "label-in-tool-list", "label-in-aggregation",
  "unknown-label", "duplicate-label", "cross-frame-target", "arithmetic-template",
  "import-unknown-with-key", "missing-command", "reader-stack-return", "missing-reference",
  "result-entry-no-history", "dead-goto-budget", "program-fault-hard-stop", "unsupported-other-selector", "label-on-tool-result"
];

function markdownFiles(directory) {
  return readdirSync(directory).filter((name) => name.endsWith(".md")).map((name) => relative(root, join(directory, name)));
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".mjs") ? [path] : [];
  });
}

test("all named contract cases and fixture files correspond", () => {
  for (const id of required) {
    assert.ok([...contract.parseCases, ...contract.rejectCases].some((item) => item.id === id), `missing case ${id}`);
  }
  for (const file of listed) assert.ok(existsSync(join(root, file)), `missing fixture ${file}`);
  assert.deepEqual(Object.keys(staticExpected).sort(), contract.parseCases.map((item) => item.id).sort());
  for (const item of contract.parseCases) assert.ok(obligationMap[item.id], `missing static/dynamic evidence map for ${item.id}`);
  const forbiddenDynamicKeys = [
    "expectedCounterTransitions", "freshFramePerImport", "eofReturns", "hotObservationDelta",
    "coldObservationMayIncrease", "restoresMissingHistory", "savedLocal", "importToolIterations",
    "importTokens", "counterTransitions", "toolCallsPerImport", "observationAffectsResult"
  ];
  const serialized = JSON.stringify(staticExpected);
  for (const key of forbiddenDynamicKeys) assert.ok(!serialized.includes(`\"${key}\"`), `static IR expected contains dynamic key ${key}`);
  const allFixtures = [
    ...markdownFiles(join(root, "fixtures/expected-parse")),
    ...markdownFiles(join(root, "fixtures/expected-reject"))
  ];
  assert.deepEqual(allFixtures.filter((file) => !listed.has(file)), ["fixtures/expected-reject/cross-frame-target-child.md"]);
});

test("canonical positive fixtures use code-block labels and no arithmetic templates", () => {
  for (const item of contract.parseCases) {
    const source = readFileSync(join(root, item.file), "utf8");
    assert.doesNotMatch(source, /<a\s+id=/i, `${item.id} must not use HTML anchors`);
    assert.doesNotMatch(source, /^```system\s*$/m, `${item.id} must use match system`);
    assert.doesNotMatch(source, /^\s+[A-Za-z0-9_-]+:\s+null\s*$/m, `${item.id} front matter defaults must be scalar values`);
    assert.doesNotMatch(source, /{{[^}\n]*[+*/][^}\n]*}}/, `${item.id} must not calculate in templates`);
  }
  assert.match(readFileSync(join(root, "fixtures/expected-parse/compaction-classifier.md"), "utf8"), /```match\ndata: compaction/);
  const batching = readFileSync(join(root, "fixtures/expected-parse/response-batching.md"), "utf8");
  assert.equal((batching.match(/```call bash/g) ?? []).length, 3);
  for (const item of contract.parseCases) {
    const source = readFileSync(join(root, item.file), "utf8");
    assert.doesNotMatch(source, /^```(label|goto|end|import|internal|response|match system|match compaction)\s*$/m, `${item.id} must use the three-unit syntax`);
  }
  assert.equal((batching.match(/```toolResult/g) ?? []).length, 1, "two calls intentionally use default otherwise");
});

test("source files obey local layout rules", () => {
  for (const path of sourceFiles(root)) {
    const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("//"));
    assert.ok(lines.length <= 200, `${relative(root, path)} has ${lines.length} nonblank noncomment lines`);
    assert.notEqual(statSync(path).size, 0);
  }
  const names = sourceFiles(root).map((path) => path.split("/").pop());
  assert.ok(!names.some((name) => ["utils.mjs", "helpers.mjs", "common.mjs", "shared.mjs"].includes(name)));
});
