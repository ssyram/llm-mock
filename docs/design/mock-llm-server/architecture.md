# Architecture — mock-llm-server

> `/workflow` §4.2 + `/qpdi` Q/D 结构。上游：`docs/research/mock-llm-server-research.md`。
> 状态：架构阶段产出，待用户确认后进入细化/实现（首批 per-API 逆向由并行 worker 承担，产出即细化文档）。

## Task Overview

**问题对象**：pi-ai 的对偶 Mock Server——解析厂商协议 request 为统一 Message，执行注册脚本，将 AssistantMessage 编码为同协议 reply。
**参照系**：锁定 pi-ai（本地 pi-mono `packages/ai` @1.2.0, HEAD `371cc25`）= wire contract 代表 + 对偶测试 oracle。
**实现**：Rust（用户裁决：利于推理）；测试 harness：TypeScript 运行锁定 pi-ai。

## Q

**Q.I（confirmed）**

- **Q.I.1 对偶等价即正确性**：对每个支持 API，`decode(convert(C)) ≡ canonical(C)`，且 pi-ai `parse(encode(A)) ≡ providerFill(A)`（canonical form 与 providerFill 逐 API 声明于逆向规格）。
- **Q.I.2 Mock 语义**：请求按 KeyID（协议认证头）分组，组内按内容匹配；恰好命中一个脚本才执行；未命中/歧义/脚本失败返回协议内可见错误，不静默降级。
- **Q.I.3 接入面**：任意 Harness 以所支持厂商协议调用即为合法客户端；不要求使用 pi-ai。
- **Q.I.4 边界**：不承诺理解未声明协议；decode 对 pi-ai 不产生的未知字段容忍（真实 SDK 兼容）；encode 遇不支持内容类型显式报错。

**Q.A**

- A1 [verified] pi-ai 只提供客户端方向转换（research §2）。
- A2 [verified] KeyID/sessionId 载体随 API 而定（research §3）。
- A3 [verified] 转换存在已知有损点，等价须按 canonical form 定义（research §5）。
- A4 [假设，duality 覆盖] pi-ai 适配器产生的请求代表厂商协议公共子集（生产大量使用）；其他 SDK 额外字段由容忍策略吸收。

**Q.E**

- E1 pi-messages 收窄路线被否决：需求是任意 Harness 原生接入。

## D.root

### 核心流程

```text
任意 Harness（测试时 = 锁定 pi-ai 适配器）
 → HTTP POST（厂商协议）
 → [M1] 路由 + KeyID 提取（Authorization: Bearer | x-api-key | …按 API）
 → [M2] decode：厂商 wire JSON → UnifiedRequest{ model, context, options }
 → [M3] registry & match：KeyID 下按内容匹配 → 恰一 MockScript
 → [M4] 执行：script(context, RequestInfo) → Either<MockError, AssistantMessage>
 → [M5] encode：结果 → 厂商 SSE 流（错误 → 协议内错误形态）
 → Harness 的 pi-ai 适配器解析 → AssistantMessage
```

### 数据结构（§3.1，跨模块共享 → `src/model/`）

- `Message = System | User | Assistant | ToolResult`；内容块 `Text | Thinking | ToolCall | Image`（serde tag = `role` / `type`，字段名与 pi-ai JSON 序列化一致，详见 `src/model/*.rs`）。
- `TranscriptContext { messages }`；`UnifiedRequest { model, context, options }`；`DecodedOptions`（maxTokens/temperature/sessionId/toolChoice/reasoning，均可缺席）。
- `AssistantMessage`：脚本输出契约；**省略** provider 运行时字段（diagnostics/deferred/nestedCalls）——mock 脚本不产生。
- `ToolResultMessage`：省略 record-only 字段（details/usage/nestedCalls）——不上线。
- `MockError { status, code, message }`；`RegistryEntry { keyId, matcher, script }`；`Matcher = TextIncludes | Regex | Any`。
- 不变量：`Message.timestamp` 在 decode 侧恒为 0（wire 不携带），由 canonical form 吸收；registry 注册后不可变（MVP 启动时构建）。

### 模块划分与功能规约（§3.2 简写）

- **M1 http 入口**：Requires 合法厂商路由；Ensures 提取 `RequestInfo{api, keyId, …}`；缺失认证头 → 401。
- **M2 per-API decoder**：Requires body 为该 API 合法 wire 请求（以锁定 pi-ai 适配器输出为准）；Ensures `Result<UnifiedRequest, DecodeError>` 且满足 Q.I.1 前半；非法 JSON/结构 → 400。
- **M3 registry & matcher**：Ensures 恰一命中或显式错误（404 无命中 / 409 歧义）；匹配确定性（同输入同结果）。
- **M4 script executor**：`trait MockScript: Fn(&TranscriptContext, &RequestInfo) -> Result<AssistantMessage, MockError>`；脚本 panic → 500 协议错误。
- **M5 per-API encoder**：Requires `Either<MockError, AssistantMessage>`；Ensures 输出锁定 pi-ai 解析器可接受的 SSE 帧序列（满足 Q.I.1 后半）；单内容块单次 delta（不做 token 流模拟）。
- **M6 mock model catalog**：每 API 固定零成本 Model 定义（harness 侧使用），使 provider 字段（api/provider/model/成本）可预测。

