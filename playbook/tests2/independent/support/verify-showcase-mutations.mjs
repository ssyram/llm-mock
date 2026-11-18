import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { providerRequestMutations } from "./mutate-provider-request.mjs";
import { replayShowcaseRequest } from "./replay-showcase-request.mjs";
import { snapshotProjectFiles } from "./snapshot-project-files.mjs";

const expectedErrors = {
  assistantText: "playbook_segment_drift",
  toolArguments: "playbook_segment_drift",
  toolCallId: "playbook_segment_drift",
  toolResult: "playbook_mismatch"
};

export function verifyShowcaseMutations({ playbook, runDir, projectDir, check }) {
  const mutationsDir = join(runDir, "mutations");
  mkdirSync(mutationsDir, { recursive: true });
  const before = snapshotProjectFiles(projectDir);
  const source = [...check.frontiers].reverse().find(({ input }) =>
    input.request.context.messages.some((message) => message.role === "toolResult"));
  assert.ok(source, "no captured request contains tool results");
  const results = [];
  const failures = [];
  for (const mutation of providerRequestMutations(source.input)) {
    let reply;
    let processFailure = null;
    try {
      reply = replayShowcaseRequest({ playbook, input: mutation.input, artifactDir: join(mutationsDir, mutation.field) }).reply;
    } catch (error) {
      processFailure = error.message;
    }
    const after = snapshotProjectFiles(projectDir);
    const unchanged = JSON.stringify(before) === JSON.stringify(after);
    const passed = !processFailure && reply?.error?.status === 422 && reply.error.code === expectedErrors[mutation.field] && unchanged;
    const result = { field: mutation.field, status: passed ? "passed" : "failed", error: reply?.error ?? null,
      expectedErrorCode: expectedErrors[mutation.field], processFailure, sideEffectsUnchanged: unchanged };
    results.push(result);
    if (!passed) failures.push(mutation.field);
    writeFileSync(join(mutationsDir, "results.json"), JSON.stringify(results, null, 2));
  }
  assert.deepEqual(failures, [], `mutation checks failed: ${failures.join(", ")}`);
  return results;
}
