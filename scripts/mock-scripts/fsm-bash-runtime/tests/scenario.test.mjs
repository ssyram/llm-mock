import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { discoverBashToolName, respond, scenarioCommands } from "../scenario.mjs";

const scriptPath = resolve("scripts/mock-scripts/fsm-bash-runtime/mock.mjs");
const commandSchema = (name) => ({
  role: "system",
  toolsAdded: [{
    name,
    description: "fixture shell tool",
    parameters: { type: "object", properties: { command: { type: "string" } } },
  }],
});
const inputFor = (messages) => ({
  api: "openai-completions",
  keyId: "fixture-no-key",
  model: "fixture-model",
  request: { context: { messages }, options: {} },
});
const firstTurn = (name = "ObservedShell") => [
  commandSchema(name),
  { role: "user", content: "controlled hook fixture" },
];
const callFrom = (reply) => reply.content.find((block) => block.type === "toolCall");

function withTempDir(run) {
  const cwd = mkdtempSync(join(tmpdir(), "fsmbr-direct-test-"));
  try {
    return run(cwd);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

function runCli(cwd, flags, input) {
  const args = [scriptPath, ...flags];
  console.log(`ABOUT TO EXEC ${JSON.stringify([process.execPath, ...args])} cwd=${cwd}; stdin is controlled fixture JSON`);
  const result = spawnSync(process.execPath, args, {
    cwd,
    encoding: "utf8",
    input: JSON.stringify(input),
    env: { PATH: process.env.PATH ?? "", HOME: cwd, TMPDIR: cwd },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

function assertAssistantMessage(message) {
  assert.equal(typeof message.api, "string");
  assert.equal(typeof message.provider, "string");
  assert.equal(typeof message.model, "string");
  assert.ok(Array.isArray(message.content));
  assert.equal(typeof message.stopReason, "string");
  assert.equal(typeof message.timestamp, "number");
  assert.deepEqual(Object.keys(message.usage).sort(), [
    "cacheRead", "cacheWrite", "cost", "input", "output", "totalTokens",
  ]);
  assert.deepEqual(Object.keys(message.usage.cost).sort(), [
    "cacheRead", "cacheWrite", "input", "output", "total",
  ]);
}

test("discovers the actual unique command tool name from unified request schema", () => {
  const messages = [commandSchema("host-specific-shell")];
  assert.equal(discoverBashToolName(messages), "host-specific-shell");
  assert.throws(() => discoverBashToolName([]), /found 0/);
  assert.throws(() => discoverBashToolName([
    ...messages,
    ...commandSchema("second-shell").toolsAdded.map((tool) => ({ role: "system", toolsAdded: [tool] })),
  ]), /found 2/);
});

test("first Bash response carries the exact command and untouched fixture fields", () => {
  const messages = firstTurn("actual-cc-or-oc-name");
  const extra = { cwd: "/tmp/fsmbr-cwd", timeout: 37, description: "preserve description", extra: [1, "x"] };
  const reply = respond({
    scenario: "rewrite-marker",
    messages,
    api: "openai-completions",
    model: "fixture-model",
    toolName: discoverBashToolName(messages),
    argumentsFixture: extra,
  });
  assertAssistantMessage(reply);
  assert.equal(reply.stopReason, "toolUse");
  assert.equal(callFrom(reply).name, "actual-cc-or-oc-name");
  assert.deepEqual(callFrom(reply).arguments, {
    ...extra,
    command: scenarioCommands["rewrite-marker"][0],
  });
});

test("one-call scenarios finish on the corresponding result, including an error, without retry", () => {
  const messages = firstTurn();
  const initial = respond({ scenario: "write-probe", messages, api: "pi-messages", model: "m", toolName: "ObservedShell" });
  const call = callFrom(initial);
  for (const isError of [false, true]) {
    const history = [...messages, { role: "assistant", content: [call] }, {
      role: "toolResult", toolCallId: call.id, toolName: call.name, content: [{ type: "text", text: "fixture result" }], isError,
    }];
    const final = respond({ scenario: "write-probe", messages: history, api: "pi-messages", model: "m", toolName: "ObservedShell" });
    assert.equal(final.stopReason, "stop");
    assert.equal(final.content.length, 1);
    assert.equal(final.content[0].type, "text");
    assert.match(final.content[0].text, /Observed matching toolResult/);
    assert.doesNotMatch(final.content[0].text, /filesystem state is verified/i);
  }
});

test("two-call-refresh advances only after the first matching successful toolResult", () => {
  const messages = firstTurn();
  const first = respond({ scenario: "two-call-refresh", messages, api: "pi-messages", model: "m", toolName: "ObservedShell" });
  const firstCall = callFrom(first);
  const afterFirst = [...messages, { role: "assistant", content: [firstCall] }, {
    role: "toolResult", toolCallId: firstCall.id, toolName: firstCall.name, content: [], isError: false,
  }];
  const second = respond({ scenario: "two-call-refresh", messages: afterFirst, api: "pi-messages", model: "m", toolName: "ObservedShell" });
  const secondCall = callFrom(second);
  assert.equal(secondCall.id, "fsmbr_two-call-refresh_2");
  const final = respond({
    scenario: "two-call-refresh",
    messages: [...afterFirst, { role: "assistant", content: [secondCall] }, {
      role: "toolResult", toolCallId: secondCall.id, toolName: secondCall.name, content: [], isError: true,
    }],
    api: "pi-messages",
    model: "m",
    toolName: "ObservedShell",
  });
  assert.equal(final.stopReason, "stop");
  assert.match(final.content[0].text, /toolResults .* isError=true/);

  const failedFirst = respond({
    scenario: "two-call-refresh",
    messages: [...messages, { role: "assistant", content: [firstCall] }, {
      role: "toolResult", toolCallId: firstCall.id, toolName: firstCall.name, content: [], isError: true,
    }],
    api: "pi-messages",
    model: "m",
    toolName: "ObservedShell",
  });
  assert.equal(failedFirst.stopReason, "stop");
  assert.match(failedFirst.content[0].text, /no retry or next call/);
});

test("CLI emits complete wire JSON and never executes the fidelity command", () => {
  withTempDir((cwd) => {
    const argsFixture = { cwd, timeout: 59, description: "fixture description", untouched: "kept" };
    const reply = runCli(cwd, [
      "--scenario", "command-fidelity",
      "--tool-name", "ObservedShell",
      "--arguments-json", JSON.stringify(argsFixture),
    ], inputFor(firstTurn()));
    assertAssistantMessage(reply);
    const call = callFrom(reply);
    assert.equal(call.name, "ObservedShell");
    assert.deepEqual(call.arguments, { ...argsFixture, command: scenarioCommands["command-fidelity"][0] });
    assert.match(call.arguments.command, /single quote/);
    assert.ok(call.arguments.command.includes(String.raw`'\''`));
    assert.match(call.arguments.command, /\$\(/);
    assert.match(call.arguments.command, /\n/);
    assert.match(call.arguments.command, /\|/);
    assert.match(call.arguments.command, /> fidelity-marker\.txt/);
    assert.deepEqual(readdirSync(cwd), []);
  });
});

test("non-bash requires and preserves an explicit tool name and argument fixture", () => {
  const reply = respond({
    scenario: "non-bash",
    messages: firstTurn(),
    api: "pi-messages",
    model: "m",
    toolName: "ObservedReadTool",
    argumentsFixture: { file_path: "controlled-fixture.txt", mode: "read" },
  });
  const call = callFrom(reply);
  assert.equal(call.name, "ObservedReadTool");
  assert.deepEqual(call.arguments, { file_path: "controlled-fixture.txt", mode: "read" });
});
