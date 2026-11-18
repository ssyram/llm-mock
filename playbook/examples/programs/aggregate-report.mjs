#!/usr/bin/env node
// aggregator 示例外接程序：由播放器（markdown-playbook mock.mjs）执行，
// stdin 是 JSON envelope（context.messages 前缀 + results[] 原始结果与局部
// 匹配结论 + location），stdout 输出一个聚合结论（运行时去掉恰好一个结尾
// 换行后交给同一套 cases）。本程序只读 envelope、无副作用、确定性：
// 框架逐请求重建历史会重跑它，不保证恰好执行一次。
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
	const envelope = JSON.parse(input);
	const results = envelope.results ?? [];
	const everyCallMatched = results.length > 0 && results.every((result) => result.verdict !== null);
	const noFailureText = results.every((result) => !String(result.text ?? "").includes("Command exited with code"));
	process.stdout.write(everyCallMatched && noFailureText ? "全部就绪\n" : "有缺失\n");
});
