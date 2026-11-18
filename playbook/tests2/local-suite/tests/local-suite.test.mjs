import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverTests } from "../discover-files.mjs";
import { executeJob } from "../execute-job.mjs";
import { suitePlan } from "../suite-plan.mjs";
import { suiteStatus } from "../suite-result.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const base = join(repo, "target/test-artifacts/playbook-suite-tests");
mkdirSync(base, { recursive: true });
const workspace = () => mkdtempSync(join(base, "runner-"));

function fixture(dir, name, body) {
  const file = join(dir, name);
  writeFileSync(file, body);
  return file;
}

function runFixture(dir, id, file) {
  return executeJob({ id, testFile: true, command: [process.execPath, "--test", "--test-reporter=tap", file] }, { repo, runDir: dir });
}

test("discovery includes newly added tests but excludes fixtures and retired artifacts", () => {
  const dir = workspace();
  mkdirSync(join(dir, "nested"));
  mkdirSync(join(dir, "fixtures"));
  mkdirSync(join(dir, "retired"));
  const first = fixture(dir, "new.test.mjs", "");
  const second = fixture(join(dir, "nested"), "other.test.mjs", "");
  fixture(join(dir, "fixtures"), "hidden.test.mjs", "");
  fixture(join(dir, "retired"), "old.test.mjs", "");
  assert.deepEqual(discoverTests([dir]), [second, first].sort());
  assert.throws(() => discoverTests([join(dir, "retired")]), /no active/);
});

test("the project plan contains all direct suites, both Pi dualities, and all showcase cases", () => {
  const plan = suitePlan(repo);
  assert.ok(plan.selectedTestFiles.includes("playbook/tests2/independent/tests/pi-frontiers.test.mjs"));
  assert.ok(plan.selectedTestFiles.includes("playbook/tests2/local-suite/tests/local-suite.test.mjs"));
  assert.ok(plan.selectedTestFiles.includes("playbook/examples2/full-showcase/tests/http-mounts.test.mjs"));
  assert.equal(new Set(plan.selectedTestFiles).size, plan.selectedTestFiles.length);
  assert.deepEqual(plan.jobs.find(item => item.id === "pi-full-showcase").cases,
    ["exact-fix", "exact-keep", "natural-fix", "negative-keep", "otherwise-keep", "invalid-first"]);
  for (const id of ["pi-v1", "pi-v2", "pi-representative"]) assert.ok(plan.jobs.some(item => item.id === id));
});

test("test counts, failing exit and an empty test file propagate to suite status", () => {
  const dir = workspace();
  const success = fixture(dir, "pass.test.mjs", "import test from 'node:test'; test('pass', () => {});\n");
  const failure = fixture(dir, "fail.test.mjs", "import test from 'node:test'; test('fail', () => { throw Error('intentional'); });\n");
  const empty = fixture(dir, "empty.test.mjs", "export const nothing = true;\n");
  const good = runFixture(dir, "pass", success);
  const bad = runFixture(dir, "fail", failure);
  const none = runFixture(dir, "empty", empty);
  assert.equal(good.status, "passed");
  assert.equal(good.counts.total, 1);
  assert.equal(bad.status, "failed");
  assert.notEqual(bad.exit, 0);
  assert.equal(none.status, "failed");
  assert.equal(suiteStatus([good, bad]), "failed");
  assert.equal(suiteStatus([good, { status: "unavailable" }]), "failed");
  assert.throws(() => suiteStatus([]), /empty/);
});
