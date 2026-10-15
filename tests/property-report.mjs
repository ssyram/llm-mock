import { writeFileSync } from "node:fs";

const reportPath = new URL("../docs/design/mock-llm-server/property-tests.md", import.meta.url);
const evidencePath = new URL("./property-results.json", import.meta.url);
const definitions = `# W-08 后第二波：property / 不动点测试

## 冻结定义与数学表述

唯一期待来源：\`irreversibility-atlas.md\`（含 W-07），及 \`api/\` 八份权威页覆盖的十协议规格；\`bedrock-mistral.md\` 是退役存根。执行对象限四家族根 OCC / Responses / Anthropic / Google；不把四根结果外推到十协议。只读 TS 根：\`<pi-mono>/packages/ai/src\`。

固定目标模型 M、原生 stream 选项 O，令 V_p=pi convert，D_p=mock decode，Q_p=D_p∘V_p；K_p 为冻结 §4 的独立请求规则合成 oracle，R_p 为冻结回复 oracle，B(X) 是 UnifiedRequest→TranscriptContext 无损形状桥：取 X.context，并给 Rust 无标签 system/user/toolResult 块补 TS 的 type=text/image（按 text 字段是否存在判别）；模型/选项固定，不把解码身份重标成同模型，也不更改块值。I=JSON 值形状等价：对象键序不计，数组顺序和所有已定义字段均比较；仅 OCC/Responses thinkingSignature 按 JSON 值比较。不删除 usage、身份、工具 ID、空块或签名以求通过。

| 性质 | 字面化断言 | 规则依据 |
|---|---|---|
| P1 首次投影后的规则合成一致性 | X=Q_p(C)，Q_p(B(X)) ≡_I K_p(B(X))；保留 rawIdempotent = [Q_p(B(X)) ≡_I X] 及 rawDiffs，不再假定全域字面不动点 | atlas G5；各根 §4 的 Q-COMPOSE 定义；f4-p1-resolution.md |
| P2 encode–parse 帧不动点 | W=encode_p(A)，E=parse_p(W)，encode_p(E) ≡_F W；F 保留帧顺序、事件/其他行、data JSON 值及 [DONE]，不比较 JSON 键序/网络分片 | OCC A01.09–17；Responses G08–G15；Anthropic C15–C18；Google G22–G26 |
| P3 canonical 合成闭包 | Q_p(C) ≡_I K_p(C)，且 K_p(B(Q_p(C))) ≡_I K_p(B(K_p(C)))；同时核验第一轮 oracle 与 decode，防止单靠闭包吞共同错误 | atlas K3/K8；各根 §4，复用 W-08 独立 canonical oracle，不调用 decoder 推导期望 |
| P4 跨家族闭包 | 对 p≠q，X=Q_p(C)，Y=Q_q(B(X))，要求 Y ≡_I K_q(B(X)) 且 Q_q(B(Y)) ≡_I Y；即落在冻结目标 canonical 投影内且再次停留，不要求跨协议恢复 L/P 字段 | atlas G1–G3、K3/K7；目标根 §4。四根全部 12 个有向对 |

P1 按 owner 裁决演进：这是对首次投影后再转换的规则一致性检查，不声称再次输出已到固定点。首次 Q 无值时不满足 P1 前提，定义域拒绝作为 expected-rejection/domain finding 保留分母，不计通过。原24反例见 tests/property-p1-counterexamples.json。D/L/P 是已声明投影，不意味着投影天然幂等。P2 的左侧第二次编码使用真实 parser 输出，绝不替换为 R_p(A)；R_p(A) 仅独立核验 parser。P4 的目标投影不是“保留源协议全部信息”；不存在冻结的跨协议无损统一 canonical。所有非相等、输入域拒绝、oracle 异常、capture/HTTP/超时分别留作 finding；输入拒绝不算性质通过，也不虚称 transport T。下表分母包含失败/异常，不静默跳过。

## 执行与证据

\`node tests/property.mjs\`（默认四根；可追加 alias/API 仅用于定向复现）。语料来自 \`loadCorpora/corpusContexts/corpusReplies\`；合成来自既有 synthetic/additional/W-06/W-08，以及固定 seed 的生成器（1–12，每根相同可复现 seed 域）。每条记录完成即同步写 \`tests/property-results.json\` 和本文，含完整 expected/actual/diffs；异常保留阶段及已有证据。真实本地 HTTP、生产 Rust encoder/decoder、只读 TS converter/parser；非外网供应商验证。

比较帧使用同一进程临时包装 global fetch 只读克隆响应体（Google 禁止独立 options.fetch）；先读完克隆再交付原响应，防止 SDK 在 failed 事件后结束读取而取消抓帧；每次恢复 fetch，未覆写 payload/响应，原响应仍交原 SDK parser。这验证完整编码帧，不验证网络分片/流式时序。每次请求 10 秒 signal；整套 28 分钟 watchdog（给任务 30 分钟硬限留清理余量）。cargo/node 若发生环境阻塞，按 30 秒等待重试；本轮完整运行未发生此类阻塞，内容失败不改期待、不重试成通过。
`;

