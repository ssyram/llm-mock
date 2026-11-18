import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertReplayMatchesFrontier } from "../oracle/pi-frontiers.mjs";
import { replayShowcaseRequest } from "./replay-showcase-request.mjs";

export function verifyShowcaseReplays({ playbook, runDir, check }) {
  const replayDir = join(runDir, "replay");
  const cacheDir = join(runDir, "replay-cache");
  mkdirSync(replayDir, { recursive: true });
  const results = [];
  const failures = [];
  for (const frontier of check.frontiers) {
    const dir = join(replayDir, String(frontier.seq).padStart(3, "0"));
    const item = { seq: frontier.seq, state: frontier.state, runs: [] };
    results.push(item);
    if (frontier.outcome.accepted && !frontier.next) {
      item.status = "partial";
      continue;
    }
    for (const [mode, cache] of [["cold", null], ["shared", cacheDir], ["repeat", cacheDir]]) {
      const entry = { mode, status: "running", cacheHits: [] };
      item.runs.push(entry);
      try {
        const replay = replayShowcaseRequest({ playbook, input: frontier.input, artifactDir: join(dir, mode), cacheDir: cache });
        entry.command = replay.command;
        entry.cacheHits = replay.witness.touchedExistingEntries;
        assertReplayMatchesFrontier(frontier, replay.reply);
        entry.status = "passed";
      } catch (error) {
        entry.status = "failed";
        entry.error = error.message;
        failures.push(`${frontier.seq}:${mode}`);
      }
      writeFileSync(join(replayDir, "results.json"), JSON.stringify(results, null, 2));
    }
    item.status = item.runs.every((run) => run.status === "passed") ? "passed" : "failed";
    writeFileSync(join(replayDir, "results.json"), JSON.stringify(results, null, 2));
  }
  const hits = results.flatMap((item) => item.runs.flatMap((run) => run.cacheHits));
  if (!hits.length) failures.push("no observable shared-cache restore: see cache-witness.json files");
  if (!results.every((item) => item.status === "passed")) failures.push("some captured frontiers failed or are partial");
  assert.deepEqual(failures, [], failures.join("; "));
  return { status: "passed", results, observedCacheHits: hits.length };
}
