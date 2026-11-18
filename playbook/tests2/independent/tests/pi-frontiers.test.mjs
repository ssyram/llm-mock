import test from "node:test";
import assert from "node:assert/strict";
import { checkPiFrontiers, assertReplayMatchesFrontier } from "../oracle/pi-frontiers.mjs";

const expected = { steps: [
  { role: "user", text: "go" },
  { role: "response", say: "prepare", calls: [
    { id: "a", name: "bash", arguments: { command: "first" }, result: { text: "one" } },
    { id: "b", name: "bash", arguments: { command: "second" }, result: { text: "two" } }
  ] },
  { role: "response", say: "done", calls: [] }
] };
const user = { role: "user", content: [{ type: "text", text: "go" }] };
const first = { role: "assistant", stopReason: "toolUse", content: [
  { type: "text", text: "prepare" },
  { type: "toolCall", id: "a", name: "bash", arguments: { command: "first" } },
  { type: "toolCall", id: "b", name: "bash", arguments: { command: "second" } }
] };
const result = (id, text) => ({ role: "toolResult", toolCallId: id, toolName: "bash", content: [{ type: "text", text }], isError: false });
const done = { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "done" }] };
const session = { messages: [user, first, result("a", "one"), result("b", "two"), done] };
function capture(seq, messages, options = {}) {
  const wire = structuredClone(messages);
  for (const message of wire) {
    if (message.role === "toolResult") message.toolName = "";
    if (message.role === "user" || message.role === "toolResult") {
      message.content = message.content.map(({ text }) => ({ text }));
    }
  }
  return { seq, api: "openai-completions", keyId: "contract", request: { context: {
    messages: [{ role: "system", content: "system", toolsAdded: [{ name: "bash" }] }, ...wire]
  }, options } };
}
const captures = () => [capture(1, [user], { temperature: 0 }), capture(2, session.messages.slice(0, 4), { temperature: 0.2 })];

test("complete Pi frontiers retain each raw request and match independent next replies", () => {
  const input = captures();
  const check = checkPiFrontiers({ session, captures: input, expected });
  assert.equal(check.status, "complete");
  assert.deepEqual(check.frontiers.map(item => item.state), ["ready", "ready"]);
  assert.deepEqual(check.frontiers.map(item => item.input.request.options), [{ temperature: 0 }, { temperature: 0.2 }]);
  assertReplayMatchesFrontier(check.frontiers[0], first);
  assertReplayMatchesFrontier(check.frontiers[1], done);
});

test("one receipt of a two-call batch is waiting, not a ready request", () => {
  const check = checkPiFrontiers({ session, captures: [capture(1, session.messages.slice(0, 3))], expected });
  assert.equal(check.status, "partial");
  assert.equal(check.frontiers[0].state, "waiting");
  assert.deepEqual(check.frontiers[0].outcome, { accepted: false, errorCode: "playbook_state" });
  assertReplayMatchesFrontier(check.frontiers[0], { error: { code: "playbook_state" } });
});

test("missing captured request cannot report a complete trajectory", () => {
  assert.equal(checkPiFrontiers({ session, captures: [captures()[0]], expected }).status, "partial");
});

test("capture mutations to text, arguments, ID and result are rejected", () => {
  for (const mutate of [
    history => { history[1].content[0].text = "different"; },
    history => { history[1].content[1].arguments.command = "different"; },
    history => { history[1].content[1].id = "different"; },
    history => { history[2].content[0].text = "different"; }
  ]) {
    const input = captures();
    const history = input[1].request.context.messages.slice(1);
    mutate(history);
    assert.throws(() => checkPiFrontiers({ session, captures: input, expected }));
  }
});

test("matching a mutated capture and session cannot change the independent expected ID", () => {
  const altered = structuredClone(session);
  altered.messages[1].content[1].id = "changed";
  altered.messages[2].toolCallId = "changed";
  const input = [capture(1, altered.messages.slice(0, 1)), capture(2, altered.messages.slice(0, 4))];
  assert.throws(() => checkPiFrontiers({ session: altered, captures: input, expected }), /id changed/);
});

test("a nonempty result tool name must agree with the associated call", () => {
  const altered = structuredClone(session);
  altered.messages[2].toolName = "other";
  const input = [capture(1, altered.messages.slice(0, 1)), capture(2, altered.messages.slice(0, 4))];
  assert.throws(() => checkPiFrontiers({ session: altered, captures: input, expected }), /tool name changed/);
});

test("empty text blocks may disappear but nonempty text and batch order cannot", () => {
  const input = captures();
  input[1].request.context.messages[2].content.unshift({ type: "text", text: "" });
  assert.equal(checkPiFrontiers({ session, captures: input, expected }).status, "complete");
  input[1].request.context.messages[2].content.unshift({ type: "text", text: "not empty" });
  assert.throws(() => checkPiFrontiers({ session, captures: input, expected }));
});
