#!/usr/bin/env node
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const request = input.request;
const messages = request.context.messages;
const latest = messages.at(-1) ?? null;
const userTurns = messages.filter((message) => message.role === "user").length;
const content = typeof latest?.content === "string" ? latest.content
	: (latest?.content ?? []).flatMap((block) => typeof block.text === "string" ? [block.text] : []).join("\n");
const metadata = {
	api: input.api,
	model: input.model,
	keyId: input.keyId ? "[redacted]" : "",
	sessionSignal: input.sessionSignal ?? null,
	options: request.options,
	userTurns,
	messageCount: messages.length,
};
const text = [
	`第 ${userTurns} 句（按用户消息计数）`, "", "Echo:", content, "",
	"最新 Message（服务端解码后的统一格式）:", "```json", JSON.stringify(latest, null, 2), "```", "",
	"Metadata:", "```json", JSON.stringify(metadata, null, 2), "```",
].join("\n");
let replyContent = [{ type: "text", text }];
let stopReason = "stop";
if (process.argv.includes("--bash-echo")) {
	const userIndex = messages.findLastIndex((message) => message.role === "user");
	const alreadyCalled = messages.slice(userIndex + 1).some((message) => message.role === "assistant"
		&& message.content.some((block) => block.type === "toolCall" && block.name === "bash"));
	if (userIndex >= 0 && !alreadyCalled) {
		const quoted = `'${content.replaceAll("'", "'\\''")}'`;
		const command = /^-[eEn]+$/.test(content) ? `printf '%s\\n' ${quoted}` : `echo -E ${quoted}`;
		replyContent = [{ type: "text", text: `第 ${userTurns} 句：我先说一句话，再用 bash 回显你刚刚的输入。` },
			{ type: "toolCall", id: `echo_${userTurns}`, name: "bash", arguments: { command, timeout: 10 } }];
		stopReason = "toolUse";
	}
}
process.stdout.write(JSON.stringify({
	api: input.api,
	provider: "simulator",
	model: input.model,
	content: replyContent,
	usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
	stopReason,
	timestamp: 0,
}));
