import assert from "node:assert/strict";
import { TraceMismatch } from "./reference-trace.mjs";

export function verifyCapturedPrefix(baseline, candidate) {
  if (candidate.length > baseline.length) throw new TraceMismatch("extra_history", "candidate is longer than captured history");
  candidate.forEach((event, index) => {
    try {
      assert.deepEqual(event, baseline[index]);
    } catch {
      throw new TraceMismatch("captured_history_drift", `captured event ${index} changed`);
    }
  });
  return {
    accepted: true,
    complete: candidate.length === baseline.length,
    next: baseline[candidate.length] ?? null
  };
}

export function mutateCapturedEvent(baseline, index, mutate) {
  const copy = structuredClone(baseline);
  copy[index] = mutate(copy[index]);
  return copy;
}
