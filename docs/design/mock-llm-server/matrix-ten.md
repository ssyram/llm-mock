# 十协议对偶矩阵

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

完成日期：2000-01-01 UTC。全矩阵最后运行：00:00:00–00:00:00 UTC。限时 30 分钟内完成；仅写入 `tests/**` 与本报告，不修改服务器、统一模型或协议规格。

## 契约与证据

依据 `api/{openai-completions,openai-responses,anthropic-messages,google-generative-ai,family-variants,bedrock-mistral,pi-messages}.md`。

- 请求：真实客户端 `convert(context)` 发往本地 Rust mock，对比 capture 中的 `decode` 与 canonical。
- 回复：真实客户端解析 mock 编码的回复，对比协议 providerFill；同时检查 capture 的 API 身份，防止同路径误测其他协议。
- 每个协议有 7 个真实会话请求前缀、7 个原有合成形状、2 个新增形状（无 system、schema metadata）；回复有 7 个原有合成形状与 7 个真实 assistant 快照。pi-messages 再加 1 个请求与 3 个回复专用形状。
- 共 161 个请求、143 个回复，304 案。五组语料：kahuwo、claude、glm5、claude2、glm52。真实回复不改写其签名、usage 或原模型标记来适配目标协议。
- 完整逐案证据：`tests/matrix-ten-results.json`，包含 `api/dir/name/ok/diffs/expected/actual`，每个方向结束即落盘；异常案的 expected/actual 为 null，错误信息在 diffs。终端证据：`tests/matrix-ten-run.log`。
- 运行：`cargo build`，然后 `node tests/duality.mjs`。可按别名筛选，例如 `node tests/duality.mjs azure vertex pi-messages`，也支持完整 API 名称；筛选运行会覆盖同一结果文件，报告中的矩阵对应无参数全量运行。

## Model 与 transport 配置

`tests/models-shared.mjs` 显式列出十协议，未知 API 抛错，不再兜底当作 Google。所有 host 为 `http://127.0.0.1:{port}`。

| 协议 | baseUrl 后缀 | 实际客户端路径 / 特殊配置 |
|---|---|---|
| openai-completions | `/v1` | `/v1/chat/completions`，Bearer |
| openai-responses | `/v1` | `/v1/responses`，Bearer |
| azure-openai-responses | `/openai/v1` | `/openai/v1/responses?api-version=v1`，api-key；不伪造 deployment 路径 |
| openai-codex-responses | `/backend-api` | `/backend-api/codex/responses`；本地合成 JWT 含 account claim；使用真实 SSE transport，保留客户端 zstd 压缩 |
| anthropic-messages | 服务根 | `/v1/messages?beta=true` |
| google-generative-ai | `/v1beta` | `/v1beta/models/mock-gemini:streamGenerateContent?alt=sse` |
| google-vertex | `/v1` | Express `/v1/publishers/google/models/mock-gemini:streamGenerateContent?alt=sse`，API key；无需 ADC |
| bedrock-converse-stream | 服务根 | `/model/anthropic.claude-mock/converse-stream`；region=`us-east-1`，客户端支持的 `AWS_BEDROCK_FORCE_HTTP1=1`，apiKey bearer；不替换 AWS SDK |
| mistral-conversations | 服务根 | `/v1/chat/completions`；sessionId 导致原生 `x-affinity`，据此区分 OpenAI/Mistral |
| pi-messages | 服务根 | `/messages`，不占用 Anthropic 的 `/v1/messages` |

`apiKey`、sessionId、maxTokens 为本地测试值；每案使用 10 秒 AbortSignal。Azure/Codex 保留默认 strict 能力，没有为了通过语料关掉 strict。

## 最终结果矩阵

数字为 pass / fail；阻塞案仍计 fail，不计 pass 或 skip。

