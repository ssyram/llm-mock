# W-08 后第二波 fuzz 扩展

> 发布验证重跑：仅使用公开合成输入，私有语料不分发。以下时间是本次验证运行元数据，不是原始会话时间；旧历史 Git 缺失备注已过期，当前发布状态见 [release-sanitize.md](release-sanitize.md)。

状态：completed；开始 2026-10-15T10:10:44.791Z；更新 2026-10-15T10:12:02.140Z。

## 冻结边界与执行

唯一期待依据：`irreversibility-atlas.md` + `api/` 八份权威页覆盖十协议（含 W-07；bedrock-mistral 为退役存根）。沿用已按冻结规则修订的独立 canonical；期待不读取 actual，不降低失败断言，不改 Rust 或只读 TS。

`node tests/fuzz.mjs [seedCount]` 默认 800；PRNG=`mulberry32(seed*1000003+protocolIndex)`，固定十协议顺序见 `tests/protocol-matrix.mjs`。每 seed 同时执行 Q/R，即 800×10×2=16000；失败不跳过另一方向。Mistral 使用既有专用 mount，避免已知共享路径身份歧义。

生成器八形状循环：user 图像块、system sections/toolsAdded/toolsRemoved 重放、12 个新增 assistant 的深多轮、约 32K UTF-16 长串、空串、合法 Unicode/emoji/组合字与 NUL/控制字符、8 层嵌套大 arguments（各层24对象数组）、四个 toolResult 的 success/error 交错（含图）。保留原随机浅层块/跨模型分布；修正原同模型 generator 的 model/id 键错配，实际命中 api/provider/model 三等分支。模型每8 seeds轮换视觉/非视觉（独立于八形状，故两分支均命中）。R 不制造非法 assistant image；Q 的 toolResult 形状无对应 R 字段，不伪称 R 覆盖。

规则锚点：atlas G1/G2、A01.02/A01.07、A02.02/A02.07、A05.02/A05.05、A06.02/A06.05、A07.16/A07.19、A08.02/A08.04/A08.05/A08.06、A09.01/A09.05、A10.01–04；R 内容/参数按各表 R 行与十协议 §4，非全局 strip/ignore。

## 三分类结果

计划 16000；已执行 16000；绿 16000；外部边界 0；新 finding 实例 0（0 个 diff 形状组，不等同根因数）。server crash 0。

| 协议/方向 | 绿 | 外部边界 | 新 finding |
|---|---:|---:|---:|
| openai-completions/req | 800 | 0 | 0 |
| openai-completions/reply | 800 | 0 | 0 |
| openai-responses/req | 800 | 0 | 0 |
| openai-responses/reply | 800 | 0 | 0 |
| azure-openai-responses/req | 800 | 0 | 0 |
| azure-openai-responses/reply | 800 | 0 | 0 |
| openai-codex-responses/req | 800 | 0 | 0 |
| openai-codex-responses/reply | 800 | 0 | 0 |
| anthropic-messages/req | 800 | 0 | 0 |
| anthropic-messages/reply | 800 | 0 | 0 |
| google-generative-ai/req | 800 | 0 | 0 |
| google-generative-ai/reply | 800 | 0 | 0 |
| google-vertex/req | 800 | 0 | 0 |
| google-vertex/reply | 800 | 0 | 0 |
| bedrock-converse-stream/req | 800 | 0 | 0 |
| bedrock-converse-stream/reply | 800 | 0 | 0 |
| mistral-conversations/req | 800 | 0 | 0 |
| mistral-conversations/reply | 800 | 0 | 0 |
| pi-messages/req | 800 | 0 | 0 |
| pi-messages/reply | 800 | 0 | 0 |

## 逐案证据与分类约束

`tests/fuzz-expand-results.jsonl.gz` 解压后每行一个方向用例（逐条独立 gzip member 追加，便于增量落盘）：seed、shape、vision、source、expected、actual、diffs、phase、captureCount。LF 记录序号=line（不是 Unicode 编辑器视觉行号），证据索引保存在 `tests/fuzz-expand-summary.json#rows`，不覆盖 W-06/W-08 快照。绿仅表示当前输入与冻结期待一致；不证明未生成的能力。

外部边界仅识别 Codex + capture=0 + valid UTF-8 的已知 zstd/String extractor 机制（atlas A04.01/B3/T1），不按协议整体兜底。其余失败一律 finding；包括 oracle 异常、内容不符与非该机制的无 capture。新 finding 表示本轮新暴露实例，可能归并已登记机制，不自动声称新的生产根因。

## 验证与残余风险


历史阶段曾无 Git；本次发布已初始化 Git，暂存状态见发布审计。外部边界不修复；本轮只扩测试，不修生产缺陷或反推 oracle。控制字符为合法 JSON 转义字符串，不包含非法 UTF-16 surrogate（该域另有冻结清洗规则，不在本轮新增要求内）。
