import test from "node:test";
import assert from "node:assert/strict";
import { assertNoDuplicateFlags, mergeCliFlags } from "../support/merge-cli-flags.mjs";

test("CLI helper merges distinct flags", () => {
  assert.deepEqual(mergeCliFlags(["--offline", "--model", "local/m"], ["--session-dir", "sessions"]), [
    "--offline", "--model", "local/m", "--session-dir", "sessions"
  ]);
});

test("CLI helper rejects duplicate flags instead of last-wins", () => {
  assert.throws(() => mergeCliFlags(["--offline"], ["--offline"]), /duplicate CLI flag --offline/);
  assert.throws(() => assertNoDuplicateFlags(["--model=a", "--model", "b"]), /duplicate CLI flag --model/);
});

test("arguments after -- are not parsed as flags", () => {
  assert.deepEqual(assertNoDuplicateFlags(["--offline", "--", "--offline"]), ["--offline", "--", "--offline"]);
});
