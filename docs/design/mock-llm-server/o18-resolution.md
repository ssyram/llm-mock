# O18：owner 裁决后的统一降级实施

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 1. 结论与边界

**原 O18 18 案已全部转绿：Responses 9/9，Azure 9/9。** 这是声明的确定性有损降级 D，不是原 thinking 块/签名的无损往返 E。

owner 已确认：目标不支持该 thinking signature 域时，非 redacted、非空白明文转 **text**，丢弃原 thinkingSignature；空白/redacted 块删除。合法 reasoning-item JSON 保留；AM/Google/Vertex/Bedrock/PM 原生 opaque 签名不全局删除。此规则取代 atlas B2 原先**未批准**的 unsigned reasoning-summary 草案。

本轮只实现 encode 侧目标签名域投影；不根据 reply 的 api/provider/model 重跑请求侧 TM，不改 decoder、统一数据模型、transport 或锁定 pi 源码。原本无签名的块维持各协议旧规则，不能将外域签名降级偷换为 Responses 原 unsigned-summary 分支。

锁定只读根：`<pi-mono>/packages/ai/src`。整树 243 文件 SHA256 为 `b5ff86777c0c1fd15280ab0cee1f4cbe7828922e9be717ce85fed9976af7bab0`，与冻结图谱记录相同（逐相对路径排序，累计 path、NUL、内容、NUL）。本轮没有写该根。

## 2. pi 真实处理：逐协议证据

以下 TS 路径均相对锁定根；Q 的来源转换与 R 的响应编码不可混为一谈。

**共同 TM**：`api/transform-messages.ts:95–98` 要求 api/provider/model 三等才是 sameModel；`:104–105` 跨模型 redacted 删除；`:109–112` 同模型签名块保留、其余空白 thinking 删除；`:113–116` 跨模型明文变为仅 `{type:"text",text:block.thinking}`，原签名不带入。`:119–125` 跨源 textSignature 同样剥离，`:130–134` 剥工具 thoughtSignature。

| 协议 | convert 入口与下游证据 | 跨源明文/签名实际处理 |
|---|---|---|
| openai-completions | `api/openai-completions.ts:1228` 调 TM；`:1298–1308` 取 text→content；`:1310–1347` 是剩余 thinking 的字段名/details 分支 | TM 已将跨源明文转 text、丢旧签名；不保留 thinking。剩余同源 thinking 才受字段名/details 或 thinking-as-text 规则控制。 |
| openai-responses | `api/openai-responses.ts:316`→`api/openai-responses-shared.ts:179` 调 TM；SH `:264–267` 只回放剩余签名 item；`:282–289` text→output_text | 跨源明文是 message/output_text，不是 reasoning summary；原签名删除。 |
| azure-openai-responses | `api/azure-openai-responses.ts:187` 调同一 convertResponsesMessages→SH `:179,264–289` | 与 Responses 相同。 |
| openai-codex-responses | `api/openai-codex-responses.ts:543` 调同一 convertResponsesMessages→SH `:179,264–289` | 与 Responses 相同；压缩 transport 不改变此转换结论。 |
| anthropic-messages | `api/anthropic-messages.ts:1168` 先 TM，`:1197–1205` 将转换后消息交 convert；`:1443–1448` text→text | 跨源明文转 text，签名丢弃。剩余同源 redacted/opaque 在 `:1450–1483` 有原生块；缺有效签名一般转 text，allowEmptySignature 才允许保留 thinking。 |
| google-generative-ai | `api/google-generative-ai.ts:374`→`api/google-shared.ts:191–200` 调 TM；GS `:234–266` 发 parts | 跨源明文是无 thought/无 signature 的 text。GS `:246–266` 另有同 provider/model 保 thinking、否则转 text 的分支；TM 的 api/provider/model 三等门槛先执行。 |
| google-vertex | `api/google-vertex.ts:467` 调同一 Google convert→GS `:200,234–266` | 与 Google 相同。 |
| bedrock-converse-stream | `api/bedrock-converse-stream.ts:976–987` 调 TM；`:1028–1031` text 分支；`:1038–1076` 剩余 thinking 分支 | 跨源明文已是 text，原签名不在该块中。同源 redacted 发 bytes；Claude 支持签名，缺签名回 text，其他模型不发普通签名。 |
| mistral-conversations | `api/mistral-conversations.ts:143–148` 先 TM；`:844–858` 分别发 text/thinking chunks | 跨源明文发 text；剩余同源 thinking 可发 thinking chunk，但无 thinkingSignature 字段。 |
| pi-messages | `api/pi-messages.ts:375–385,400` 直接把 context 放入 payload 并 JSON.stringify | **例外：没有 TM 跨源降级**，原 context 的 thinking/签名原样发送；不能将 vendor 的转换规则套到 PM。 |

