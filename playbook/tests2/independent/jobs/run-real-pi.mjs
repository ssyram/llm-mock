import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertBusinessPrefix, assistantEventOf, projectBusinessHistory } from "../oracle/business-trace.mjs";
import { evaluateScenarioPrefix, expectedRequestOutcome } from "../oracle/reference-trace.mjs";
import { allowedPiVendorLosses } from "../oracle/vendor-projection.mjs";
import { providerRequestMutations } from "../support/mutate-provider-request.mjs";
import { readMockCaptures } from "../support/read-mock-captures.mjs";
import { readLatestPiSession } from "../support/read-pi-session.mjs";
import { renderMockMountCommand } from "../support/render-mock-mount-command.mjs";
import { runIsolatedPiSession } from "../support/run-isolated-pi-session.mjs";
import { runMock2Request } from "../support/run-mock2-request.mjs";
import { snapshotProjectFiles } from "../support/snapshot-project-files.mjs";
import { startLocalMockServer } from "../support/start-local-mock-server.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(root, "../../..");
const playbookRoot = process.env.PLAYBOOK_ROOT;
assert.ok(playbookRoot, "PLAYBOOK_ROOT is required");
const serverBin = process.env.MOCK_SERVER_BIN ?? join(repoRoot, "target/debug/mock-llm-server");
assert.ok(existsSync(serverBin), `mock server binary not found: ${serverBin}`);
const playbook = join(root, "fixtures/expected-parse/representative-pi-flow.md");
const scenario = JSON.parse(readFileSync(join(root, "contract/reference-scenario.json"), "utf8"));
const runId = `pi-${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
const runDir = join(process.env.PLAYBOOK_PI_ARTIFACTS ?? join(repoRoot, "target/test-artifacts/playbook-pi"), runId);
mkdirSync(join(runDir, "request-replay"), { recursive: true });
mkdirSync(join(runDir, "mutations"), { recursive: true });
mkdirSync(join(runDir, "tmp"), { recursive: true });
let server;

try {
  const mountCommand = renderMockMountCommand(playbook, playbookRoot, join(runDir, "server-cache"));
  server = await startLocalMockServer({ serverBin, runDir, mountCommand });
  const pi = runIsolatedPiSession({ runDir, baseUrl: server.baseUrl });
  assert.equal(pi.turns[0].status, 0, pi.turns[0].stdout + pi.turns[0].stderr);
  assert.equal(pi.turns.length, 2, "Pi did not complete both turns");
  assert.equal(pi.turns[1].status, 0, pi.turns[1].stdout + pi.turns[1].stderr);
  assert.match(pi.turns[0].stdout, /ready for confirmation/);
  assert.match(pi.turns[1].stdout, /complete/);
  for (const leak of ["Representative local Pi flow", "Fresh imported frame", "LOOP"]) {
    assert.ok(!pi.turns.some((turn) => turn.stdout.includes(leak)), `prose leaked: ${leak}`);
  }

  const session = readLatestPiSession(pi.sessionDir);
  const businessHistory = projectBusinessHistory(session.messages);
  writeFileSync(join(runDir, "normalized-business-session.json"), JSON.stringify(businessHistory, null, 2));
  assert.equal(evaluateScenarioPrefix(scenario, businessHistory).status, "complete");
  const calls = businessHistory.filter((event) => event.role === "assistant").flatMap((event) => event.calls);
  assert.equal(calls.length, 6, "two initial + three imported + one verification tool call");
  assert.equal(new Set(calls.map((call) => call.id)).size, calls.length, "dynamic tool ids must be unique");

  const captures = readMockCaptures(server.captureDir);
  const relevant = captures.records.filter((record) => record.keyId === "contract");
  assert.ok(relevant.length > 0, "local provider produced no captures");
  assert.ok(relevant.some((record) => JSON.stringify(record.request.context).includes("local-contract")));
  assert.ok(relevant.some((record) => Array.isArray(record.request.context.tools) || record.request.context.messages.some((message) => message.toolsAdded)));

  const requestReplay = [];
  for (const record of relevant) {
    const input = { api: record.api, keyId: record.keyId, request: record.request };
    const requestHistory = projectBusinessHistory(record.request.context.messages);
    const sessionNext = assertBusinessPrefix(businessHistory, requestHistory);
    const frontier = evaluateScenarioPrefix(scenario, requestHistory);
    const expected = expectedRequestOutcome(frontier);
    const replay = runMock2Request({
      playbook,
      input,
      artifactDir: join(runDir, "request-replay", String(record.seq).padStart(3, "0"))
    }).output;
    if (expected.accepted) {
      assert.equal(sessionNext?.role, "assistant", `request ${record.seq} has no next Pi assistant`);
      compareScenarioAssistant(expected.next, sessionNext);
      assert.deepEqual(assistantEventOf(replay), sessionNext, `request ${record.seq} replay drifted`);
    } else {
      assert.equal(replay.error?.code, expected.errorCode, JSON.stringify(replay));
    }
    writeFileSync(join(runDir, "request-replay", `${String(record.seq).padStart(3, "0")}.json`), JSON.stringify({ input, frontier, expected, replay }, null, 2));
    requestReplay.push({ seq: record.seq, frontier: frontier.status, accepted: expected.accepted, expectedNext: sessionNext });
  }

  assert.equal(readFileSync(join(pi.projectDir, "alpha.txt"), "utf8"), "alpha");
  assert.equal(readFileSync(join(pi.projectDir, "beta.txt"), "utf8"), "beta");
  assert.equal(readFileSync(join(pi.projectDir, "loop-tools.txt"), "utf8"), "0|seen:0\n1|seen:1\n2|seen:2\n");
  const beforeMutations = snapshotProjectFiles(pi.projectDir);
  const mutationSource = [...relevant].reverse().find((record) => {
    const roles = record.request.context.messages.map((message) => message.role);
    return roles.includes("assistant") && roles.includes("toolResult");
  });
  assert.ok(mutationSource, "no provider request contains replayable assistant/toolResult history");
  const baseInput = { api: mutationSource.api, keyId: mutationSource.keyId, request: mutationSource.request };
  const mutations = [];
  for (const mutation of providerRequestMutations(baseInput)) {
    const outcome = runMock2Request({
      playbook,
      input: mutation.input,
      artifactDir: join(runDir, "mutations", mutation.field)
    }).output;
    assert.ok(outcome.error?.code, `${mutation.field} mutation produced a reply`);
    assert.deepEqual(snapshotProjectFiles(pi.projectDir), beforeMutations, `${mutation.field} caused a host-tool side effect`);
    writeFileSync(join(runDir, "mutations", `${mutation.field}.json`), JSON.stringify(outcome, null, 2));
    mutations.push({ field: mutation.field, rejected: true, sideEffectsUnchanged: true, errorCode: outcome.error.code });
  }

  const summary = {
    runId,
    playbook: relative(root, playbook),
    commands: [server.command, server.registrationCommand, ...pi.turns.map((turn) => turn.command)],
    turns: pi.turns.map((turn) => ({ status: turn.status, stdoutFile: relative(runDir, turn.stdoutFile), stderrFile: relative(runDir, turn.stderrFile) })),
    captures: captures.files.map((file) => relative(runDir, file)),
    sessionFiles: session.files.map((file) => relative(runDir, file)),
    requestReplay,
    mutations,
    sideEffects: { files: snapshotProjectFiles(pi.projectDir), toolIterations: 3, dynamicToolIdsUnique: true },
    vendorProjection: allowedPiVendorLosses
  };
  writeFileSync(join(runDir, "run.json"), JSON.stringify(summary, null, 2));
  process.stdout.write(`PASS real Pi duality: ${runDir}\n`);
} catch (error) {
  writeFileSync(join(runDir, "failure.json"), JSON.stringify({ name: error.name, message: error.message, stack: error.stack }, null, 2));
  throw error;
} finally {
  await server?.stop();
}

function compareScenarioAssistant(expected, actual) {
  assert.equal(actual.say, expected.say);
  assert.deepEqual(actual.calls.map(({ name, arguments: args }) => ({ name, arguments: args })), expected.calls);
}
