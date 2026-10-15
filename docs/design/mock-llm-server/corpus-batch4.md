# Corpus batch 4 — real LLM sessions

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

采集目标：语料再扩充 ~12 场短会话，覆盖五类形态：长 thinking 推理、连续多工具调用、`isError` 工具结果、中英混合、代码生成。实际 13 次尝试全部有效（13 > ~12 目标），零失败场次、零跳过 provider。每场使用 `.tmp-corpus-b4-<provider>-<model>-<n>/real-session`，插件 `extensions/llm-corpus-capture.ts` 只采集最终化统一 Message 到 `.pi/mock-corpus/`（模式与 corpus-batch3.md 完全一致）。

每场命令模板（在场景目录 `real-session/` 内执行）：

```sh
pi -p --mode json --no-extensions \
  -e <repo>/extensions/llm-corpus-capture.ts \
  --provider <provider> --model <model> --thinking <level> '<prompt>' \
  > pi-out.jsonl 2> pi-err.log
```

## 认证复核

命令：`pi auth check --provider <provider> --model <model> --json`。5 组全部 ready，无一失效，无需跳过：

```
provider-a/claude-sonnet-5    {"status":"ready","provider":"provider-a","authType":"api_key"}
provider-a/deepseek-v4-pro    {"status":"ready","provider":"provider-a","authType":"api_key"}
provider-a/glm-5.2            {"status":"ready","provider":"provider-a","authType":"api_key"}
provider-a/kimi-k3            {"status":"ready","provider":"provider-a","authType":"api_key"}
provider-b/glm-5.3       {"status":"ready","provider":"provider-b","authType":"api_key"}
```

## 场次清单（13 场全部有效）

| # | Provider / model（meta 实测） | 场景 | Thinking 级别 | Tools | Rows / roles | Thinking 块 / 长度 / signature | isError | Exit / stderr / 时长 |
|---|---|---|---|---|---|---|---|---|
| 1 | `provider-a/claude-sonnet-5` | 长推理（1000!/2024! 尾零） | high | none | 3 / a:1,s:1,u:1 | 1 块；len=1（`"\n"`）；str `reasoning_content` | - | 0; 0B; 15.2s |
| 2 | `provider-a/claude-sonnet-5` | 连续多工具 | medium | read×2 | 6 / a:2,s:1,tr:2,u:1 | 0 | false,false | 0; 0B; 8.3s |
| 3 | `provider-a/claude-sonnet-5` | isError 工具 | medium | read×1 | 5 / a:2,s:1,tr:1,u:1 | 0 | **true** | 0; 0B; 10.9s |
| 4 | `provider-a/deepseek-v4-pro` | 中英混合推理 | high | none | 3 / a:1,s:1,u:1 | 1 块；len=644；str `reasoning_content` | - | 0; 0B; 13.2s |
| 5 | `provider-a/deepseek-v4-pro` | 代码生成（TS groupAnagrams） | medium | none | 3 / a:1,s:1,u:1 | 1 块；len=208；str `reasoning_content` | - | 0; 0B; 13.1s |
| 6 | `provider-a/glm-5.2` | 代码生成＋中英混合（TS debounce） | medium | none | 3 / a:1,s:1,u:1 | 0 | - | 0; 0B; 19.6s |
| 7 | `provider-a/glm-5.2` | 连续多工具 | medium | read×2 | 6 / a:2,s:1,tr:2,u:1 | 0 | false,false | 0; 0B; 10.3s |
| 8 | `provider-a/kimi-k3` | 长推理（12 球 3 称） | high | none | 3 / a:1,s:1,u:1 | 1 块；len=48；str `reasoning_content` | - | 0; 0B; 22.0s |
| 9 | `provider-a/kimi-k3` | isError 工具 | medium | read×1 | 5 / a:2,s:1,tr:1,u:1 | 1 块；len=14；str `reasoning_content` | **true** | 0; 0B; 18.3s |
| 10 | `provider-b/glm-5.3` → `glm-5.3-flash` | 连续多工具 | high | read×2 | 6 / a:2,s:1,tr:2,u:1 | 0 | false,false | 0; 0B; 7.2s |
| 11 | `provider-b/glm-5.3` → `glm-5.3-flash` | 中英混合（谚语翻译） | high | none | 3 / a:1,s:1,u:1 | 1 块；len=124；str `reasoning_content` | - | 0; 0B; 27.0s |
| 12 | `provider-a/glm-5.2` | isError 工具＋中文 | medium | read×1 | 5 / a:2,s:1,tr:1,u:1 | 0 | **true** | 0; 0B; 11.3s |
| 13 | `provider-a/deepseek-v4-pro` | 长 thinking 推理（连续整数和） | high | none | 3 / a:1,s:1,u:1 | 1 块；**len=2144**；str `reasoning_content` | - | 0; 0B; 41.1s |

