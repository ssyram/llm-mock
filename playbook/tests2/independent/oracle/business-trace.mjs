import assert from "node:assert/strict";
import { projectPiHistory, projectPiMessage } from "./vendor-projection.mjs";

export function projectBusinessHistory(messages) {
  return projectPiHistory(messages).filter((message) => message.role !== "system").map(coreEvent);
}

export function coreEvent(event) {
  if (event.role === "toolResult") {
    return {
      role: "toolResult",
      toolCallId: event.toolCallId,
      text: event.text,
      ...(event.otherContent === undefined ? {} : { otherContent: event.otherContent })
    };
  }
  return structuredClone(event);
}

export function assistantEventOf(reply) {
  return coreEvent(projectPiMessage({ role: "assistant", content: reply.content ?? [] }));
}

export function assertBusinessPrefix(fullHistory, requestHistory) {
  assert.ok(requestHistory.length <= fullHistory.length, "provider request is longer than Pi business history");
  assert.deepEqual(requestHistory, fullHistory.slice(0, requestHistory.length));
  return fullHistory[requestHistory.length] ?? null;
}
