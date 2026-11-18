import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePlaybook } from "../adapters/compile-observation-command.mjs";
import { projectStaticIr, rootStaticUnit } from "../oracle/project-static-ir.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectations = JSON.parse(readFileSync(join(root, "contract/expectations.json"), "utf8"));
// expected-static-ir.json 只是 SUT 诊断快照（见同目录 DIAGNOSTIC 旁车），不再
// 作为独立正确性 oracle：独立手写 literal/property 静态预期由实验域
// experiments/static-ir.test.mjs（Terra，parent 已核）承担；本文件保留编译确定
// 性与原生 schema 不变量。
const runDir = join(process.env.PLAYBOOK_INDEPENDENT_ARTIFACTS ?? resolve(root, "../../../target/test-artifacts/playbook-independent"), `api-${Date.now()}-${process.pid}`);
mkdirSync(runDir, { recursive: true });
assert.ok(process.env.PLAYBOOK_ROOT, "PLAYBOOK_ROOT is required");

const projectedById = new Map();
for (const item of expectations.parseCases) {
  test(`compile exposes generic static IR for ${item.id}`, () => {
    const workDir = join(runDir, item.id);
    mkdirSync(workDir, { recursive: true });
    const before = filesUnder(workDir);
    const outcome = compilePlaybook(join(root, item.file), workDir);
    assert.deepEqual(filesUnder(workDir), before, `${item.id} compile executed or wrote a side effect`);
    assert.equal(outcome.accepted, true, JSON.stringify(outcome));
    const ir = outcome.ir;
    assert.equal(ir.schemaVersion, 2, "native schemaVersion");
    assert.ok(ir.units.some((unit) => unit.path === ir.root), "IR 包含根 unit");
    for (const unit of ir.units) {
      for (const node of unit.nodes) {
        assert.ok(["rv", "user", "segment"].includes(node.kind), `${item.id}: 管理单元 kind 只能是 rv/user/segment`);
      }
    }
    const again = compilePlaybook(join(root, item.file), workDir);
    assert.deepEqual(JSON.stringify(again.ir), JSON.stringify(ir), `${item.id} 编译必须确定`);
    const projected = projectStaticIr(outcome.ir);
    projectedById.set(item.id, projected);
    writeFileSync(join(workDir, "compile.json"), JSON.stringify({ outcome, projected }, null, 2));
  });
}

for (const item of expectations.rejectCases.filter((entry) => entry.phase === "compile")) {
  test(`compile rejects ${item.id} without side effects`, () => {
    const workDir = join(runDir, item.id);
    mkdirSync(workDir, { recursive: true });
    const before = filesUnder(workDir);
    const outcome = compilePlaybook(join(root, item.file), workDir);
    assert.deepEqual(filesUnder(workDir), before, `${item.id} reject path wrote a side effect`);
    assert.equal(outcome.accepted, false, JSON.stringify(outcome));
    assert.equal(outcome.error?.class, item.errorClass, JSON.stringify(outcome));
    if (item.id === "import-unknown-with-key") {
      assert.match(outcome.error.message, /unknown/);
      assert.doesNotMatch(outcome.error.message, /not defined/i);
    }
    writeFileSync(join(workDir, "compile.json"), JSON.stringify(outcome, null, 2));
  });
}

for (const id of ["response-batching", "cache-hit-probe", "import-frame-main", "representative-pi-flow"]) {
  test(`renaming ${id} cannot change generic IR`, () => {
    const original = projectedById.get(id);
    assert.ok(original, `missing original projection for ${id}`);
    const workDir = join(runDir, `rename-${id}`);
    const copied = join(workDir, "fixtures");
    cpSync(join(root, "fixtures"), copied, { recursive: true });
    const item = expectations.parseCases.find((entry) => entry.id === id);
    const relativeFixture = relative(join(root, "fixtures"), join(root, item.file));
    const originalCopy = join(copied, relativeFixture);
    const renamed = join(dirname(originalCopy), `renamed-${id}.md`);
    renameSync(originalCopy, renamed);
    const before = filesUnder(workDir);
    const outcome = compilePlaybook(renamed, workDir);
    assert.deepEqual(filesUnder(workDir), before, `${id} renamed compile wrote a side effect`);
    assert.equal(outcome.accepted, true, JSON.stringify(outcome));
    assert.deepEqual(projectStaticIr(outcome.ir), original);
  });
}

function assertPartial(actual, expected, path) {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path} must be an array`);
    assert.equal(actual.length, expected.length, `${path} length`);
    return expected.forEach((item, index) => assertPartial(actual[index], item, `${path}[${index}]`));
  }
  if (expected && typeof expected === "object") {
    assert.ok(actual && typeof actual === "object", `${path} must be an object`);
    return Object.entries(expected).forEach(([key, value]) => assertPartial(actual[key], value, `${path}.${key}`));
  }
  assert.deepEqual(actual, expected, path);
}

function filesUnder(directory, base = directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path, base) : [relative(base, path)];
  }).sort();
}
