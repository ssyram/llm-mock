import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export function runTargetCacheOperation(root, input) {
  const result = spawnSync(process.execPath, [join(root, "adapters/target-cache-operation.mjs")], {
    env: { ...process.env, PLAYBOOK_ROOT: process.env.PLAYBOOK_ROOT },
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: 30000
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