| 协议 | 请求 | 回复 | 总计 | 结论 |
|---|---:|---:|---:|---|
| openai-completions | 16 / 0 | 14 / 0 | 30 / 0 | 本矩阵通过 |
| openai-responses | 16 / 0 | 12 / 2 | 28 / 2 | 非 JSON 语料 thinking signature 超出 Responses oracle 输入域 |
| azure-openai-responses | 16 / 0 | 12 / 2 | 28 / 2 | 请求变体通过；同 Responses 签名限制 |
| openai-codex-responses | 0 / 16 | 0 / 14 | 0 / 30 | zstd 请求在 decode 前被拒绝 |
| anthropic-messages | 15 / 1 | 7 / 7 | 22 / 8 | 根 oracle 的 legacy tool schema 与 responseModel 缺口 |
| google-generative-ai | 16 / 0 | 12 / 2 | 28 / 2 | 根 providerFill cached input 期望错误 |
| google-vertex | 16 / 0 | 12 / 2 | 28 / 2 | Express 本地直连成功；复用根 cached input oracle 问题 |
| bedrock-converse-stream | 0 / 16 | 0 / 14 | 0 / 30 | SDK 已直指本地，但服务无 Bedrock 路由 |
| mistral-conversations | 15 / 1 | 8 / 6 | 23 / 7 | thinking 双方向丢失；cached usage 有损 |
| pi-messages | 17 / 0 | 17 / 0 | 34 / 0 | 近乎恒等路径通过 |
| **合计** | **127 / 34** | **94 / 49** | **221 / 83** | **60 案 transport blockers；其余 23 案见 findings** |

## Blockers

### B1 — Codex zstd 请求未解压（30 案）

全部请求/回复案无 capture，SDK 报：

```text
expected exactly 1 capture file, got 0: ; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1
```

客户端 `pi-mono/packages/ai/src/api/openai-codex-responses.ts:218–230,381–384` 压缩请求并设置 `content-encoding: zstd`；当前 `src/mounts/routing.rs:22` 以 `body: String` 接收，解压前即被 UTF-8 extractor 拒绝。这不是 canonical 不等价的证据：请求未到 codec。未禁用 zstd、未 mock fetch、未使用 WebSocket 绕过；未验证通过后的 Codex 内容对偶。

### B2 — Bedrock 缺路由（30 案），另有 EventStream 债务

全部案无 capture，真实 AWS SDK 报：

```text
expected exactly 1 capture file, got 0: ; SDK: Unknown: 404: {"code":"mount_not_found","message":"unknown mount"}
```

因此 **apiKey + baseUrl 可以将 AWS SDK 请求送往本地**；不是认证或端点无法配置。`src/mounts/protocol.rs` 的 Api/path_api 没有 Bedrock，路径被当成未知 mount（`src/mounts/routing.rs:31–36`）。不补路由来使本测试通过。

`api/bedrock-mistral.md` 另明确：codec 的 JSON SSE 是逻辑事件，不是 AWS EventStream 二进制 envelope。即使后续补路由，仍需真正的 prelude/headers/payload/CRC32 framing；该回复障碍在本轮未走到，不声称已实测解析失败。图片请求 bytes 适配亦未走到。

## Findings（未为绿灯改家族根 canonical）

### F1 — Responses/Azure 非 JSON thinking signature：4 案，语料输入域 / oracle 限制

`reply-corpus-kahuwo-2`、`reply-corpus-claude2-2` 在两协议均报 `Unexpected token 'r', "reasoning_content" is not valid JSON`。这些是其他协议来源的真实 opaque signature；Responses thinking signature 要求 reasoning-item JSON。`tests/canonical-ores.mjs` 的 `canonicalOresThinking` 使用 JSON.parse，异常仍按 fail 记录；不是凭此断言服务器 codec 有缺陷，也没有为适配协议重写真实语料签名。

### F2 — Anthropic legacy tool schema / responseModel：8 案，根 oracle 不完整