export function savePropertyReport(state) {
	state.updatedAt = new Date().toISOString();
	writeFileSync(evidencePath, JSON.stringify(state, null, 2) + "\n");
	const lines = [definitions, `开始：${state.startedAt}；最近落盘：${state.updatedAt}；状态：${state.status}。`, "", "## 每条性质通过率", "", "| 性质 | 根/源→目标 | 通过/总数 | 通过率 | 失败（其中异常/阻断） |", "|---|---|---:|---:|---:|"];
	for (const property of ["P1", "P2", "P3", "P4"]) {
		const rows = state.results.filter((r) => r.property === property);
		const keys = [...new Set(rows.map((r) => r.target ? `${r.api} → ${r.target}` : r.api))];
		for (const key of [...keys, "合计"]) {
			const group = key === "合计" ? rows : rows.filter((r) => (r.target ? `${r.api} → ${r.target}` : r.api) === key);
			const passed = group.filter((r) => r.ok).length;
			lines.push(`| ${property} | ${key} | ${passed}/${group.length} | ${group.length ? (100 * passed / group.length).toFixed(2) : "0.00"}% | ${group.length - passed}（${group.filter((r) => r.phase !== "compare").length}） |`);
		}
	}
	const p1 = state.results.filter((r) => r.property === "P1");
	lines.push("", `P1 原始字面不动点：${p1.filter((r) => r.rawIdempotent).length}/${p1.length}；非幂等：${p1.filter((r) => r.rawIdempotent === false).length}；定义域 finding：${p1.filter((r) => r.phase === "domain-finding").length}。`, "");
	lines.push("", "## 样本覆盖", "", "| 根 | Q 语料/合成（含seed） | R 语料/合成（含seed） |", "|---|---:|---:|");
	for (const api of [...new Set(state.results.map((r) => r.api))]) {
		const count = (property) => {
			const rows = state.results.filter((r) => r.api === api && r.property === property);
			const corpus = rows.filter((r) => r.name.startsWith("corpus-") || r.name.startsWith("reply-corpus-")).length;
			return `${corpus}/${rows.length - corpus}`;
		};
		lines.push(`| ${api} | ${count("P1")} | ${count("P2")} |`);
	}
	lines.push("", "## Findings（同类聚合；逐例完整差异见 JSON）", "");
	const groups = new Map();
	for (const row of state.results.filter((r) => !r.ok)) {
		const first = row.diffs[0] ?? "unknown";
		const key = `${row.property}/${row.api}${row.target ? `→${row.target}` : ""}/${row.phase}/${first.split(":")[0]}`;
		const group = groups.get(key) ?? [];
		group.push(row);
		groups.set(key, group);
	}
	for (const [key, rows] of groups) {
		const row = rows[0];
		lines.push(`- **${key}**：${rows.length} 例；首例 \`${row.name}\`。${JSON.stringify(row.diffs.slice(0, 3)).replaceAll("`", "\\`")}。`);
	}
	if (!groups.size) lines.push("尚无失败记录（仅代表已完成样本）。");
	lines.push("", "## 结论解释（不扩大为修复决策）", "",
		"- P1 的 rawIdempotent/rawDiffs 保留字面不动点反例：decoder 默认身份使下一轮不再满足 sameModel，导致签名/思考/ID 持续投影；清洗后的空块也可能二轮过滤。统一期待是冻结 K 对 B(first) 的一次规则合成，不按案例名豁免差异、不改写真实输入。域拒绝不计通过。",
		"- P2 比较的是帧而非仅最终文本：OCC 同型块/重复调用可合并，Responses parser 补 reasoning=0 后会新增 usage 字段，Anthropic 缺省 1h=0 与请求身份 model 会改变再次编码的 usage/model。Google 条件 ID 发射与邻块合并也能改变帧。JSON 值等价不意味着帧序列不动点。",
		"- P3 单轮解码和独立规则的合成闭包一起检查；异常仍按失败计账。Unicode session 的 ByteString 预检无 capture，不称内容差异或 transport T。",
		"- P4 分开保留 projection 与 stability 差异。目标的单轮投影正确仍不蕴含再次稳定；例如 Google 无 ID 模型用 name 回填多个调用，重复结果对应关系可使下一轮补更多 No result provided。输入被投影至空 contents 时也可能在 Google SDK 本地拒绝。",
		"- Responses opaque reasoning_content 签名为冻结输入域拒绝，oracle 抛错保留为 finding；未实现未批准的 F1 签名降级。没有把域拒绝归为通过或替换成纯文本。",
		"", "## 验证、限制与交接", "", ...state.notes.map((note) => `- ${note}`));
	writeFileSync(reportPath, lines.join("\n") + "\n");
}