目录（均含 `real-session/`，工具场含 `probe-a.txt`=`Batch 4 probe A: 33`、`probe-b.txt`=`Batch 4 probe B: 47`；isError 场的 `missing-b4-*.txt` 刻意不存在）：

- `.tmp-corpus-b4-provider-a-claude-sonnet-5-{1,2,3}`
- `.tmp-corpus-b4-provider-a-deepseek-v4-pro-{4,5,13}`
- `.tmp-corpus-b4-provider-a-glm-5.2-{6,7,12}`
- `.tmp-corpus-b4-provider-a-kimi-k3-{8,9}`
- `.tmp-corpus-b4-provider-b-glm-5.3-{10,11}`

关键形态实录（多工具场为**单轮并行双 toolCall**，一条 assistant 消息内两个 `read` 调用，随后两条 `toolResult`、一条收尾文本）：

```
claude-sonnet-5-2 row2 assistant [toolCall:toolu_synthetic_002,toolCall:toolu_synthetic_003]  stop=toolUse
claude-sonnet-5-2 row5 assistant [text]  stop=stop
glm-5.2-7        row2 assistant [toolCall:call_synthetic_004,toolCall:call_synthetic_005]  stop=toolUse
glm-5.3-flash-10 row2 assistant [toolCall:call_synthetic_006,toolCall:call_synthetic_007]  stop=toolUse
```

## 全量复核

对 13 个 `.pi/mock-corpus/capture-*.jsonl` 逐行 `JSON.parse`：**无坏行**；每目录恰好 1 个 jsonl + 1 个 meta.json；所有 meta `api=openai-completions`；角色分布与上表一致（推理场 3 行、工具场 5–6 行）；3 个 isError 场的 `toolResult.isError=true`；3 个多工具场均有 2 个 `read` toolCall 与 2 条 toolResult。thinking 签名形态与 b3 完全一致：存在时统一为 `content[].thinkingSignature` 字符串值 `reasoning_content`，无 `signature` 块字段或顶层签名字段。

## 编入 tests/corpus.mjs（增量）

- `SESSIONS` 追加 13 条（name `b4-claude-reason` … `b4-deepseek-longreason`，dir 与上表一一对应）；既有 5 条不动。
- `corpusContexts()` 追加 13 个 full-transcript 用例：`corpus-b4-claude-thinking`、`corpus-b4-claude-parallel-toolcall`、`corpus-b4-claude-tool-error`、`corpus-b4-mixed-zh-en`、`corpus-b4-codegen`、`corpus-b4-long-thinking`、`corpus-b4-glm52-codegen-mixed`、`corpus-b4-glm52-parallel-toolcall`、`corpus-b4-glm52-tool-error-zh`、`corpus-b4-kimi-reason`、`corpus-b4-kimi-thinking-tool-error`、`corpus-b4-glm53-parallel-toolcall`、`corpus-b4-glm53-mixed`；既有用例名与 messages 语义未改。
- 回复方向用例由 `extended-matrix-cases.mjs` 的 `corpusReplies(corpora)` 自动接管新会话的全部 assistant 消息：新增 19 个 `reply-corpus-b4-*`。

装载烟测（node，真实输出）：

```
sessions=18 totalMessages=73
contextCases=20 b4ContextCases=13
replyCases=26 b4ReplyCases=19
```

## 全量回归

`node tests/duality.mjs`（真实输出摘录）：

