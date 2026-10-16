import { readFileSync } from "node:fs";
import { traceReply, traceFinal } from "./trace-language.mjs";

const input = JSON.parse(readFileSync(0, "utf8"));
const messages = input.request.context.messages;
const index = messages.findLastIndex((message) => message.role === "user");
const content = messages[index].content;
const text = typeof content === "string" ? content : content.map((block) => block.text ?? "").join("\n");
const scenario = JSON.parse(text);
const tail = messages.slice(index + 1);
const replied = tail.some((message) => message.role === "assistant" && message.content.some((block) => block.type === "toolCall"));
const source = replied ? traceFinal(tail, input.api, input.model, process.argv.includes("--fault-drop-result")) : traceReply(scenario, input.api, input.model);
process.stdout.write(JSON.stringify(source));