### 接口规约（§3.3 简写）

- HTTP ↔ M2：原始 bytes + headers → `UnifiedRequest`；M2 纯函数、无 I/O。
- M2/M5 ↔ model：只依赖 `src/model` 类型；per-API 模块间互不依赖。
- M3 ↔ M4：matcher 命中后注入 script；M4 不感知 HTTP。

### 分布式契约（附录 A 精简）

短连接 per-request HTTP/1.1；SSE 帧内有序（单流 FIFO）；无重试（客户端 SDK 重试对 mock 无害——无状态幂等）；失败模式：脚本错误/无命中/歧义 → 协议内可见错误；无会话状态（session 信号仅透传给 RequestInfo）；背压 N/A（本地测试负载）。

### 架构正确性论证（§4.2.1）

**goal → 模块映射**

- G1 任意 Harness 可用（以三大厂商协议为代表）→ M1+M2+M5（按 API 组合）。
- G2 对偶等价（Q.I.1）→ M2（decode 侧）+ M5（encode 侧）+ M6（providerFill 可预测）+ per-API canonical form。
- G3 Mock 语义（Q.I.2）→ M3+M4。
- G4 Rust 可推理实现 → `src/model` 统一类型 + per-API 模块隔离（互不依赖、纯函数）。

**模块协作论证**：G2 = 对每个 API：M2 的映射是该 API convert 函数的逐字段求逆（证据 = 逆向规格中的 file:line 映射表 + canonical form），M5 的输出帧以该 API 流解析器代码为规约；二者组合即 `decode∘convert ≡ canonical` 与 `parse∘encode ≡ providerFill`，由对偶测试在锁定版本上机械验证。G1 由 G2 + 真实 SDK 兼容容忍（A4）支撑。

**关键假设**

- H1（=A4）pi-ai 适配器请求代表厂商协议公共子集 — 残余风险：其他 SDK 独有字段行为差异，由 decode 容忍策略与后续真实客户端测试吸收。
- H2 锁定 checkout（`371cc25`）不被原地修改 — pi-mono 只读使用。
- H3 对偶测试 fixture 覆盖全部声明支持的消息形态/内容块/停止原因 — fixture 清单在逆向规格中逐 API 声明。

**模块级 invariant**

- I_1：per-API decode/encode 在其 fixture 语料上全定义（无 panic 路径）— 维护方：M2/M5 单元测试。
- I_2：matcher 确定性且恰一命中原则 — 维护方：M3；破坏 I_2 的唯一入口是注册（MVP 静态构建时校验 matcher 交集）。

### 关键设计决策

- D1 首批 API = 4 种主格式（completions/responses/anthropic/google）；azure/codex/vertex 等变体后续按共享代码归并。
- D2 Rust + serde 纯函数核心；HTTP 层（axum/tokio）在 M1 接线时引入，decode/encode 保持无 I/O 可单测。
- D3 注册形态 = **挂载制（定稿）**：常驻 server + `add/remove/list`；挂载得到 `http://host:PORT/{name}/…` 路径前缀（主）或专属端口（兜底，防个别 SDK 剥路径前缀）；name/端口 → 脚本直绑，KeyID/matcher 降为脚本可选输入；一切行为（多轮、状态）在脚本内，推荐无状态范式＝按 transcript 中 assistant 计数决定 round 回复。保留字（v1/v1beta/openai/codex/messages/model/__admin 等）禁作 name。（取代旧「静态注册表」方案）
- D4 编码粒度 = 每内容块单次 delta。
- D5 锁定 = file: 依赖本地 pi-mono `packages/ai`（lockfile 锁定 + 记录 commit `371cc25`）。

### MVP 范围与子计划路线

- **mock-1-core-duality**（进行中）：4 API 的 M2/M5 + M3/M4 静态版 + TS 对偶 harness + 真实语料捕获插件（extensions/llm-corpus-capture，存 .pi/mock-corpus/）。对偶测试矩阵 = 语料条目 × 全部支持 API：同一统一 Message 语料与 provider 无关，依次经每个 API 适配器再生 wire 并各自对偶验证（请求与回复两个方向）。
- mock-2-admin-registration：HTTP 注册 KeyID/matcher/script。
- mock-3-more-apis：bedrock/mistral/azure 等变体归并。
- mock-4-optional：流式粒度模拟、图像内容全支持扩展。

## 待确认（Decisional，见阶段报告）

1. 首批 API 集合是否如 D1（默认已按此并行开工）。
2. 注册形态 MVP 是否接受 D3（admin 端点后置）。
3. 锁定形态 D5（依赖本地 checkout 存在）是否接受。
