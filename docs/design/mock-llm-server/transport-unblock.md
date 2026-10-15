# Transport 解阻：92 → 4

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 结论与范围

后续最后四红的逐例三方定性、独立网络探针与完整复跑见 [final-four.md](final-four.md)：3 案锁定客户端 ByteString 外部边界、1 案本仓库标量字符串域明确拒收；以下 transport 解阻数字为历史轮次证据，不将后续声明当作转绿。

- 主矩阵原 **828 案，736 绿 / 92 红**；本轮 **824 绿 / 4 红**，原失败中 **88 案转绿，0 回归**。原 89 个 Codex zstd blocker 中 88 转绿、1 暴露为内容定义域 finding；3 个客户端 ByteString finding 保留。不删案、不改分母、不把拒绝当通过。
- 补充真实适配器矩阵：**Codex WebSocket 88/90**，**Vertex ADC 80/80**。这 170 案单列，不混入主矩阵的 828 分母。
- **133/133 Rust 测试、95/95 Node 测试通过**。独立 reviewer gate 仍待执行，本文不是审查通过声明。
- 权威只读根 `<pi-mono>/packages/ai/src` 的 **243 文件哈希全部保持不变**。冻结定义为 atlas + api/，本轮只更新 transport 可达条件及其暴露出的 Codex 专有错误 oracle，不改信息损失规则或统一模型。
- `Cargo.toml` 仅由 `axum = "0.8"` 改为 `axum = { version = "0.8", features = ["ws"] }`；未添加顶层运行时依赖，尤其没有 zstd crate。supervisor 明确批准保留该 feature 导致的机械 `Cargo.lock` 更新，以保持 `--locked` 构建可复现；其传递项不冒充“lock 完全未变”。

全部逐案对比与只读校验见 `tests/transport-unblock-summary.json`；原始本轮基线另存 `tests/transport-unblock-baseline.json`，哈希清单在 `tests/transport-unblock-before.json`。

## 1. Codex zstd HTTP 请求体

### 源码证据

以下 TS 引用均相对只读根：

- `api/openai-codex-responses.ts:208–231`：Node/Bun 使用 `node:zlib.zstdCompressSync`、level 3；不可用/失败时返回 null。
- `:377–405`：SSE 路径压缩成功就发送 `content-encoding: zstd`，不等待服务端公告；WS 则发送未压缩 JSON。
- 原 `src/mounts/routing.rs` 使用 String extractor，压缩字节在 JSON decoder 之前被 UTF-8 拒绝。因此不能在 decoder 后补解压，不能禁压或换 fetch 来假装解阻。

### 实施

- `src/mounts/routing.rs:17–63` 改为 `Bytes` 提取，通过 blocking worker 调 `request_body::decode`，再选择协议与 decode/capture。命名挂载与专用监听共用入口。
- `src/mounts/request_body.rs:1–55` 每次 zstd 请求用 **`which zstd`** 探查系统程序，以 `std::process` 启动 `zstd -d -q -c`。并发写 stdin、读 stdout，避免管道互等；无新增 crate。
- 解压输出最多 **2 MiB**，与原 axum 请求体默认上限对齐；超限终止子进程，不让小压缩体绕过内容大小限制。未压缩请求保持原路径。
- 缺 CLI 返回协议形状 HTTP 400：`error.type=invalid_request_error`、`error.code=invalid_request`，message 包含 **https://facebook.github.io/zstd/**；损坏/超限也返回协议 JSON，不伪装 SSE 成功。
- 当前系统 `which zstd` 输出 `/opt/homebrew/bin/zstd`。缺失路径通过独立 server 子进程 `PATH=""` 实测，不修改宿主 PATH。

### 结果

真实 Codex SSE **88/90**：压缩请求完整到达 capture，正常回复/usage/endTurn 均走真实锁定 parser。缺 CLI、损坏体、超限、未压缩兼容，以及命名/专用端口均有回归。剩余 2 案是 ByteString 与 lone-surrogate，见第 5 节。