- `req/syn-schema-metadata`：期望保留 `$schema/$comment`，实际丢失。客户端 `anthropic-messages.ts:1639–1650` 非 strict 时明确只发 legacy `{type,properties,required}`，当前 mock-gpt 身份走该路径。根 canonical 尚未表达这项投影；不将其误称为服务器丢 wire 字段，也不改根定义。
- 7 个 `reply-corpus-*` 均出现额外 `responseModel`，值为原语料的 `glm-5.3-flash` 或 `claude-sonnet-5`。这是跨目标模型时客户端依照规格保留 wire model；现有 `fillAnthropic` 未纳入该字段。合成 same-model 回复均通过。

### F3 — Google/Vertex cached input：4 案，复用根 providerFill 的 oracle 错误

两协议的 `reply-corpus-kahuwo-4`、`reply-corpus-claude-4` 均失败：input 分别 expected 821 / got 117，expected 1291 / got 2。`tests/matrix-lib.mjs` 的 `fillGoogle` 将 cacheRead 加到期望 input；客户端 `google-generative-ai.ts:234–238` 则从 promptTokenCount 减去 cachedContentTokenCount。本轮保留根 providerFill，不据其错误认定 server 编码错误。Vertex 请求 16/16 证明本地 Express transport 与变体身份可用；未覆盖 ADC/区域路由。

### F4 — Mistral thinking：4 案，真实 codec/client 接口不对偶

- `req/syn-same-model-thinking`：期望 thinking+text 两块，实际仅 text。客户端发送 `content` 中的 thinking chunks（`mistral-conversations.ts:850–858`），mock `src/api/mistral_conversations/decode_messages.rs` 仅接受顶层 reasoning_content/reasoning，未解析 thinking chunks。
- `reply/reply-thinking-text`、`reply-corpus-kahuwo-2`、`reply-corpus-claude2-2`：期望 thinking+text 两块，实际仅 text。mock `src/api/mistral_conversations/encode.rs` 发顶层 delta.reasoning_content；客户端消费的是 delta.content 中的 thinking chunks，导致 thinking 不进入最终 AssistantMessage。

保留 thinking canonical；未删除 thinking 块或把损失定义成等价。

### F5 — Mistral cached usage：4 案（与 F4 重叠 1 案），已知有损限制

`reply-corpus-kahuwo-4`、`reply-corpus-claude-2`、`reply-corpus-claude-4`、`reply-corpus-claude2-2` 丢 cacheRead/cacheWrite；有 cacheRead 时 input 变为 input+cacheRead。encoder 仅发送 prompt_tokens=input+cacheRead、completion_tokens、total_tokens，不携带 cached prompt 细节；客户端无法拆回缓存。规格已有 “部分 usage cache 细节未进入统一结构” 限制，本测试将不可逆处保留为 finding。

### F6 — pi-messages 恒等性质：34 案通过

canonical 不 resolveTranscript、不 transformMessages；只投影统一模型未声明的 diagnostics/deferred/details/usage/nestedCalls 等记录字段及 Option null。保留历史 timestamp、durationMs、错误 assistant、孤儿工具调用、多个 system 更新、sections null、空块、usage/cost、签名和 namespace。user/system 的 TextContent/ImageContent 按 Rust untagged 形态不输出 `type`，不是删除实际内容。

回复专用形状验证空回复、空 text/thinking、redacted=false、签名、namespace、非默认 cost、非重算 totalTokens、responseId、providerThinkingLevel 和 aborted。回复仅忽略客户端生成的 timestamp/durationMs，**不忽略 usage/cost/totalTokens/providerThinkingLevel**。

## 其他验证

