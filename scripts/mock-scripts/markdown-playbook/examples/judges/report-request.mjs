#!/usr/bin/env node
// 启动 judger：宽松识别“报告请求”。只读当前待处理 user 消息（envelope.message），
// 不开网络、不读写业务文件、不调用真模型；对同一输入永远给出同一结论（可重入）。
// 协议：stdin=envelope JSON，stdout 恰好 pass/fail，exit 0；其余形态均视为 error。
import fs from "node:fs";
const text = messageText(readEnvelope().message);
process.stdout.write(/报告|report|status\.md/i.test(text) ? "pass\n" : "fail\n");

function readEnvelope() {
	try {
		return JSON.parse(fs.readFileSync(0, "utf8"));
	} catch {
		process.stderr.write("judger report-request: stdin is not valid envelope JSON\n");
		process.exit(3);
	}
}

function messageText(message) {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (Array.isArray(content)) return content.filter((b) => typeof b?.text === "string").map((b) => b.text).join("\n");
	return "";
}
