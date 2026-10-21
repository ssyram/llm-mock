import { writeFileSync } from "node:fs";
import { artifactPath } from "./test-artifacts.mjs";
export const reportPath = artifactPath("fuzz-expand.md");
export const evidencePath = artifactPath("fuzz-expand-results.jsonl.gz");
export const summaryPath = artifactPath("fuzz-expand-summary.json");
export function classify(row) {
	if (row.ok) return "green";
	const text = row.diffs.join("\n");
	if (row.api === "openai-codex-responses" && row.captureCount === 0 && text.includes("capture file, got 0") && text.includes("valid UTF-8")) return "external-boundary";
	return "finding";
}
export function saveReport(state) {
	const counts = { green: 0, "external-boundary": 0, finding: 0 };
	const byProtocol = {};
	const groups = new Map();
	for (const row of state.rows) {
		counts[row.category]++;
		const key = `${row.api}/${row.dir}`;
		const bucket = byProtocol[key] ??= { green: 0, "external-boundary": 0, finding: 0 };
		bucket[row.category]++;
		if (row.category !== "finding") continue;
		const signature = [...new Set(row.diffs.map((diff) => diff.split(":")[0].replace(/\[\d+\]/g, "[]")))].sort().join(";");
		const groupKey = `${key}/${signature}`;
		if (!groups.has(groupKey)) groups.set(groupKey, []);
		groups.get(groupKey).push(row);
	}
	const summary = { ...state, counts, byProtocol, updatedAt: new Date().toISOString() };
	writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
	const lines = ["# W-08 后第二波 fuzz 扩展", "", `状态：${state.status}；开始 ${state.startedAt}；更新 ${summary.updatedAt}。`, "",
		"## 冻结边界与执行", "", "唯一期待依据：`irreversibility-atlas.md` + `api/` 八份权威页覆盖十协议（含 W-07；bedrock-mistral 为退役存根）。沿用已按冻结规则修订的独立 canonical；期待不读取 actual，不降低失败断言，不改 Rust 或只读 TS。", "",
		"`node tests/fuzz.mjs [seedCount]` 默认 800；只跳缺压缩依赖的Codex HTTP，其他协议继续；skippedProtocols与protocols记录实际范围。PRNG=`mulberry32(seed*1000003+protocolIndex)`，固定十协议顺序见 `tests/protocol-matrix.mjs`。每 seed 同时执行 Q/R，完整环境为800×10×2=16000；失败不跳过另一方向。Mistral 使用既有专用 mount，避免已知共享路径身份歧义。", "",
		"生成器八形状循环：user 图像块、system sections/toolsAdded/toolsRemoved 重放、12 个新增 assistant 的深多轮、约 32K UTF-16 长串、空串、合法 Unicode/emoji/组合字与 NUL/控制字符、8 层嵌套大 arguments（各层24对象数组）、四个 toolResult 的 success/error 交错（含图）。保留原随机浅层块/跨模型分布；修正原同模型 generator 的 model/id 键错配，实际命中 api/provider/model 三等分支。模型每8 seeds轮换视觉/非视觉（独立于八形状，故两分支均命中）。R 不制造非法 assistant image；Q 的 toolResult 形状无对应 R 字段，不伪称 R 覆盖。", "",
		"规则锚点：atlas G1/G2、A01.02/A01.07、A02.02/A02.07、A05.02/A05.05、A06.02/A06.05、A07.16/A07.19、A08.02/A08.04/A08.05/A08.06、A09.01/A09.05、A10.01–04；R 内容/参数按各表 R 行与十协议 §4，非全局 strip/ignore。", "",
		"## 三分类结果", "", `计划 ${state.seedCount * state.protocols.length * 2}；已执行 ${state.rows.length}；绿 ${counts.green}；外部边界 ${counts["external-boundary"]}；新 finding 实例 ${counts.finding}（${groups.size} 个 diff 形状组，不等同根因数）。server crash ${state.crashFindings.length}。`, "",
		"| 协议/方向 | 绿 | 外部边界 | 新 finding |", "|---|---:|---:|---:|"];
	for (const [key, count] of Object.entries(byProtocol)) lines.push(`| ${key} | ${count.green} | ${count["external-boundary"]} | ${count.finding} |`);
	lines.push("", "## 逐案证据与分类约束", "", "`tests/fuzz-expand-results.jsonl.gz` 解压后每行一个方向用例（逐条独立 gzip member 追加，便于增量落盘）：seed、shape、vision、source、expected、actual、diffs、phase、captureCount。LF 记录序号=line（不是 Unicode 编辑器视觉行号），证据索引保存在 `tests/fuzz-expand-summary.json#rows`，不覆盖 W-06/W-08 快照。绿仅表示当前输入与冻结期待一致；不证明未生成的能力。", "",
		"外部边界仅识别 Codex + capture=0 + valid UTF-8 的已知 zstd/String extractor 机制（atlas A04.01/B3/T1），不按协议整体兜底。其余失败一律 finding；包括 oracle 异常、内容不符与非该机制的无 capture。新 finding 表示本轮新暴露实例，可能归并已登记机制，不自动声称新的生产根因。", "");
	const external = state.rows.filter((row) => row.category === "external-boundary");
	if (external.length) lines.push(`外部边界 ${external.length} 案；首证据 JSONL L${external[0].line}：\`${external[0].diffs[0].replaceAll("`", "'")}\`。全部逐案位置见 summary 的 external-boundary 行；没有检查到内容，不计绿。`, "");
	let index = 0;
	for (const rows of groups.values()) {
		const first = rows[0];
		lines.push(`### FX-${++index} ${first.api}/${first.dir}（${rows.length} 案）`, "", `首例 seed=${first.seed}，shape=${first.shape}，vision=${first.vision}，phase=${first.phase ?? "compare"}，captureCount=${first.captureCount}；JSONL L${first.line}。`, "", "```text", ...first.diffs.slice(0, 8).map((diff) => diff.slice(0, 1200)), "```", "", "逐案证据（seed:JSONL行）：" + rows.map((row) => `${row.seed}:L${row.line}`).join("、"), "");
	}
	lines.push("## 验证与残余风险", "", ...state.notes.map((note) => `- ${note}`), "", "参照源码由官方 Git submodule 固定；本报告仅记录本次执行，不沿用历史 fork 的通过结论。外部边界不修复；测试不修生产缺陷或反推 oracle。控制字符为合法 JSON 转义字符串，不包含非法 UTF-16 surrogate（该域另有冻结清洗规则，不在本轮新增要求内）。", "");
	writeFileSync(reportPath, lines.join("\n"));
	return counts;
}
