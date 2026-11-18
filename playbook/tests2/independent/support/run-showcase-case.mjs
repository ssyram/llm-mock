import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fullShowcaseScenario, showcaseFiles } from "../contract/full-showcase-scenarios.mjs";
import { checkPiFrontiers } from "../oracle/pi-frontiers.mjs";
import { readMockCaptures } from "./read-mock-captures.mjs";
import { readLatestPiSession } from "./read-pi-session.mjs";
import { replayShowcaseRequest } from "./replay-showcase-request.mjs";
import { runIsolatedPiSession } from "./run-isolated-pi-session.mjs";
import { snapshotProjectFiles } from "./snapshot-project-files.mjs";
import { startLocalMockServer } from "./start-local-mock-server.mjs";
import { verifyShowcaseMutations } from "./verify-showcase-mutations.mjs";
import { verifyShowcaseReplays } from "./verify-showcase-replays.mjs";

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export async function runShowcaseCase({ testCase, runDir, playbook, serverBin, mount }) {
  mkdirSync(runDir, { recursive: true });
  const summary = { case: testCase.id, inputs: testCase.inputs, status: "running", runDir };
  let server;
  try {
    const mountArgs = [process.execPath, mount, "--host", "pi", "--cache-dir", join(runDir, "server-cache")];
    server = await startLocalMockServer({ serverBin, runDir, mountCommand: mountArgs.map(quote).join(" ") });
    summary.server = { command: server.command, registrationCommand: server.registrationCommand, baseUrl: server.baseUrl };
    const pi = runIsolatedPiSession({ runDir, baseUrl: server.baseUrl, messages: testCase.inputs });
    summary.turns = pi.turns.map(({ stdout, stderr, ...turn }) => turn);
    if (testCase.invalid) {
      assert.equal(pi.turns.length, 1);
      assert.notEqual(pi.turns[0].status, 0, "invalid initial input must fail Pi");
      assert.equal(pi.turns[0].signal, null);
      assert.equal(pi.turns[0].error, null);
      assert.match(pi.turns[0].stdout + pi.turns[0].stderr, /playbook_mismatch/);
    } else {
      assert.equal(pi.turns.length, 2, `Pi did not execute both turns: ${pi.turns[0]?.stderr ?? ""}`);
      for (const turn of pi.turns) {
        assert.equal(turn.status, 0, `${turn.stdout}\n${turn.stderr}`);
        assert.equal(turn.signal, null);
        assert.equal(turn.error, null);
      }
    }
    const session = readLatestPiSession(pi.sessionDir);
    const captures = readMockCaptures(server.captureDir);
    const relevant = captures.records.filter((record) => record.keyId === "contract");
    summary.sessionFiles = session.files;
    summary.captureFiles = captures.files;
    assert.ok(relevant.length, "no captured requests from Pi");
    if (testCase.invalid) {
      assert.ok(!session.messages.some((message) => message.role === "toolResult" ||
        (message.role === "assistant" && message.content?.some((block) => block.type === "toolCall"))));
      assert.deepEqual(snapshotProjectFiles(pi.projectDir), {});
      const record = relevant[0];
      const input = { api: record.api, keyId: record.keyId, request: record.request };
      const replay = replayShowcaseRequest({ playbook, input, artifactDir: join(runDir, "replay", "invalid") });
      assert.equal(replay.reply.error?.status, 422, JSON.stringify(replay.reply));
      assert.equal(replay.reply.error?.code, "playbook_mismatch", JSON.stringify(replay.reply));
      summary.replay = { error: replay.reply.error, command: replay.command };
    } else {
      const check = checkPiFrontiers({ session, captures: relevant, expected: fullShowcaseScenario(testCase) });
      summary.frontierStatus = check.status;
      summary.frontiers = check.frontiers.map(({ seq, state, index }) => ({ seq, state, index }));
      assert.equal(check.status, "complete", "session or captured frontiers are incomplete");
      const expectedFiles = showcaseFiles(testCase.status);
      for (const [file, expected] of Object.entries(expectedFiles)) {
        assert.equal(readFileSync(join(pi.projectDir, file), "utf8"), expected, `${file} content changed`);
      }
      assert.deepEqual(Object.keys(snapshotProjectFiles(pi.projectDir)).sort(), Object.keys(expectedFiles).sort());
      const failures = [];
      try { summary.replays = verifyShowcaseReplays({ playbook, runDir, check }); }
      catch (error) {
        failures.push(`replays: ${error.message}`);
        summary.replays = { status: "failed", error: error.message, results: readResults(join(runDir, "replay/results.json")) };
      }
      try { summary.mutations = verifyShowcaseMutations({ playbook, runDir, projectDir: pi.projectDir, check }); }
      catch (error) {
        failures.push(`mutations: ${error.message}`);
        summary.mutations = readResults(join(runDir, "mutations/results.json"));
      }
      summary.files = snapshotProjectFiles(pi.projectDir);
      assert.equal(failures.length, 0, failures.join("; "));
    }
    summary.status = "passed";
  } catch (error) {
    summary.status = "failed";
    summary.failure = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    await server?.stop();
    writeFileSync(join(runDir, "run.json"), JSON.stringify(summary, null, 2));
  }
  return summary;
}

function readResults(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