README 已新增“运行时依赖”：CLI 为可选依赖；只有接收 zstd 请求需要，缺失有官网安装指引；WS/未压缩请求不需要 CLI。

## 2. Codex WebSocket：确实可达，已实现

### 源码证据与 HTTP/WS 选择

- `api/openai-codex-responses.ts:276–302`：`transport = options.transport || "auto"`；非 sse 且 session 未被标记 fallback 时先试 WS。`cacheRetention=none` 不建 cache session；无 session 时生成 UUIDv7 WS request ID。
- `:317–375`：unknown previous response/连接限额有一次重试；开始前的 transport 失败才回退 SSE。API/协议/hook 错误和开始后的 transport 错误不靠 SSE 掩盖。显式 `websocket` 同样有上述 transport fallback，不能只凭选项断言实际使用 WS。
- `:1439–1477,1494–1600`：`auto` / `websocket-cached` 复用连接；当前 input 以“前次完整 input + 前次 response items”为前缀时，发送 `previous_response_id` 加剩余 input。
- `:1543`：发送 `{type:"response.create", ...requestBody}`，不是 HTTP SSE 字节。

### 实施与覆盖

- 仅启用已有 axum 的 `ws` feature。`src/mounts/codex_websocket.rs` 处理 GET upgrade、JSON text frame 与协议错误，复用现有 `Api::Codex.decode`、`server::process`（含 capture/脚本/KeyID）、Codex encoder；将其 SSE data 事件转换成逐条 JSON WS 消息。
- `src/mounts/codex_continuation.rs` 在连接内保存上一轮完整 input 与 output_item.done 项，按 previous_response_id 补回历史；未知 ID 返回 `previous_response_not_found`。不把增量当完整上下文，不把连接状态扩成云端全局存储。
- 无凭据命名/专用挂载沿用 HTTP 的空认证解码占位，脚本收到的 KeyID 仍为空；legacy registry 仍要求凭据。
- 真实 `auto` 两轮测试核验第二轮完整统一请求；SDK debug stats 断言 **1 个连接创建、1 次复用、1 次 delta、0 fallback、0 websocket failure**。这排除了“WS 实际失败但 SSE 悄悄通过”的假绿。
- 显式 WS 矩阵 **88/90**；另测 malformed JSON、未知 previous ID、命名挂载与专用端口。残余与主矩阵同类：ByteString、lone-surrogate。
- `cacheRetention=none` 的 WS 会生成 UUIDv7 头，decoder 将其视为 session signal。transport oracle 用 `@pi-generated:uuidv7` 预测，并独立验证 UUIDv7 格式与请求时间窗；含错误 UUID/版本/时间/模型的反例，不从 actual 回填 expected、不全局忽略 session。

边界：只承诺连接内上一轮续传，不承诺任意历史 ID 随机访问、断线后的云端持久化；开始前/后所有故障注入、取消竞态、并行 session 压力未穷举，不宣称完整复刻云服务。

## 3. Vertex ADC：伪凭据可用，不是整体永久边界

### 源码证据

- `api/google-vertex.ts:95–109,357–397,425–459`：非空非占位 key 走 Express；空值、`gcp-vertex-credentials`、`<…>` 走真正 ADC，要求 project/location。`GOOGLE_APPLICATION_CREDENTIALS` 传为 keyFilename，不能把普通 key 测试冒充 ADC。
- `:400–423`：custom baseUrl 配合 `ResourceScope.COLLECTION`；有版本段时清空 apiVersion。`fetch` 自定义被拒绝，故本轮不替 fetch 绕过认证。
- 补充 SDK 证据 `<pi-mono>/node_modules/@google/genai/dist/node/index.mjs:23769–23828`：ADC 总是调用 `GoogleAuth.getRequestHeaders(url)`，强制 `cloud-platform` scope，即使已有 Authorization header 也不会跳过凭据获取。
- `google-auth-library/build/src/auth/jwtclient.js:71–129,242`：**非默认 universe** 触发 self-signed JWT；从 service-account JSON 读取 universe_domain。本地 RSA 签名即可，不向云 token 服务换取凭据。
- 同库 `auth/googleauth.js:482–514` 将 service-account JSON 交 JWTClient；`auth/refreshclient.js:95–119` 的 authorized_user 则只读 refresh/client 字段，不能靠伪 access_token 绕过真实刷新。

