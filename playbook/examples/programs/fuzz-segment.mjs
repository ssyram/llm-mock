#!/usr/bin/env node
// segment 示例外接程序（跨多轮、非 Markdown 的剧本处理者）：播放器在每次
// 模型请求时以当前 transcript 前缀调用本程序；程序是无副作用的确定性函数
// ——从前缀里找出自己发出的 seg_* 消息与真实 toolResult，决定下一步：
//   还没有探测    → {"assistant": {…, toolCall seg_probe_1}}（宿主真实执行）
//   已有 1 次结果  → {"assistant": {…, toolCall seg_probe_2}}（第二轮复核）
//   已有 2 次结果  → {"result": "探测成功"}（内部返回值，绝不泄露为 assistant）
//   任一结果失败   → {"result": "探测失败"}
// 协议上明确区分「向宿主生成 assistant 消息继续交互」与「内部完成返回值」，
// 因此文本/工具动作对宿主可见，返回值只交给外层 cases。
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
	const messages = (JSON.parse(input).context ?? {}).messages ?? [];
	const isSeg = (message) => {
		if (message.role === "assistant") return (message.content ?? []).some((block) => block?.type === "toolCall" && String(block.id).startsWith("seg_"));
		if (message.role === "toolResult") return String(message.toolCallId ?? "").startsWith("seg_");
		return false;
	};
	const results = messages.filter(isSeg);
	const textOf = (message) => (message.content ?? []).map((block) => block?.text ?? "").join("\n");
	const failed = results.some((message) => message.role === "toolResult" && /Command exited with code/.test(textOf(message)));
	const rounds = results.filter((message) => message.role === "toolResult").length;
	const emit = (value) => process.stdout.write(JSON.stringify(value));
	if (failed) return emit({ result: "探测失败" });
	if (rounds === 0) {
		return emit({ assistant: { stopReason: "toolUse", content: [
			{ type: "text", text: "fuzz 段第一轮：写入探测文件。" },
			{ type: "toolCall", id: "seg_probe_1", name: "bash", arguments: { command: "printf fuzz > fuzz-probe.txt" } },
		] } });
	}
	if (rounds === 1) {
		return emit({ assistant: { stopReason: "toolUse", content: [
			{ type: "text", text: "fuzz 段第二轮：复核探测文件存在。" },
			{ type: "toolCall", id: "seg_probe_2", name: "bash", arguments: { command: "test -f fuzz-probe.txt" } },
		] } });
	}
	emit({ result: "探测成功" });
});
