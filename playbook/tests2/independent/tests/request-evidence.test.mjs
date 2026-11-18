import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMock2Request } from "../support/run-mock2-request.mjs";

const base = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../target/test-artifacts/playbook-request-evidence");
mkdirSync(base, { recursive: true });

for (const [name, source, expected] of [
  ["bad-json", "process.stdout.write('not json')", { stdout: "not json", status: 0, signal: null }],
  ["nonzero", "process.stdout.write('raw failure'); process.stderr.write('diagnostic'); process.exitCode=7", { stdout: "raw failure", status: 7, signal: null }],
  ["timeout", "process.stdout.write('started'); setInterval(() => {}, 1000)", { stdout: "started", status: null, signal: "SIGTERM" }]
]) {
  test(`${name} preserves input, raw output and process status before rejecting`, () => {
    const dir = mkdtempSync(join(base, `${name}-`));
    const root = join(dir, "root");
    const artifactDir = join(dir, "request");
    mkdirSync(root);
    writeFileSync(join(root, "mock2.mjs"), source);
    const previous = process.env.PLAYBOOK_ROOT;
    process.env.PLAYBOOK_ROOT = root;
    try {
      assert.throws(() => runMock2Request({ playbook: "unused.md", input: { example: name }, artifactDir, timeoutMs: 250 }));
    } finally {
      if (previous === undefined) delete process.env.PLAYBOOK_ROOT;
      else process.env.PLAYBOOK_ROOT = previous;
    }
    const processDir = join(artifactDir, readdirSync(artifactDir).find((item) => item.startsWith("process-")));
    assert.deepEqual(JSON.parse(readFileSync(join(processDir, "input.json"), "utf8")), { example: name });
    assert.equal(readFileSync(join(processDir, "stdout.txt"), "utf8"), expected.stdout);
    const info = JSON.parse(readFileSync(join(processDir, "process.json"), "utf8"));
    assert.equal(info.status, expected.status);
    assert.equal(info.signal, expected.signal);
    if (name === "nonzero") assert.equal(readFileSync(join(processDir, "stderr.txt"), "utf8"), "diagnostic");
  });
}
