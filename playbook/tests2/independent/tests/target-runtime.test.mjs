import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runMock2Request, unifiedInput } from "../support/run-mock2-request.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runRoot = join(process.env.PLAYBOOK_INDEPENDENT_ARTIFACTS ?? resolve(root, "../../../target/test-artifacts/playbook-independent"), `target-runtime-${Date.now()}-${process.pid}`);
mkdirSync(runRoot, { recursive: true });
const fixture = (name, kind = "expected-parse") => join(root, `fixtures/${kind}/${name}.md`);
const calls = (reply) => (reply.content ?? []).filter((block) => block.type === "toolCall");
const text = (reply) => (reply.content ?? []).filter((block) => typeof block.text === "string").map((block) => block.text).join("\n");
const request = (name, messages, label, kind) => runMock2Request({
  playbook: fixture(name, kind),
  input: unifiedInput(messages),
  artifactDir: join(runRoot, label)
}).output;
const appendResults = (messages, reply) => {
  messages.push({ role: "assistant", content: reply.content });
  for (const call of calls(reply)) {
    messages.push({ role: "toolResult", toolCallId: call.id, toolName: call.name, content: [{ type: "text", text: `out:${call.id}` }] });
  }
};

test("frame-driven counter loops three real tool iterations with unique ids", () => {
  const messages = [{ role: "user", content: "begin" }];
  const ids = [];
  for (let round = 0; round < 3; round += 1) {
    const reply = request("label-loop-dynamic-id", messages, "label-loop");
    assert.equal(calls(reply).length, 1);
    ids.push(calls(reply)[0].id);
    appendResults(messages, reply);
  }
  assert.equal(text(request("label-loop-dynamic-id", messages, "label-loop")), "finished");
  assert.equal(new Set(ids).size, 3);
  const observation = JSON.parse(readFileSync(join(runRoot, "label-loop", "label-loop-observations.json"), "utf8"));
  assert.ok(observation.transitions.every(({ current, next }) => next === current + 1));
  assert.deepEqual(observation.transitions.slice(-3), [
    { current: 0, next: 1 }, { current: 1, next: 2 }, { current: 2, next: 3 }
  ]);
});

test("cold deterministic rebuild may repeat observation but not change counter result", () => {
  const messages = [{ role: "user", content: "begin" }];
  const first = request("external-counter", messages, "external-counter");
  const second = request("external-counter", messages, "external-counter");
  assert.equal(text(first), "count=3");
  assert.deepEqual(second.content, first.content);
  const observation = JSON.parse(readFileSync(join(runRoot, "external-counter", "external-counter-observations.json"), "utf8"));
  assert.equal(observation.calls, 6);
  assert.deepEqual(observation.transitions.slice(0, 3), observation.transitions.slice(3));
});

test("omitted import binding uses the declared default", () => {
  const reply = request("import-default-param-main", [{ role: "user", content: "begin" }], "default-param");
  assert.equal(text(reply), "child default-token local seen:default-token");
});

test("representative flow exposes three imported frame-derived tool iterations", () => {
  const artifactDir = join(runRoot, "representative");
  const messages = [{ role: "user", content: "start" }];
  const invoke = () => runMock2Request({
    playbook: fixture("representative-pi-flow"),
    input: unifiedInput(messages, { system: "local-contract" }),
    artifactDir
  }).output;
  const first = invoke();
  assert.equal(first.error, undefined, JSON.stringify(first));
  assert.equal(calls(first).length, 2);
  appendResults(messages, first);
  const importedCommands = [];
  const ids = calls(first).map((call) => call.id);
  for (let token = 0; token < 3; token += 1) {
    const reply = invoke();
    assert.equal(reply.error, undefined, JSON.stringify(reply));
    assert.equal(calls(reply).length, 1);
    importedCommands.push(calls(reply)[0].arguments.command);
    ids.push(calls(reply)[0].id);
    appendResults(messages, reply);
  }
  const verify = invoke();
  assert.equal(verify.error, undefined, JSON.stringify(verify));
  ids.push(calls(verify)[0].id);
  messages.push({ role: "assistant", content: verify.content });
  messages.push({ role: "toolResult", toolCallId: calls(verify)[0].id, toolName: "bash", content: [{ type: "text", text: "verified" }] });
  assert.equal(text(invoke()), "ready for confirmation");
  assert.deepEqual(importedCommands, [
    "echo '0|seen:0' >> loop-tools.txt",
    "echo '1|seen:1' >> loop-tools.txt",
    "echo '2|seen:2' >> loop-tools.txt"
  ]);
  assert.equal(new Set(ids).size, 6);
});

for (const mode of ["run", "skip"]) {
  test(`segment ${mode} trajectory emits the full batch and aggregates`, () => {
    const label = `segment-${mode}`;
    const messages = [{ role: "user", content: mode }];
    const batch = request("segment-aggregator", messages, label);
    assert.equal(batch.error, undefined, JSON.stringify(batch));
    assert.deepEqual(calls(batch).map((call) => call.arguments.command), ["printf left", "printf right"]);
    appendResults(messages, batch);
    assert.equal(text(request("segment-aggregator", messages, label)), "finished");
    assert.equal(existsSync(join(runRoot, label, "segment-run.json")), mode === "run");
  });
}
