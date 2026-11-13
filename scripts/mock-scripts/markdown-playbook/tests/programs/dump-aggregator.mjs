#!/usr/bin/env node
// 测试用 aggregator：把 stdin envelope 原样落盘（MDP_AGG_DUMP），再按
// results 判定输出（全部就绪 / 有缺失）。用于断言 envelope 携带原始结果
// 与局部匹配结论、以及 aggregator 只在全部结果到齐后执行。
import { writeFileSync } from "node:fs";
let input = "";
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
	const envelope = JSON.parse(input);
	if (process.env.MDP_AGG_DUMP) writeFileSync(process.env.MDP_AGG_DUMP, JSON.stringify(envelope));
	const results = envelope.results ?? [];
	const ok = results.length > 0 && results.every((result) => result.verdict !== null && !String(result.text ?? "").includes("Command exited with code"));
	process.stdout.write(ok ? "全部就绪\n" : "有缺失\n");
});
