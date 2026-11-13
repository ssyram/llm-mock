#!/usr/bin/env node
// toolResult judger：判断报告检查命令的结果是否“完整”。只读当前待处理
// toolResult 消息的文本：Pi bash 工具 exit 0 时没有退出状态行（完整），
// 非零退出时文本以 `Command exited with code N` 状态行结尾（缺失/不完整）。
// 只判断、无副作用、确定性；stdin=envelope，stdout=pass/fail，exit 0。
import fs from "node:fs";
const text = resultText(readEnvelope());
const complete = !/Command exited with code \d+\s*$/.test(text.replace(/[\r\n]+$/, ""));
process.stdout.write(complete ? "pass\n" : "fail\n");

function readEnvelope() {
	try {
		return JSON.parse(fs.readFileSync(0, "utf8"));
	} catch {
		process.stderr.write("judger status-verdict: stdin is not valid envelope JSON\n");
		process.exit(3);
	}
}

function resultText(envelope) {
	const blocks = Array.isArray(envelope?.message?.content) ? envelope.message.content : [];
	return blocks.filter((b) => typeof b?.text === "string").map((b) => b.text).join("\n");
}
