import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const current = Number(input.with.count);
const limit = Number(input.with.limit);
if (!Number.isInteger(current) || !Number.isInteger(limit) || current < 0 || limit < 1) {
  process.stderr.write("count and limit must be non-negative integers with limit >= 1");
  process.exit(2);
}
const next = current + 1;
recordObservation(input.with.observationFile, current, next);
process.stdout.write(JSON.stringify({
  result: next < limit ? "again" : "done",
  values: { next }
}));

function recordObservation(relativeFile, currentValue, nextValue) {
  if (!relativeFile) return;
  const root = process.env.PLAYBOOK_TEST_ARTIFACT_DIR;
  if (!root) throw new Error("PLAYBOOK_TEST_ARTIFACT_DIR is required for observations");
  const file = resolve(root, relativeFile);
  let observation = { calls: 0, transitions: [] };
  try {
    observation = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  observation.calls += 1;
  observation.transitions.push({ current: currentValue, next: nextValue });
  writeFileSync(file, JSON.stringify(observation));
}
