# LLM Mock (with Pi-Message)

**[English](README.md)**

**一个稳定、可靠、可信的 LLM Mock 服务器：一切 manipulation 只需要管 [Pi-Message](https://github.com/earendil-works/pi)（统一 Message 格式），厂商协议翻译全部由服务器承担。**

任意 Harness 以厂商原生协议调用（改 baseURL 即接入），server 解码为统一 Message 交给你的 mock 脚本，脚本产出再编码回同协议回复——**你写的每个脚本只面对一种格式，却同时服务 10 种协议；不需要任何真实模型凭据。**

## 为什么可靠可信

- **稳定**：锁定参照 pi-ai 版本，每个字段级转换都有冻结规格（`docs/design/mock-llm-server/` 图谱＋十协议规格），升级 = 锁新版重跑矩阵，差异机械可判。
- **实证**：历史私有语料对偶矩阵 824 绿＋ fuzz 16000 零 crash ＋ 双 harness（pi/OpenCode）真会话验证。真实语料不随仓库发布；公开运行明确跳过缺失语料，仍执行合成用例。
- **诚实**：不掩饰损失——不可逆字段逐条声明（如 timestamp 不上线、跨协议签名丢弃），测试从不注水。

## 核心 idea

pi-ai 在客户端方向维护「统一 Message ⇄ 各厂商 wire」的全部脏活；本仓库实现它的**对偶端**，正确性由对偶测试背书：`decode(convert(C)) ≡ canonical(C)`、`parse(encode(A)) ≡ providerFill(A)`（oracle = 锁定版本 pi-ai 适配器）。

> 🚀 **新手从这里开始**：[hands-on-tutorial.md](docs/design/mock-llm-server/hands-on-tutorial.md) —— 从零到多轮/工具/错误路径的全流程实测教程（每步真实命令＋输出，经新用户盲测校验）。

## 支持的协议（挂载端口上全部可用）

| 家族 | harness 侧 baseURL | 说明 |
|---|---|---|
| OpenAI Chat Completions | `http://127.0.0.1:18000/<name>/v1` | 27+ 兼容 provider 的通用格式 |
| OpenAI Responses | 同上 `/v1` | |
| Anthropic Messages | `http://127.0.0.1:18000/<name>` | |
| Google Generative AI | `http://127.0.0.1:18000/<name>/v1beta` | |
| pi-messages | `http://127.0.0.1:18000/<name>` | |
| azure / codex / vertex / bedrock / mistral | 见 `docs/design/mock-llm-server/mount-routing.md` | bedrock 走二进制 EventStream |

## 运行时依赖

- 不新增顶层运行时 Cargo 依赖；Codex WebSocket 仅开启现有 axum 的 `ws` feature，`Cargo.lock` 记录该 feature 的传递项。
- `zstd` CLI 是可选系统依赖：仅接收 `Content-Encoding: zstd` 请求时需要（锁定 pi-ai 的 Codex HTTP/SSE 会优先压缩）。server 通过 `which zstd` 探查并用进程管道解压；请将其放入 `PATH`。安装指引：<https://facebook.github.io/zstd/>。缺失、损坏或解压后超过 2 MiB 时返回协议形状的 400 错误；未压缩 HTTP 与 WebSocket 不依赖它。
- Vertex 本地 ADC 不必使用真云凭据：测试可生成临时 RSA service-account 文件，设置 `universe_domain: "mock.invalid"`，通过 `GOOGLE_APPLICATION_CREDENTIALS` 配合 project/location 与本地 baseUrl 使用；SDK 本地签发 JWT，server 只取 KeyID、不验签。详见 `docs/design/mock-llm-server/transport-unblock.md`；不要将测试凭据用于云服务。

## 使用教程

> 完整版（含 pi/OpenCode 接入、工具往返、挂载生命周期、故障排查）：[hands-on-tutorial.md](docs/design/mock-llm-server/hands-on-tutorial.md)

```sh
cargo build

# 1. 起常驻 server（挂载表落盘 mounts.json，重启自动恢复）
./target/debug/mock-llm-server --port 18000 --capture-dir captures

# 2. 挂载脚本（得到专属 URL；--port 可选钉死专属端口兜底个别 SDK 剥路径前缀）
./target/debug/mock-llm-server add scripts/mock-scripts/round-counter.mjs --name demo
#   script `demo` added, visitable at http://127.0.0.1:18000/demo

# 3. 让 harness 指过去（以 OpenCode / pi 为例，任意兼容 SDK 同理）
#    provider.baseURL = http://127.0.0.1:18000/demo/v1   apiKey 随便填

# 4. 管理
./target/debug/mock-llm-server list      # name + url + command
./target/debug/mock-llm-server remove demo
```

行为契约：`/<name>/…` 路径前缀 → 脚本直绑；未挂载 404；挂载路由（含专属端口）不要求认证，KeyID 仅作脚本可选输入，缺省为空串；缺凭据的 `401 missing_key` 仅用于 legacy registry 路由；`--capture-dir` 把每次解码出的统一请求落盘（`req-NNNNNN-<api>.json`）供调试与对偶测试。mistral 与 openai 共享路径时按请求形状判别，可用挂载项显式钉死解码器。`v1`/`v1beta`/`openai`/`__admin` 等为保留字。

## Mock 脚本编写指南

脚本是任意可执行程序（node/python/shell…），**每次请求独立进程调用**——不要依赖进程内状态，连续性从 transcript 推导。

**输入**（stdin，单条 JSON）：

```json
{
  "api": "openai-completions",
  "keyId": "whatever-harness-sent",
  "model": "demo-model",
  "sessionSignal": null,
  "request": {
    "model": "demo-model",
    "context": { "messages": [ /* 统一 Message，见下 */ ] },
    "options": { "maxTokens": 64, "temperature": 0.5 }
  }
}
```

**输出**（stdout，单条 JSON，二者选一）：

```json
// 正常回复：AssistantMessage（camelCase；usage 全字段必填）
{ "content": [ { "type": "text", "text": "hello" } ],
  "api": "openai-completions", "provider": "demo", "model": "demo-model",
  "usage": { "input": 1, "output": 1, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 2,
             "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0 } },
  "stopReason": "stop", "timestamp": 0 }

// 错误路径（协议内可见错误）
{ "error": { "status": 429, "code": "rate_limited", "message": "boom" } }
```

**统一 Message 形状**：`role` ∈ `system|user|assistant|toolResult`；user content 为字符串或 `[{type:"text",text}|{type:"image",data,mimeType}]` 块数组；assistant content 为 `text|thinking|toolCall` 块（toolCall：`{type:"toolCall",id,name,arguments}`）；toolResult 带 `toolCallId/toolName/content/isError`。完整定义：`src/model/`（与 pi-ai JSON 逐字段对齐）。

**技巧（范式示例见 `scripts/mock-scripts/round-counter.mjs`）**：

1. **无状态多轮**：`round = context.messages 里 assistant 条数 + 1`，按 round 出不同回复——harness 每轮重发全量 transcript，天然携带轮次信息。
2. **工具往返**：第 1 轮回 `toolCall` 块（`stopReason:"toolUse"`，arguments 给参数）；harness 真执行工具并以 `toolResult` 回填；第 ≥2 轮收尾文本。脚本不关心协议——encoder 负责把 toolCall 编码成各厂商形状。
3. **读用户输入**：取最后一条 user 消息，content 可能是字符串或块数组，都要处理。
4. **区分协议分支**：`input.api` 可用则按协议微调内容（一般不需要，统一内容即可）。
5. **测错误路径**：输出 `{"error":{...}}` 而不是非零退出；stderr 只用于人读诊断。
6. **确定性**：同输入同输出，测试才可重复。

## 测试与语料

- `cargo test`：全协议单元测试
- `tests/`：对偶 harness——合成用例＋可选私有语料 × 全部协议 × 双方向深比较（含 fuzz）。`node tests/duality.mjs` 明确统计缺失语料 skip；`node tests/fuzz.mjs` 仅使用合成数据。`tests/pi-ai-imports.mjs` 要求 Node ≥23，以及同级 `../pi-mono/packages/ai` 锁定 checkout 和其依赖。
- 语料捕获插件 `extensions/llm-corpus-capture.ts`：挂到真实会话即存统一 Message 语料（采语料才需要真模型凭据；mock 本身永远不需要）

## 目录

`src/model` 统一类型 · `src/api/<api>` per-API 对偶模块 · `src/mounts` 挂载路由 · `scripts/mock-scripts` 脚本范式 · `docs/design/mock-llm-server` 规格、实测记录与总账 · `tests` 对偶与 fuzz

## 注意

语料/捕获目录（`.pi/mock-corpus`、`.tmp-*`、`captures`）及私有生成证据由 `.gitignore` 排除，切勿强制加入。发布版历史报告按需使用匿名路径、标识与合成正文；详见[发布脱敏审计](docs/design/mock-llm-server/release-sanitize.md)。锁定参照：本地 pi-mono `packages/ai` @1.2.0，升级须整批重跑对偶矩阵。