### 实施与结果

`tests/vertex-adc-fixture.mjs` 生成临时 RSA key（不落仓库、不输出日志），写 mode 0600 的伪 service-account JSON：`project_id=mock-project`、`client_email=mock@mock.invalid`、`universe_domain=mock.invalid`。请求使用 marker 强制 ADC，设置 project/location/global、本地 baseUrl 与 `GOOGLE_APPLICATION_CREDENTIALS`，结束后删除文件。

真实适配器 **80/80 Q/R 通过**。专项测试校验 capture 的 KeyID 为 JWT，claims 的 iss 与 cloud-platform scope 正确。现有 `src/mounts/protocol.rs:98–112` 已接受 Vertex Bearer，`src/api/google_vertex/decode.rs:45–64` 复用内容 decoder；因此无需新增服务端认证协议、验签或运行时依赖，正如 Bedrock 仅读 KeyID。

**结论**：SDK 接受自定义 baseUrl + 本地伪 service-account（非默认测试 universe），不硬性要求所有 ADC 都有真云凭据，不能把 ADC 整体记为永久边界。默认 `googleapis.com` universe 的 authorized_user refresh / service-account token 交换仍依赖云认证，未实现本地 OAuth token 服务；这条默认刷新链保留环境/云边界，不声称被 Express 或自签测试覆盖。测试凭据不得用于云服务。

## 4. 解压后暴露的 oracle/fixture findings

这些问题先作为失败记录，再按已冻结源码修正，不改服务端迎合测试：

1. fixture registry 原只有 `duality`，Codex 实际 Bearer 是带 account claim 的 JWT。请求虽 capture，但回复匹配不到脚本。`tests/harness.mjs` 现同时注册普通 key 与 `streamOptions("openai-codex-responses").apiKey`，不改变 server 的 KeyID 定义。
2. 原 oracle 将 Codex failed 套成 Responses 的 `server_error: …` 与 `rawStopReason=failed`。`api/openai-codex-responses.ts:766–772` 在共享 parser 前抛错；`:486–493` 格式化后不加该前缀，也不赋 rawStopReason。缺文案由 encoder 发 `unknown error`；显式空文案变 `Codex response failed`。已按冻结分支修正 `tests/canonical-responses-reply.mjs`，7 个原差异消失；`canonical-codex-error.test.mjs` 用独立 expected 与 mutation 验证，Responses/Azure 原规则不变。
3. WS 无缓存 session 的 UUIDv7 不是 None；已按第 2 节独立结构+时间校验，不任意删除动态字段。

atlas 的 A04.01/A04.06/A04.08/A04.15/A04.29、A07.01 与 B3/C4 transport 条目，以及 api/family-variants.md 的 transport/failed/UUID 条目已同步。历史矩阵段仍保留历史性质，最新结论以本文为准。

## 5. 主矩阵前后与残余边界

| 协议 | 原绿/红 | 本轮绿/红 |
|---|---:|---:|
| openai-completions | 81/0 | 81/0 |
| openai-responses | 77/1 | 77/1 |
| azure-openai-responses | 78/0 | 78/0 |
| openai-codex-responses | 0/90 | 88/2 |
| anthropic-messages | 91/0 | 91/0 |
| google-generative-ai | 80/0 | 80/0 |
| google-vertex（Express） | 80/0 | 80/0 |
| bedrock-converse-stream | 89/0 | 89/0 |
| mistral-conversations | 79/1 | 79/1 |
| pi-messages | 81/0 | 81/0 |
| **总计** | **736/92** | **824/4** |

剩余 4 案（未删、未降级为 PASS）：

