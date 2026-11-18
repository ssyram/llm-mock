import assert from "node:assert/strict";

export class TraceMismatch extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TraceMismatch";
    this.code = code;
  }
}

const equal = (left, right) => {
  try {
    assert.deepEqual(left, right);
    return true;
  } catch {
    return false;
  }
};

const mismatch = (code, message) => {
  throw new TraceMismatch(code, message);
};

export function evaluateScenarioPrefix(scenario, observed) {
  let cursor = 0;
  let observedCursor = 0;
  const pending = new Map();
  const seenIds = new Set();
  while (observedCursor < observed.length) {
    if (pending.size > 0) {
      const event = observed[observedCursor];
      if (event.role !== "toolResult") mismatch("missing_tool_result", "next event arrived before every tool result");
      const expected = pending.get(event.toolCallId);
      if (!expected) mismatch("tool_result_id", `unexpected or duplicate tool result ${event.toolCallId}`);
      if (!matchesResult(expected.result, event.text)) mismatch("tool_result_text", `tool result ${event.toolCallId} changed`);
      pending.delete(event.toolCallId);
      observedCursor += 1;
      continue;
    }
    const expected = scenario.steps[cursor];
    const event = observed[observedCursor];
    if (!expected) mismatch("extra_history", "history continues after the scenario ends");
    if (expected.role === "user") {
      if (event.role !== "user" || event.text !== expected.text) mismatch("user_text", `expected user ${JSON.stringify(expected.text)}`);
    } else {
      if (event.role !== "assistant") mismatch("assistant_missing", "expected an assistant response");
      if (event.say !== expected.say) mismatch("assistant_text", `expected say ${JSON.stringify(expected.say)}`);
      if (!Array.isArray(event.calls) || event.calls.length !== expected.calls.length) mismatch("tool_count", "tool call count changed");
      event.calls.forEach((call, index) => {
        const wanted = expected.calls[index];
        if (typeof call.id !== "string" || call.id === "") mismatch("tool_id", "tool id must be non-empty");
        if (seenIds.has(call.id)) mismatch("tool_id_reused", `tool id ${call.id} was reused`);
        if (wanted.id !== undefined && call.id !== wanted.id) mismatch("tool_id", `tool ${index} id changed`);
        if (call.name !== wanted.name) mismatch("tool_name", `tool ${index} name changed`);
        if (!equal(call.arguments, wanted.arguments)) mismatch("tool_arguments", `tool ${index} arguments changed`);
        seenIds.add(call.id);
        pending.set(call.id, wanted);
      });
    }
    cursor += 1;
    observedCursor += 1;
  }
  if (pending.size > 0) return { status: "waiting", pendingIds: [...pending.keys()], complete: false };
  const next = scenario.steps[cursor];
  if (!next) return { status: "complete", next: null, complete: true };
  if (next.role === "user") return { status: "awaitingUser", next: { role: "user", text: next.text }, complete: false };
  return { status: "ready", next: expectedAssistant(next), complete: false };
}

export function expectedRequestOutcome(frontier) {
  if (frontier.status === "ready") return { accepted: true, next: frontier.next };
  if (frontier.status === "waiting" || frontier.status === "awaitingUser") {
    return { accepted: false, errorCode: "playbook_state" };
  }
  return { accepted: false, errorCode: "playbook_exhausted" };
}

function expectedAssistant(step) {
  return { role: "assistant", say: step.say, calls: step.calls.map(({ id, name, arguments: args }) => ({ ...(id === undefined ? {} : { id }), name, arguments: args })) };
}

function matchesResult(matcher, text) {
  if (matcher.any === true) return true;
  if (typeof matcher.contains === "string") return String(text).includes(matcher.contains);
  return text === matcher.text;
}
