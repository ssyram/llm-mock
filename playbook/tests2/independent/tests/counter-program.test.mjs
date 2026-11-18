import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = join(process.env.PLAYBOOK_INDEPENDENT_ARTIFACTS ?? resolve(root, "../../../target/test-artifacts/playbook-independent"), `counter-program-${Date.now()}-${process.pid}`);
mkdirSync(artifactDir, { recursive: true });
const observation = join(artifactDir, "counter-observation.json");
writeFileSync(observation, JSON.stringify({ calls: 99, transitions: [] }));

test("observation history never drives counter result or next value", () => {
  assert.deepEqual(run(0), { result: "again", values: { next: 1 } });
  assert.deepEqual(run(2), { result: "done", values: { next: 3 } });
  const recorded = JSON.parse(readFileSync(observation, "utf8"));
  assert.equal(recorded.calls, 101);
  assert.deepEqual(recorded.transitions, [{ current: 0, next: 1 }, { current: 2, next: 3 }]);
});

function run(count) {
  const result = spawnSync(process.execPath, [join(root, "fixtures/programs/counter-program.mjs")], {
    env: { ...process.env, PLAYBOOK_TEST_ARTIFACT_DIR: artifactDir },
    input: JSON.stringify({ with: { count, limit: 3, observationFile: "counter-observation.json" } }),
    encoding: "utf8",
    timeout: 30000
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
