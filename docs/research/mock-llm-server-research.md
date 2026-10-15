# Research — mock-llm-server（pi-ai 对偶 Mock Server）

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

> `/workflow` §4.1 阶段记录（已确认完成）。证据基线：2000-01-01。

## 1. 问题与目标

为任意 LLM Harness 提供 Mock Server：接受厂商原生协议 request，解析为统一 Message 上下文；按 KeyID + 内容匹配执行注册的 mock 脚本；把脚本产出的 AssistantMessage 按同一协议编码为 reply 发还。以锁定版本 pi-ai 客户端适配器为 wire contract 代表与测试 oracle（对偶测试）。

## 2. 核心事实：pi-ai 的能力方向（结论：客户端方向 only）

[源证] `pi-mono/packages/ai/src/api/*.ts`（1.2.0）各 API 模块只实现：

| 操作 | pi-ai | 本项目 |
|---|---|---|
| Message → 厂商 request（`convert*Messages`） | ✅ | 对偶：decode |
| 厂商 reply → Message（`process*Stream`） | ✅ | 对偶：encode |
| 厂商 request → Message | ❌ | 自建 |
| Message → 厂商 reply | ❌ | 自建 |

request/reply 是不同数据结构，客户端函数不可反向调用；对偶实现 = 按锁定源码逐 API 转录并求逆。

## 3. 运行证据：server 实际收到什么（probe @1.0.3 dist）

本地 HTTP 捕获器 + 四个适配器实测（统一传 `sessionId`）：

- `openai-completions`：`POST /v1/chat/completions`，`Authorization: Bearer`；messages 为厂商格式；无 timestamp、无 session 头。
- `openai-responses`：`POST /v1/responses`，`Authorization: Bearer`；`input` 数组；携带 `session_id` / `x-client-request-id` 头与 `prompt_cache_key`。
- `anthropic-messages`：`POST /v1/messages`，`x-api-key`；content blocks 带客户端注入 `cache_control`。
- `pi-messages`：`POST /messages`，直接统一格式 + `options.sessionId`。

结论：**KeyID 载体随 API 而定（Bearer / x-api-key）；sessionId 非跨协议保证字段**。⚠️ 证据取自 1.0.3；锁定参照为 1.2.0 源码，逐 API 细节在逆向规格中按 1.2.0 复核。

## 4. 已排除路线

- **pi-messages**：server 零解码，但要求所有调用方换协议——与“任意 Harness 原生接入”冲突，用户否决（范围收窄教训，见 .pi/AI-learning.md）。
- **fauxProvider**：进程内脚本化 provider，非 HTTP server。
- **Portkey gateway**：文档声明三格式互转；开源 handler 读取未证实可嵌入复用；hono/cloudflare 重栈。
- **LiteLLM**：messages↔responses 转换存在但文档自认有损（`stop_sequences`/`top_k` 静默丢弃）；文档指向源码路径 404；Python 栈。

## 5. 反向约束：已知有损/变换点（逆向规格须固化为 canonical form）

[源证: probe + 1.2.0 源码阅读]

- completions：timestamp 不上线；system 折叠为 string；`tool_call.arguments` 为 JSON 字符串。
- responses：tool call id 规范化（`fc_*`/`ctc_*`）；text/thinking 签名经 item id JSON 编码（`encodeTextSignatureV1`）。
- anthropic：客户端注入 `cache_control`；system 为 blocks 数组。
- google：`contents`/`parts` + role `user`/`model`；functionCall/functionResponse；待逆向规格确认。

因此对偶等价定义为：`decode(convert(C)) ≡ canonical(C)`，canonical form 逐 API 声明（= wire 可表达的精确子集）。

## 6. 无现存实现

mock-with-pi 初始为空；pi-mono `packages/ai` 无 mock-server/对偶实现（rg 命中均为测试/无关）。→ 从零实现。

## 7. 锁定与推荐（已采纳）

- 锁定参照：本地 pi-mono checkout HEAD `371cc25`（2000-01-01），`packages/ai` @ **1.2.0**，工作区干净（最后变更 commit `34a8bb38`）。测试 harness 以 file: 依赖引用，与源码阅读同版本。
- 推荐（用户已裁决）：Rust 实现 server；TS harness 对偶测试；首批逆向 4 种封装格式：`openai-completions` / `openai-responses` / `anthropic-messages` / `google-generative-ai`；其余（azure/codex=responses 变体、vertex=google 变体、bedrock/mistral 等）后续子计划。
