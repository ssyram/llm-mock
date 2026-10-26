import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { respond, scenarioCommands } from "../scenario.mjs";

const schema = { role: "system", toolsAdded: [{
  name: "NativeShellFromSchema", parameters: { properties: { command: { type: "string" } } },
}] };
const messages = [schema, { role: "user", content: "controlled runtime effect" }];
const options = { api: "openai-completions", model: "fixture-model", toolName: "NativeShellFromSchema" };
const cli = resolve("scripts/mock-scripts/fsm-bash-runtime/mock.mjs");

for (const scenario of ["python-indirect-write", "network-allowed", "network-denied"]) {
  test(`${scenario} discovers the native tool and closes only its transcript result`, () => {
    const argv = [cli, "--scenario", scenario, "--arguments-json", JSON.stringify({ workdir: "/fixture", timeout: 30000 })];
    console.log(`ABOUT TO EXEC ${JSON.stringify([process.execPath, ...argv])}`);
    const processResult = spawnSync(process.execPath, argv, {
      input: JSON.stringify({ ...options, request: { context: { messages } } }),
      encoding: "utf8", stdin: "pipe",
    });
    assert.equal(processResult.status, 0, processResult.stderr);
    const first = JSON.parse(processResult.stdout);
    const call = first.content[0];
    assert.equal(call.name, options.toolName);
    assert.deepEqual(call.arguments, { workdir: "/fixture", timeout: 30000, command: scenarioCommands[scenario][0] });
    if (scenario === "python-indirect-write") {
      assert.equal(call.arguments.command, "python3 fixture.py");
      assert.doesNotMatch(call.arguments.command, /protected|sample|write|>/);
    } else {
      assert.match(call.arguments.command, /https:\/\/example\.(com|org):443\//);
      assert.match(call.arguments.command, /--fail-with-body.*--dump-header -/);
    }
    const history = [...messages, { role: "assistant", content: [call] }];
    const unrelated = respond({ ...options, scenario, messages: [...history, {
      role: "toolResult", toolCallId: "unrelated", isError: false, content: [],
    }] });
    assert.equal(unrelated.stopReason, "stop");
    assert.match(unrelated.content[0].text, /no matching toolResult/);
    for (const isError of [false, true]) {
      const final = respond({ ...options, scenario, messages: [...history, {
        role: "toolResult", toolCallId: call.id, isError, content: [],
      }] });
      assert.equal(final.stopReason, "stop");
      assert.match(final.content[0].text, /Observed matching toolResult/);
      assert.doesNotMatch(final.content[0].text, /filesystem state is verified/i);
    }
    assert.deepEqual(respond({ ...options, scenario, messages, argumentsFixture: { workdir: "/fixture", timeout: 30000 } }), first);
  });
}