| finding | 源证据与边界结论 |
|---|---|
| Responses `req/w06-unicode-session` | 原始 Unicode session 进入 Headers/ByteString；字符值 55357 >255，客户端请求未发，capture=0。只读适配器/冻结定义不变时服务端无法解；非 ASCII body 并非普遍不支持。 |
| Codex `req/w06-unicode-session` | `api/openai-codex-responses.ts:276–290,1676–1700` 截码点不等于编码成 ByteString；头仍有 emoji，构造请求头前失败。不能靠服务端截断或改名修复。 |
| Mistral `req/w06-unicode-session` | 同为客户端 ByteString 前置拒绝；保留原 finding，不全局删除 session 比较。 |
| Codex `req/w06-surrogate-order` | `api/openai-codex-responses.ts:543–558` 顶层 instructions 未做 surrogate 清洗，JS JSON.stringify 可发 `\ud800`；Rust serde_json/String 无法表示孤立 surrogate，报 unexpected end of hex escape。原本被 zstd 遮住，现内容 JSON 定义域失败。无损读入不可能；服务端替换/删除意味着改冻结内容规则，不属于已授权 transport 解阻。WS 同样拒绝。 |

因此 **92→4** 是全部失败总账；更精确地，当前 **zstd transport blocker=0（CLI已装条件）**，残余 **3 个客户端 header 边界 + 1 个内容定义域 finding**，不是声称 4 案仍都受压缩阻断。

## 6. 验证、异常过程与证据索引

| 命令 | 结果/证据 |
|---|---|
| `which zstd` | `/opt/homebrew/bin/zstd` |
| `cargo check --locked` | exit 0，tests/transport-unblock-cargo-check.log |
| `cargo build --locked` | exit 0，tests/transport-unblock-cargo-build.log |
| `cargo test --locked` | exit 0，133 passed，tests/transport-unblock-cargo-test.log |
| `node --test --test-concurrency=1 tests/*.test.mjs` | exit 0，95 passed，tests/transport-unblock-all-node.log |
| `node tests/duality.mjs` | exit 1，824/828绿；4项finding如上，tests/transport-unblock-matrix.log、tests/matrix-ten-results.json |
| `node tests/transport-matrix.mjs` | exit 1，WS88/90、ADC80/80；保留2项WS finding，tests/transport-unblock-variants.log、tests/transport-unblock-variants.json |
| `node tests/vertex-adc-probe.mjs` | exit 0，真正ADC keyIsJwt=true，tests/transport-unblock-adc-probe.log |
| 定向 `rustfmt --check --edition 2021 --config skip_children=true`（6个实现/模块/fixture文件） | exit 0，tests/transport-unblock-fmt.log |
| 只读根 SHA-256 对比 | 243/243不变，tests/transport-unblock-summary.json |

过程 finding：首次 cargo check 因 axum WebSocketUpgrade 不支持 Option extractor 失败，已改 Result 并复验；首次 ADC 与矩阵并发抢固定端口，矩阵未启动，改为串行后成功；WS 测试最初断言未初始化的可选布尔值 false，依据源码改断言明确计数 sseFallbacks=0/websocketFailures=0 后通过。未遇到 cargo 锁等待超过30s，无需锁重试。仓库全局 `cargo fmt --check` 因既有其他文件格式差异失败（tests/transport-unblock-fmt-initial.log），未批量格式化无关代码，改用定向检查。

范围核验注意：本线程没有编辑的 `src/main.rs`、`src/mounts/{admin,cli,routing_tests}.rs`、`src/registry/mod.rs` 在本轮基线后也发生变化，已通知 supervisor；不能将其归因于本 transport 实现或覆盖回滚。全量 Node 回归按既有行为刷新了 `tests/canonical-o18-{results,wire-results}.json`，18项仍全部绿。范围/哈希证据见 tests/transport-unblock-scope.json。

工作目录无 Git 元数据，`git status --short` 报 fatal: not a git repository。未执行 stage/commit，**无法独立认证 Git index/no-staged-files**；该限制与待独立 reviewer gate 均保留，不以文字掩盖。