运行证据：`tests/canonical-encode-thinking.test.mjs` 的锁定 pi 测试实际运行 TM，以及 Responses/Anthropic/Google 的 stream 构造链，在 onPayload 后立即抛出以阻止联网，逐一断言实际 payload 为 text/output_text，无 thinking/signature。其余协议的入口及复用关系以上述只读行号为证。

## 3. 实施：一个降级出口

`src/api/encode_thinking.rs:18–42` 集中定义载体门控，`:47–90` 为唯一 `project_content` 降级出口。七个根 encoder 在枚举 content 前调用它；Azure/Codex/Vertex 复用根，没有逐协议增加 catch/fallback 补丁。OCC 原 details 门控也迁到此处，投影与实际发射使用同一规则。

| 目标域 | 接入位置 | 支持范围与降级 |
|---|---|---|
| ReasoningItem | `src/api/openai_responses/encode.rs:19–20`；Azure `mod.rs:6`；Codex `encode.rs:1–7` | JSON object 的 type=reasoning 保留；其余有签名块转 text/删除。这里只保留既有 type 门控，不新增 vendor schema 校验。 |
| CompletionDetails | `src/api/openai_completions/encode.rs:18–19` | 三字段名，或整个数组各项 type 为 reasoning.summary/encrypted/text 的旧门控（含空数组）；其他有签名块转 text/删除。后续 pi 单项 shape 过滤不变。 |
| Unsigned | `src/api/mistral_conversations/encode.rs:14–15` | 不承载任何 thinking signature；有签名块转 text/删除，无签名块不变。 |
| Opaque | AM `encode.rs:19–20`、Google `encode.rs:13–14`、Bedrock `encode.rs:11–12`、PM `encode.rs:10–11`；Vertex `mod.rs:6` | 原生 opaque 保留，协议既有 redacted/空签名/块聚合规则不变。不能据此保证真实供应商接受或证明签名真实性。 |

投影保留明文原字符串，不 trim 输出；空白判定与 JS `trim()` 对齐（`:71–78`），BOM 被删、NEL 保留，已加 Rust/JS/wire 回归。无改动时借用原 content；有改动时保持剩余块次序，不修改输入，重复投影幂等。删除后按投影后索引编码，避免 Responses 的 msg_i 和 parser textSignature 错位。

独立 oracle：`tests/canonical-encode-thinking.mjs:2–23` 声明同一目标支持域；`tests/canonical-reply.mjs:10–12` 在 providerFill 前统一投影。它不读取 Rust 结果或 actual。`canonicalOresThinking` 仍是**投影后合法 item**的严格内部解析器，非法请求历史 JSON 仍报错，不借 O18 放宽 Q。

## 4. 定义同步

- `irreversibility-atlas.md:79,103`：A02.11/A03.06 从当前拒绝改为 D/text 与18案复跑状态。
- 图谱 `:352` I17：原签名字节/来源真实性仍是 L，不把降级误报无损。
- 图谱 `:361–373` B2：记录源码事实、目标域规则、owner 对旧 summary 草案的取代关系与复跑证据。
- 图谱 `:429,443` K2/F1：由待批准候选更新为已实施的统一出口。
- 图谱 D1 的原 18 个完整主键条目逐项附 **现 D/text、复跑 PASS**；保留原 result 索引/历史失败机制。D2/D3 与旧 W06/W08/634 案 JSON 不回写，不冒称全矩阵已重跑。
- 八份权威规格的第4节均补 O18 共用出口及本协议域：`api/openai-completions.md:107`、`openai-responses.md:158`、`anthropic-messages.md:138`、`google-generative-ai.md:105`、`bedrock.md:82`、`mistral.md:57`、`family-variants.md:117`、`pi-messages.md:68`。
- Responses `G09/G10`（`:212–213`）及 OCC C13/Mistral G32/家族 Responses 对账同步；native-opaque 协议显式说明本域保留，不扩大删除域。

## 5. 原 18 案复跑账目

使用原 corpus，不改输入/签名/主键，不新增 ignore；`tests/canonical-o18-replay.test.mjs` 通过真实 Rust HTTP→锁定 pi stream/parser→独立 canonicalReply 比较。每案完成即增量写 `tests/canonical-o18-results.json`，包含完整 expected/actual/diffs。断言18个结果均无 thinking 块：明文成为 text，空白 thinking 删除，不伪造 reasoning-item。

