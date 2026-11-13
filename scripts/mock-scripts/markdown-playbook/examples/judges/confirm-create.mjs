#!/usr/bin/env node
// 确认 judger：接受用户的创建确认。整条消息恰为“好”类短语，或包含
// 可以/请补齐/补齐/创建/同意/确认/好的/好吧 等明确同意词；“不用了/取消”
// 等不含上述词，落 fail 由剧本的 otherwise 分支处理。只读当前 user 消息，
// 无副作用、确定性；stdin=envelope，stdout=pass/fail，exit 0。
import fs from "node:fs";
const text = messageText(readEnvelope().message).trim();
const agrees = /^好[的吧啊!！。]?\s*$/.test(text) || /可以|请?补齐|请?创建|同意|确认|好的|好吧|^ok$/i.test(text);
process.stdout.write(agrees ? "pass\n" : "fail\n");

function readEnvelope() {
	try {
		return JSON.parse(fs.readFileSync(0, "utf8"));
	} catch {
		process.stderr.write("judger confirm-create: stdin is not valid envelope JSON\n");
		process.exit(3);
	}
}

function messageText(message) {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.filter((b) => typeof b?.text === "string").map((b) => b.text).join("\n");
	return "";
}
