import { readFileSync, writeFileSync } from "node:fs";
import { traceReply, traceFinal } from "./trace-language.mjs";

const input = JSON.parse(readFileSync(0, "utf8"));
if (process.argv.includes("--fault-envelope")) {
	const field = process.argv[process.argv.indexOf("--fault-envelope") + 1];
	if (field === "all") Object.assign(input, { api: "wrong-api", model: "wrong-model", keyId: "wrong-key", sessionSignal: "wrong-session" });
	else input[field] = `wrong-${field}`;
}
writeFileSync(process.argv[process.argv.indexOf("--receipt") + 1], JSON.stringify(input));
const messages = input.request.context.messages;
const index = messages.findLastIndex((message) => message.role === "user");
const content = messages[index].content;
const text = typeof content === "string" ? content : content.map((block) => block.text ?? "").join("\n");
const scenario = JSON.parse(text);
const tail = messages.slice(index + 1);
const replied = tail.some((message) => message.role === "assistant" && message.content.some((block) => block.type === "toolCall"));
const source = replied ? traceFinal(tail, input.api, input.model, process.argv.includes("--fault-drop-result")) : traceReply(scenario, input.api, input.model);
process.stdout.write(JSON.stringify(source));
