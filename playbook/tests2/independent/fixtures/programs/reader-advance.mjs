import { readFileSync } from "node:fs";

const envelope = JSON.parse(readFileSync(0, "utf8"));
const transcript = JSON.parse(readFileSync(envelope.transcript, "utf8"));
const messages = transcript.request.context.messages;
const echo = messages[envelope.pointer];
const mine = echo?.role === "assistant" && (echo.content ?? []).some((b) => b.type === "toolCall" && b.id === "read-1");
if (!mine) {
  process.stdout.write(JSON.stringify({ assistant: { content: [
    { type: "toolCall", id: "read-1", name: "bash", arguments: { command: "printf payload" } }
  ], stopReason: "toolUse" } }));
} else {
  const receipt = messages[envelope.pointer + 1];
  if (receipt?.role !== "toolResult" || receipt.toolCallId !== "read-1") throw new Error("expected the receipt of my own RV");
  process.stdout.write(JSON.stringify({ result: "advanced", pointer: envelope.pointer + 2 }));
}
