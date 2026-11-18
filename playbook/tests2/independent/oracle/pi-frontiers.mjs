import assert from "node:assert/strict";
import { projectBusinessHistory } from "./business-trace.mjs";
import { evaluateScenarioPrefix, expectedRequestOutcome } from "./reference-trace.mjs";

function visibleContent(content) {
  const blocks = typeof content === "string" ? [{ text: content }] : (content ?? []);
  return blocks.filter((block) => !((block.type === "text" || block.type === undefined) && block.text === ""))
    .map((block) => typeof block.text === "string" && (block.type === "text" || block.type === undefined)
      ? { ...structuredClone(block), type: "text" }
      : structuredClone(block));
}

function visibleMessage(message) {
  return {
    role: message.role,
    content: visibleContent(message.content),
    ...(message.role === "toolResult" ? { toolCallId: message.toolCallId } : {})
  };
}

function businessMessages(messages) {
  return messages.filter((message) => message.role !== "system");
}

function scenarioHistory(messages) {
  const calls = new Map();
  for (const message of messages) {
    if (message.role === "assistant") for (const block of message.content ?? []) {
      if (block.type === "toolCall") calls.set(block.id, block.name);
    }
    if (message.role === "toolResult" && message.toolName) {
      assert.equal(message.toolName, calls.get(message.toolCallId), `result ${message.toolCallId} tool name changed`);
    }
  }
  return projectBusinessHistory(businessMessages(messages).map((message) => ({ ...message, content: visibleContent(message.content) })));
}

function comparePrefix(session, request) {
  const full = businessMessages(session);
  const actual = businessMessages(request);
  assert.ok(actual.length <= full.length, "capture exceeds Pi session history");
  actual.forEach((message, index) => {
    const source = full[index];
    assert.deepEqual(visibleMessage(message), visibleMessage(source), `capture event ${index} drifted`);
    if (message.role === "toolResult" && message.toolName && source.toolName) {
      assert.equal(message.toolName, source.toolName, `result ${index} tool name changed`);
    }
  });
  return { next: full[actual.length] ?? null, index: actual.length };
}

function compareExpected(expected, actual) {
  assert.equal(actual.say, expected.say, "expected assistant text changed");
  assert.equal(actual.calls.length, expected.calls.length, "expected assistant batch changed");
  expected.calls.forEach((call, index) => {
    const received = actual.calls[index];
    assert.equal(received.name, call.name, "expected tool name changed");
    assert.deepEqual(received.arguments, call.arguments, "expected tool arguments changed");
    if (call.id !== undefined) assert.equal(received.id, call.id, "expected tool id changed");
  });
}

export function checkPiFrontiers({ session, captures, expected }) {
  assert.ok(Array.isArray(session?.messages), "session messages required");
  assert.ok(Array.isArray(captures) && captures.length, "no captured requests");
  const history = scenarioHistory(session.messages);
  const sessionState = evaluateScenarioPrefix(expected, history);
  const seen = new Set();
  const frontiers = captures.map((record) => {
    assert.ok(record.request?.context && Array.isArray(record.request.context.messages), "capture context required");
    const request = record.request.context.messages;
    const { next, index } = comparePrefix(session.messages, request);
    const state = evaluateScenarioPrefix(expected, scenarioHistory(request));
    const outcome = expectedRequestOutcome(state);
    if (state.status === "ready" && next) {
      assert.equal(next.role, "assistant", `request ${record.seq} has no next assistant`);
      compareExpected(outcome.next, scenarioHistory([next])[0]);
      assert.ok(!seen.has(index), `duplicate captured frontier ${index}`);
      seen.add(index);
    }
    return { seq: record.seq, index, state: state.status, outcome, next, input: {
      api: record.api, keyId: record.keyId, request: record.request
    } };
  });
  const assistantIndices = businessMessages(session.messages)
    .map((message, index) => message.role === "assistant" ? index : -1).filter((index) => index >= 0);
  const complete = sessionState.status === "complete" && assistantIndices.every((index) => seen.has(index));
  return { status: complete ? "complete" : "partial", sessionState, frontiers };
}

export function assertReplayMatchesFrontier(frontier, reply) {
  if (!frontier.outcome.accepted) {
    assert.equal(reply.error?.code, frontier.outcome.errorCode, JSON.stringify(reply));
    return;
  }
  assert.ok(frontier.next, `request ${frontier.seq} has no Pi response yet`);
  assert.equal(reply.error, undefined, JSON.stringify(reply.error));
  assert.deepEqual(visibleContent(reply.content), visibleContent(frontier.next.content), `request ${frontier.seq} replay content drifted`);
  assert.equal(reply.stopReason, frontier.next.stopReason, `request ${frontier.seq} stop reason changed`);
}