```
openai-completions: 63 pass / 0 fail
openai-responses: 54 pass / 9 fail
azure-openai-responses: 54 pass / 9 fail
openai-codex-responses: 0 pass / 63 fail
anthropic-messages: 63 pass / 0 fail
google-generative-ai: 63 pass / 0 fail
google-vertex: 63 pass / 0 fail
bedrock-converse-stream: 63 pass / 0 fail
mistral-conversations: 63 pass / 0 fail
pi-messages: 67 pass / 0 fail
=== matrix: 553 pass / 81 fail ===
```

`node tests/fuzz.mjs`（真实输出摘录）：

```
=== fuzz: seeds=200 apis=4 total=1600 pass=1600 fail=0 ===
openai-completions/req: 200 pass / 0 fail
openai-completions/reply: 200 pass / 0 fail
openai-responses/req: 200 pass / 0 fail
openai-responses/reply: 200 pass / 0 fail
anthropic-messages/req: 200 pass / 0 fail
anthropic-messages/reply: 200 pass / 0 fail
google-generative-ai/req: 200 pass / 0 fail
google-generative-ai/reply: 200 pass / 0 fail
```

计数对账：用例总数 314（b4 前，见历史 `tests/matrix-ten-run.log` `=== matrix: 279 pass / 35 fail ===`）→ 634（+320 = 13 context × 10 协议 + 19 reply × 10 协议）；失败 35 → 81。除下列既有失败类外，**全部新增用例在 7 个协议上 100% 通过**（anthropic/google×2/bedrock/mistral/pi-messages/openai-completions 的 context+reply 全过，含中英混合、并行工具、isError、长 thinking 真实语料）。

## Findings（失败是 finding，不造假）

1. **`openai-codex-responses` 0/63 全失败 — 既有环境性失败，与本批无关。** 根因（matrix-ten-results.json diff 实录）：`expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1` — harness 侧 SDK 在发请求前即拒绝，非 mock server 解码错误。历史 `tests/matrix-ten-run.log`（本批运行前已存在）同样有 `FAIL openai-codex-responses/req/corpus-sys-user` 等同类 31 项失败（16 req + 15 reply，当时全部用例），本批只是用例数从 31 增至 63，仍是 100% 全失败。
2. **`openai-responses` / `azure-openai-responses` reply 方向 9 fail — 既有 thinking 签名类的 +7 新实例。** 根因（diff 实录）：`Unexpected token 'r', "reasoning_content" is not valid JSON` — 真实 provider 把 `thinkingSignature` 记为字面字符串 `reasoning_content`，而 responses 系 encoder 期望 reasoning-item JSON，SDK 端 `JSON.parse` 直接抛错。既有失败 `reply-corpus-kahuwo-2`、`reply-corpus-claude2-2` 同类；本批新增 7 个失败（`b4-claude-reason-2`、`b4-deepseek-mixed-2`、`b4-deepseek-codegen-2`、`b4-deepseek-longreason-2`、`b4-kimi-reason-2`、`b4-kimi-toolerr-2`、`b4-glm53-mixed-2`）恰为 b4 语料中全部含 thinking 块的 7 条回复，其余 12 条新回复全过。含 thinking 的回复在其余 8 个协议全部通过。
3. **claude-sonnet-5（provider-a 中转）high thinking 的 thinking 内容极短**：scene 1 捕获 thinking 块内容仅 `"\n"`（len=1）但签名正常；正文为中文答案（≈数百字符）。即该通道实际不回传 thinking 原文，语料价值在签名形态而非推理文本（与 b3 观察：claude 工具场 medium 无 thinking 块一致）。真正的长 thinking 文本由 deepseek-v4-pro 提供（scene 13 len=2144、scene 4 len=644）。
4. **glm-5.3-flash 工具场用 high thinking 一次成功**（scenes 10–11），未复现 b3 scene 13 的 medium→HTTP 400 code 1210；本批按 b3 结论直接用 high，无失败尝试。
5. 本批零失败尝试、零跳过：5 个 provider 认证全 ready，13/13 会话 exit 0、stderr 全 0B、无 `stopReason=error`。

## 本批写入范围

仅 `.tmp-corpus-b4-*/`（13 个场景目录）、`tests/corpus.mjs`（增量 2 处：SESSIONS +13、corpusContexts +13 用例）、本文档。运行回归本身会刷新 `tests/matrix-ten-results.json`（duality 的固有落盘行为，未改动其代码）。
