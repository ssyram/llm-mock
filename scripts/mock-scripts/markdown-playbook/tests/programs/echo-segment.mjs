#!/usr/bin/env node
// 测试用一次性/多轮 segment：无副作用、确定性。前缀里没有任何 seg_ 往返时
// 发出一次工具调用；已有一次结果时返回内部值（成功/失败取决于结果文本）。
// 也可通过 MDP_SEGMENT_MARKER 探测自己是否被调用过（被跳过时不落盘）。
import { writeFileSync } from "node:fs";
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
	if (process.env.MDP_SEGMENT_MARKER) writeFileSync(process.env.MDP_SEGMENT_MARKER, "invoked\n");
	const messages = (JSON.parse(input).context ?? {}).messages ?? [];
	const results = messages.filter((m) => m.role === "toolResult" && String(m.toolCallId ?? "").startsWith("seg_"));
	if (results.length === 0) {
		process.stdout.write(JSON.stringify({ assistant: { stopReason: "toolUse", content: [
			{ type: "text", text: "一次性探测开始。" },
			{ type: "toolCall", id: "seg_once", name: "bash", arguments: { command: "echo probe-ok" } },
		] } }));
		return;
	}
	const text = results.map((m) => (m.content ?? []).map((block) => block?.text ?? "").join("\n")).join("\n");
	process.stdout.write(JSON.stringify({ result: text.includes("probe-ok") ? "计数完成" : "计数失败" }));
});