| 原 case 主键末段（方向均 reply） | openai-responses | azure-openai-responses |
|---|---|---|
| reply-corpus-kahuwo-2 | D / PASS | D / PASS |
| reply-corpus-claude2-2 | D / PASS | D / PASS |
| reply-corpus-b4-claude-reason-2 | D / PASS | D / PASS |
| reply-corpus-b4-deepseek-mixed-2 | D / PASS | D / PASS |
| reply-corpus-b4-deepseek-codegen-2 | D / PASS | D / PASS |
| reply-corpus-b4-deepseek-longreason-2 | D / PASS | D / PASS |
| reply-corpus-b4-kimi-reason-2 | D / PASS | D / PASS |
| reply-corpus-b4-kimi-toolerr-2 | D / PASS | D / PASS |
| reply-corpus-b4-glm53-mixed-2 | D / PASS | D / PASS |

独立脚本核对：这18个唯一 `(api,dir,name)` 与 `tests/w08-baseline.json` 中相应18个旧 FAIL 主键完全一致；现在18 PASS，无删除或替换案例。额外九协议真实 wire 回归 **13/13**（签名域保留/降级、redacted/空白、BOM/NEL），见 `tests/canonical-o18-wire-results.json`。Codex wrapper 复用投影有 Rust 测试，未绕过其 SDK 压缩边界来报真实 HTTP 绿。

## 6. 验证与 findings

| 命令/检查 | 结果 | 持久证据 |
|---|---|---|
| `cargo build` | exit0 | `tests/canonical-o18-cargo-build.log` |
| `cargo test` | exit0；当前整合工作区132 passed，0 failed；本轮新增4个共享投影/家族单测 | `tests/canonical-o18-cargo-test.log` |
| `cargo check --all-targets` | exit0；短暂 package-cache lock 自行释放 | `tests/canonical-o18-cargo-check.log` |
| `node --test --test-concurrency=1 tests/canonical-*.test.mjs tests/w08-oracles.test.mjs` | exit0，46/46 | 扩大后的全单测日志见下行 |
| `node --test --test-concurrency=1 tests/*.test.mjs` | exit0，86/86；含 O18 18案及九协议13案 | `tests/canonical-o18-node-unit.log` |
| `rustfmt --edition 2021 --check src/api/encode_thinking.rs src/api/encode_thinking_tests.rs` | exit0 | validation JSON |
| 定义静态检查 | 9份文档表列一致；8份规格仍有1–6节；共享出口引用行号有效；18条O18现行裁决齐全 | `tests/canonical-o18-validation.json` |
| Rust文件LOC | 本轮涉及10个Rust文件均≤200非空非注释行 | validation JSON |
| 锁定pi整树hash | 243文件，与冻结hash相同 | validation JSON |
| Git index | 仓库根无.git（status不可用）；`.working-stack` index的cached diff为空；无stage/commit操作 | validation JSON |

失败均作为 finding 记录，没有算 PASS 或归成 transport：

1. 首次 Rust 编译：新增 import 放到 AM `//!` 文件注释之前，触发 E0753；已移动 import 修复，随后完整测试通过。首次原始日志被成功重跑覆盖，原报错留在本轮工具记录；`canonical-o18-cargo-test-first-rerun.log` 是修正后的126绿中间态，不冒充失败日志。
2. 并行实施的瞬态 build：另线 `grammar_tool` 模块/`decode_tools` Result 尚未同时落盘，build失败；本线不改请求侧文件，30秒后重试成功。原输出为 `canonical-o18-build-finding.log`。
3. 首次 Node 使用未重建的旧 server binary，2个 OCC 案例 actual 与新 oracle 失配；保留 `canonical-o18-old-binary-finding.log`，重建新 binary 后再次验证通过。
4. 并行 Node test 文件竞争 harness 固定端口，O18套件 server启动失败（EADDRINUSE）；`canonical-o18-node-port-finding.log` 保留原输出。30秒后按 `--test-concurrency=1` 重试通过，未修改 harness、未跳过案例。

## 7. 残余风险与交付

- O18关闭仅指本轮声明投影后的18案；原 opaque 签名、thinking块身份与供应商真实性仍不可恢复。
- 不声称真实供应商接受自造签名；支持域以锁定 mock encode→pi parser 子集为准。
- Codex SDK zstd/Unicode header 等已有 transport finding 不在此线修复；未重跑完整十协议矩阵/1600 fuzz。86项本地单测通过不替代这些边界。
- 多线并行整合下，文件哈希/132项Rust计数是本轮采样时工作区状态；`src/api/mod.rs`、atlas/API文档同时包含其他批准线的独立修改，本轮所有权仅为本报告列出的O18接入/定义条目。
- 独立 reviewer gate 仍需父线程完成；本报告不代替独立验收。

完整改动清单、命令与产物hash见 `tests/canonical-o18-validation.json`。未stage任何文件。建议 reviewer 先看共享出口、原18案expected/actual，再核对B2及八份规格第4节。
