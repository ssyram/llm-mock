import { readFileSync } from "node:fs";

const envelope = JSON.parse(readFileSync(0, "utf8"));
const transcript = JSON.parse(readFileSync(envelope.transcript, "utf8"));
const messages = transcript.request.context.messages;
const receipts = [];
for (let i = envelope.pointer; messages[i]?.role === "toolResult"; i += 1) receipts.push(messages[i]);
if (receipts.length === 0) {
  process.stderr.write("aggregation requires the current batch receipts at the validation entry");
  process.exit(2);
}
process.stdout.write(JSON.stringify({ result: "complete" }));