| 命令 | 结果 | 证据 |
|---|---|---|
| `cargo build` | exit 0 | 本地 debug 二进制已构建 |
| `cargo test` | exit 0 | 89 passed；main/doc-tests 0 failed |
| `node --test tests/canonical-ten.test.mjs` | exit 0 | 6 passed，覆盖十协议配置、变体身份/strict/schema、pi identity、Bedrock placeholder、Mistral thinking canonical |
| `node --check`（15 个改动/新增 `.mjs`）+ 源码行数检查 | exit 0 | 全部语法通过；每文件 ≤200 非空非注释行 |
| `node tests/duality.mjs` | exit 1 | 221 pass / 83 fail；`matrix-ten-results.json`、`matrix-ten-run.log` |
| `node tests/fuzz.mjs`（默认 200 seeds，仍为四家族根） | exit 1 | 1595 pass / 5 fail；`tests/matrix-ten-fuzz.log` |
| `node tests/smoke.mjs`（串行重跑） | exit 0 | SDK 回复 ok、capture API 正确；`tests/matrix-ten-smoke.log` |
| `git status --short` | exit 128 | 当前目录不是 git repository；未执行 git add，无法用 Git 独立验证暂存状态 |

Fuzz 五案为 openai-completions reply seeds 30/53/114/156/189：根 fillCompletions 期望 reasoning_content，而实际保留 reasoning_details JSON 数组签名。保留为根 oracle 范围不足，不改 fuzz 或根 canonical。第一次并发 smoke 与 fuzz 争抢首选端口，smoke 报 Address already in use；串行重跑通过，未为该竞争扩大 harness 变更。

## 增量与变更边界

首轮 206 pass / 98 fail；按规格补齐新增 canonical 的 Azure/Mistral constrainedSampling strict schema、Mistral/Bedrock system.sections 文本，撤回 Vertex 草稿误加的 OpenAPI 投影（family-variants §3a 和 google-vertex.ts:489 均为 convertTools(..., false, strict)），第二轮为上表最终结果。四家族根 canonical 文件及根 providerFill 分支的定义未改。

新增：`canonical-family-variants.mjs`、`canonical-bedrock.mjs`、`canonical-mistral.mjs`、`canonical-pi-messages.mjs`、`canonical-reply-additional.mjs`、`protocol-matrix.mjs`、`extended-matrix-cases.mjs`、`canonical-ten.test.mjs`、`corpus-replies.mjs`。修改 `duality.mjs`、`models-shared.mjs`、`pi-ai-imports.mjs`、`matrix-lib.mjs`、`harness.mjs`、`corpus.mjs`。`corpus-replies.mjs` 是原回复生成器的职责拆分；原 Responses thinking signature 分支扩至 Azure/Codex。harness 无 capture 错误现在附带 SDK errorMessage；请求实际结果字段修正为 cap.record.request。原有四别名 CLI 保留。

下一步：独立 reviewer 核验 canonical/spec 与结果证据，优先审阅 B1/B2 和 Mistral thinking 双方向问题；服务器修复及根 oracle 定义修订均为本任务之外的后续工作。当前不是十协议全绿，也不声称已验证受 transport 阻塞的内容对偶。

## 测试层收官与扩容交棒

本worker最新已完整分类的314项实跑 **279/35**，fuzz **1600/0**，cargo test **109/0**，持久化Node **15/0**。原23案19PASS/4签名域FAIL；旧Bedrock30 blockers全部真实PASS，Codex旧30+新增缓存1仍因zstd先被UTF8 String extractor拒绝。Mistral微修合入且逐chunk保序canonical落地后syn-same-model-thinking/syn-assistant-multi-text均真实PASS；旧聚合规则是oracle缺口，非生产回归。不可逆投影均已在canonical与api/*.md声明锁定行号，未改原语料/比较忽略表。

并发扩容后当前matrix-ten-results.json为634项 **553/81**（00:00:00快照），81fail尚未逐项分类；经supervisor批准显式交棒父线程，不回滚新语料，不将旧314项分类冒充634项收官。完整原314账、原23+60+五fuzz逐项定性及新增81fail交棒见final-ledger.md。
