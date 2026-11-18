import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateScenarioPrefix, expectedRequestOutcome, TraceMismatch } from "../oracle/reference-trace.mjs";
import { mutateCapturedEvent, verifyCapturedPrefix } from "../oracle/captured-prefix.mjs";

const scenario = JSON.parse(readFileSync(new URL("../contract/reference-scenario.json", import.meta.url)));
const trace = [
  { role: "user", text: "start" },
  { role: "assistant", say: "prepare", calls: [
    { id: "dynamic-1", name: "bash", arguments: { command: "printf alpha > alpha.txt" } },
    { id: "dynamic-2", name: "bash", arguments: { command: "printf beta > beta.txt" } }
  ] },
  { role: "toolResult", toolCallId: "dynamic-2", text: "beta-ok" },
  { role: "toolResult", toolCallId: "dynamic-1", text: "alpha-ok" },
  ...loopEvents(),
  { role: "assistant", say: "", calls: [{
    id: "dynamic-6", name: "bash",
    arguments: { command: "test -f alpha.txt && test -f beta.txt && test \"$(wc -l < loop-tools.txt)\" -eq 3 && printf verified" }
  }] },
  { role: "toolResult", toolCallId: "dynamic-6", text: "verified" },
  { role: "assistant", say: "ready for confirmation", calls: [] },
  { role: "user", text: "continue" },
  { role: "assistant", say: "complete", calls: [] }
];

function loopEvents() {
  return [0, 1, 2].flatMap((token, index) => [
    { role: "assistant", say: "", calls: [{
      id: `dynamic-${index + 3}`, name: "bash", arguments: { command: `echo '${token}|seen:${token}' >> loop-tools.txt` }
    }] },
    { role: "toolResult", toolCallId: `dynamic-${index + 3}`, text: `loop-${token}-ok` }
  ]);
}

test("event prefixes are classified; only complete request frontiers predict assistant", () => {
  const ready = [];
  const waiting = [];
  for (let length = 0; length <= trace.length; length += 1) {
    const frontier = evaluateScenarioPrefix(scenario, trace.slice(0, length));
    if (frontier.status === "ready") ready.push(length);
    if (frontier.status === "waiting") waiting.push(length);
  }
  assert.deepEqual(ready, [1, 4, 6, 8, 10, 12, 14]);
  assert.deepEqual(waiting, [2, 3, 5, 7, 9, 11]);
  assert.equal(evaluateScenarioPrefix(scenario, trace).status, "complete");
});

test("partial result request is playbook_state, while out-of-order completion is valid", () => {
  const partial = evaluateScenarioPrefix(scenario, trace.slice(0, 3));
  assert.deepEqual(expectedRequestOutcome(partial), { accepted: false, errorCode: "playbook_state" });
  const missingThenNext = [...trace.slice(0, 3), trace[4]];
  assert.throws(() => evaluateScenarioPrefix(scenario, missingThenNext), (error) => error.code === "missing_tool_result");
});

test("three imported tool iterations use frame-derived arguments and unique ids", () => {
  const calls = trace.filter((event) => event.role === "assistant").flatMap((event) => event.calls);
  assert.deepEqual(calls.slice(2, 5).map((call) => call.arguments.command), [
    "echo '0|seen:0' >> loop-tools.txt",
    "echo '1|seen:1' >> loop-tools.txt",
    "echo '2|seen:2' >> loop-tools.txt"
  ]);
  assert.equal(new Set(calls.map((call) => call.id)).size, calls.length);
});

test("captured text, args, id and result mutations fail", () => {
  const mutations = [
    mutateCapturedEvent(trace, 1, (event) => ({ ...event, say: "changed" })),
    mutateCapturedEvent(trace, 1, (event) => ({ ...event, calls: event.calls.map((call, index) => index ? call : { ...call, arguments: { command: "changed" } }) })),
    mutateCapturedEvent(trace, 1, (event) => ({ ...event, calls: event.calls.map((call, index) => index ? call : { ...call, id: "changed-id" }) })),
    mutateCapturedEvent(trace, 11, (event) => ({ ...event, text: "not-verified" }))
  ];
  for (const mutation of mutations) assert.throws(() => verifyCapturedPrefix(trace, mutation), TraceMismatch);
});
