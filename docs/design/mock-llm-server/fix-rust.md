# Rust 修复与不可逆 finding 处置

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 范围与判据

本 worker 只改 `src/api/mistral_conversations/{encode,tests}.rs`、`src/api/mod.rs`、`src/api/usage_cache_tests.rs`、`src/registry/tests.rs`、本文。未改 `src/model/**`、`tests/**`、canonical、其余设计文档。下文所有 `api/*.ts` 行号相对于锁定源码 `<pi-mono>/packages/ai/src`，以实际读取/赋值路径判定，不以失败期望倒推 wire。

`mock-scripts.md` 的 F2、`matrix-ten.md` 的 23 案及 `fuzz.md` 为输入证据；原矩阵仍是历史结果，不因本轮源码改动自动变绿。每案处置见下表；待 canonical 声明项只留档，不改 oracle 迁就。

## F2：脚本 error 透传

接手时 `src/registry/mod.rs:179–182` 已正确写为 `let error: MockError = serde_json::from_value(...)`、`return Err(error)`，因此未重复改生产代码。记录中的 bug 是函数返回 `Result<AssistantMessage, MockError>` 导致隐式目标类型变成 AssistantMessage；明确 MockError 后，脚本的 status/code/message 原样进入协议错误响应。

新增 `src/registry/tests.rs:114–145` 两项真实 shell 回归：stdin 消费后输出 `{"error":{"status":429,"code":"mock_failure","message":"retry later"}}`，断言三字段；非法字符串 status 仍返回 500/`script_error_invalid`，未放宽错误校验。

HTTP 实测 `/v1/chat/completions`、`/v1/responses`、`/v1/messages` 均为 **429 / mock_failure / retry later**，不再出现 `script_error_invalid`。`mock-scripts.md` 的旧 KNOWN BUG 记录由本条证据 supersede；本 worker 按指定范围未改该文件。

## 十协议 usage 缓存粒度判定

| 协议 | 锁定解析器证据 | read/write 是否可逆 | Rust 处置 |
|---|---|---|---|
| openai-completions | `api/openai-completions.ts:1530–1555`：读取 `prompt_tokens_details.cached_tokens/cache_write_tokens`，input=prompt−read−write | 两者可逆 | 接手时 `src/api/openai_completions/encode.rs:88–99` 已完整发送；新增非零读写联合断言，不重复改 encoder |
| openai-responses | `api/openai-responses-shared.ts:560–575`：读取 `input_tokens_details.cached_tokens/cache_write_tokens`，input=wireInput−read−write | 两者可逆 | 接手时 `src/api/openai_responses/encode.rs:90–100` 已完整发送；新增 completed/incomplete 单测 |
| azure-openai-responses | `api/azure-openai-responses.ts:14,97` 使用共享解析器，字段同上 | 两者可逆 | Rust 复用 Responses encoder，单测同时验证此入口 |
| openai-codex-responses | `api/openai-codex-responses.ts:45,669,1544` 使用共享解析器，字段同上 | 两者可逆 | Rust 复用 Responses encoder，单测同时验证此入口；未据逻辑单测宣称 Codex transport 已通过 |
| anthropic-messages | `api/anthropic-messages.ts:713–721,868–879`：读取独立 `input_tokens/cache_read_input_tokens/cache_creation_input_tokens`，另读 `cache_creation.ephemeral_1h_input_tokens` | 两者及 1h write 可逆 | 接手时 `src/api/anthropic_messages/encode.rs:118–138` 已发送；新增 start/delta 的非零缓存及 1h 联合断言 |
| google-generative-ai | `api/google-generative-ai.ts:232–241`：input=promptTokenCount−cachedContentTokenCount，read=cachedContentTokenCount，**write=0** | read 可逆；write 固有不可逆 | `src/api/google_generative_ai/encode.rs:90–99` 已发送正确 read 与 prompt=input+read；不伪造写缓存字段 |
| google-vertex | `api/google-vertex.ts:240–249` 与 Google 同样读字段、**write=0** | read 可逆；write 固有不可逆 | Rust 复用 Google encoder，补共享入口单测 |
| mistral-conversations | `api/mistral-conversations.ts:555–573,616–626`：实际接受 `prompt_tokens_details.cached_tokens` 等拼写，input=prompt−read，**write=0** | read 可修可逆；write 固有不可逆 | `src/api/mistral_conversations/encode.rs:36` 已补 `prompt_tokens_details.cached_tokens`，prompt 保持 input+read，不把 write 混入 input |
| bedrock-converse-stream | `api/bedrock-converse-stream.ts:710–719`：读取 `inputTokens/outputTokens/cacheReadInputTokens/cacheWriteInputTokens`，1h 从 cacheDetails 累加 | 两者可逆（逻辑协议） | **bedrock usage 字段移交 bedrock-transport**。其 worker 修正旧 inputTokenCount/outputTokenCount 并补缓存；本 worker 不改其目录，共享单测验证修复结果与 1h detail |
| pi-messages | `api/pi-messages.ts:198,209` 原样使用 `event.usage` | 两者及 1h write 可逆 | Rust 已直传完整 usage，新增非零缓存原样断言 |

新增 `src/api/usage_cache_tests.rs` 七项测试：统一 input=11、output=5、read=13、write=17、1h write=7；断言所有入口可读取字段及 input 的逆公式。Google/Mistral 测试保留**非零 write 的输入样本**，只断言源码支持的 wire 投影且不发明写缓存字段；没有删字段或修改历史 case 使其通过。1h write 除 Anthropic、Bedrock、pi-messages 外没有对应读取路径，不扩造字段。

Mistral thinking 同时修正：`api/mistral-conversations.ts:644–680` 消费 `delta.content` 数组中的 `{type:"thinking",thinking:[{type:"text",text:...}]}`，不消费顶层 reasoning_content。`src/api/mistral_conversations/encode.rs:16` 已改成该 chunk，`src/api/mistral_conversations/tests.rs:20–41` 验证 wire；真实 pi-ai 实测恢复 thinking+text。

## 原 23 案逐项处置

证据分类：

- **R**：Responses 客户端 `api/openai-responses-shared.ts:688–693` 把 reasoning item 序列化为 JSON signature；它不可能原样产出外协议的 opaque `reasoning_content` 签名。`tests/canonical-ores.mjs:199–206` 对其 JSON.parse，在发请求前就报错；Rust `src/api/openai_responses/encode.rs:18–23` 同样限定 reasoning item。外协议 signature 的精确保留属目标协议不可逆域，待 canonical 显式说明签名来源/支持域，不编造 JSON 包装掩盖它。
- **A-S**：`api/anthropic-messages.ts:1639–1650` 的非 strict legacy schema 只发送 type/properties/required，$schema/$comment 在客户端发请求前丢失，属请求投影固有不可逆，待 canonical 声明。
- **A-M**：`api/anthropic-messages.ts:702–703` 在 wire model 不同于目标 model 时保留 responseModel；Rust `src/api/anthropic_messages/encode.rs:14` 发原回复 model。这是客户端可观察元数据，不能通过删除 wire model 隐藏；待 canonical 纳入 responseModel，而非 encoder bug。
- **G**：`api/google-generative-ai.ts:232–241`、`api/google-vertex.ts:240–249` 减 cachedContentTokenCount；Rust `src/api/google_generative_ai/encode.rs:93–94` prompt=input+read，所以解析后的 input 就是原 input。历史 `tests/matrix-lib.mjs:199` 却给 expected input 加 read；这是 canonical 填充错误，不是 Rust 漏发 read，更不是 read 固有不可逆。
- **M-T**：上述 `api/mistral-conversations.ts:644–680` 的 thinking reply chunk，已修；无签名字段路径，跨协议 thinking signature 的精确保留仍不可逆。
- **M-U**：`api/mistral-conversations.ts:616–626` 的缓存计数，read 已修；write 恒 0 属固有不可逆，待 canonical 显式声明。
- **M-Q**：请求源码 `api/mistral-conversations.ts:850–858` 发送 content thinking chunks；`src/api/mistral_conversations/decode_messages.rs:37–53` 仅解析顶层 reasoning 后提取文本。**可修的 decoder 问题，非固有不可逆，超出本轮 encoder 方向，仍待办**。

| # | 原协议 / 方向 / case | 判定与本轮处置 |
|---|---|---|
| 1 | openai-responses / reply / reply-corpus-kahuwo-2 | R：外协议 opaque signature，不改 encoder；待 canonical 域声明 |
| 2 | openai-responses / reply / reply-corpus-claude2-2 | R：同上 |
| 3 | azure-openai-responses / reply / reply-corpus-kahuwo-2 | R：同上，共用解析器 |
| 4 | azure-openai-responses / reply / reply-corpus-claude2-2 | R：同上 |
| 5 | anthropic-messages / req / syn-schema-metadata | A-S：客户端 legacy 投影固有不可逆；待 canonical 声明 |
| 6 | anthropic-messages / reply / reply-corpus-kahuwo-2 | A-M：合法 responseModel，待 canonical 纳入 |
| 7 | anthropic-messages / reply / reply-corpus-kahuwo-4 | A-M：同上 |
| 8 | anthropic-messages / reply / reply-corpus-claude-2 | A-M：同上 |
| 9 | anthropic-messages / reply / reply-corpus-claude-4 | A-M：同上 |
| 10 | anthropic-messages / reply / reply-corpus-glm5-2 | A-M：同上 |
| 11 | anthropic-messages / reply / reply-corpus-claude2-2 | A-M：同上 |
| 12 | anthropic-messages / reply / reply-corpus-glm52-2 | A-M：同上 |
| 13 | google-generative-ai / reply / reply-corpus-kahuwo-4 | G：正确 input=117、read=704；历史 expected 821 为 oracle 错误 |
| 14 | google-generative-ai / reply / reply-corpus-claude-4 | G：正确 input=2、read=1289；历史 expected 1291 为 oracle 错误；write=143 另属固有不可逆 |
| 15 | google-vertex / reply / reply-corpus-kahuwo-4 | G：同 #13 |
| 16 | google-vertex / reply / reply-corpus-claude-4 | G：同 #14 |
| 17 | mistral-conversations / req / syn-same-model-thinking | M-Q：可修 decoder，仍待办，不伪称协议丢失 |
| 18 | mistral-conversations / reply / reply-thinking-text | M-T：encoder 已修，wire 单测与真实 parser 验证 |
| 19 | mistral-conversations / reply / reply-corpus-kahuwo-2 | M-T：同 #18；未将旧矩阵结果自动标绿 |
| 20 | mistral-conversations / reply / reply-corpus-kahuwo-4 | M-U：read=704、input=117 可逆，已修 cache read 字段 |
| 21 | mistral-conversations / reply / reply-corpus-claude-2 | M-U：write=1357 客户端恒转 0，固有不可逆；待 canonical 声明 |
| 22 | mistral-conversations / reply / reply-corpus-claude-4 | M-U：read=1289、input=2 可逆已修；write=143 固有不可逆，仍待 canonical 声明 |
| 23 | mistral-conversations / reply / reply-corpus-claude2-2 | M-T 已修；M-U write=2379 固有不可逆，仍待 canonical 声明 |

`fuzz.md` 的 Completions reasoning_details 签名差异不在本轮缓存/矩阵 encoder 修复内；没有偷偷改签名逻辑、测试或规格，也没有宣称 fuzz 全绿。

## 验证与独立验收证据

| 命令/检查 | 结果 |
|---|---|
| 首次 `cargo test --lib usage_cache_tests` | FAIL：并行 Bedrock worker 的 mod.rs 引用了当时未落盘的 eventstream_tests/transport_tests，E0583；未补假文件，协调目录归属并 `sleep 30` 后重试 |
| 第二次 `cargo test --lib usage_cache_tests` | 6 PASS / 1 FAIL：Bedrock worker 正确补发 1h cacheDetails，本 worker 的新联合断言尚未列出该支持字段；按 `api/bedrock-converse-stream.ts:715–717` 补齐预期 1h detail，不修改生产协议行为 |
| `cargo test` | **105 PASS / 0 FAIL**；main 与 doc tests 0 FAIL，覆盖七项 usage、两项脚本 error、一项 Mistral thinking 新测试 |
| `cargo build` | PASS，实际运行本轮构建的本地服务二进制 |
| `rustfmt --edition 2021 src/api/usage_cache_tests.rs` 与 `rustfmt --edition 2021 --check src/api/usage_cache_tests.rs` | PASS，仅格式化本轮新增测试文件，未重排既有源码 |
| Node inline + 锁定 pi-ai + 本地二进制：七入口 reply 实测 | **7 PASS**：Completions、Responses、Azure、Anthropic、Google、Mistral、pi-messages；input=11/output=5/read=13，支持写缓存者 write=17，Google/Mistral write=0；Anthropic/pi-messages 1h=7，Mistral thinking+text 完整恢复 |
| Node inline + 本地二进制：F2 三 HTTP 入口 | **3 PASS**：Completions/Responses/Anthropic 返回 429、mock_failure、retry later，不含 script_error_invalid |
| 最后复验 `cargo test` | **105 PASS / 0 FAIL**，格式化后再次编译并全量执行，0 ignored |
| Python 文件边界检查 | PASS：本轮五个 Rust 文件均 ≤200 非空/非注释行（12/157/41/64/159）；无残留 `.tmp-fix-rust-*` |
| `tests/**` 整树内容 SHA256 前后比较 | 完全一致：`fee68c612095ce6a60841f0e110d2304e3665112245aa4d63ba34765adf1d32a`，证明本轮没有改测试树 |
| `git status --short` | exit 128：仓库无 .git，不能读取暂存区；本 worker 未执行 git add/commit/stage |

Node 检查直接通过 stdin 执行，只读取现有 `tests/pi-ai-imports.mjs` / `tests/models-shared.mjs`，临时文件建在项目内 `.tmp-fix-rust-*`，进程结束后清理，未写 `tests/**` 或测试结果 JSON。

仍需独立 reviewer 检查；本轮没有重新执行完整 23 案矩阵、Codex/Vertex/Bedrock 的端到端传输或默认 fuzz。Bedrock 由独立 worker 负责；上述共享单测是逻辑 usage 证据，不替代其 AWS EventStream 验收。不可逆项与 oracle 元数据问题继续保留为明确待办，不假绿。

## 收官联动处置（测试层记录，不改上述历史执行范围）

本测试 worker 仅修改 tests/docs，已将本表固有投影落入 canonical 与 `api/*.md`，附锁定行号：Responses reasoning-item JSON 域（SH:265–267,688–693）、Anthropic 非strict legacy schema（am:1631–1650）、Google/Vertex write=0 和 input=prompt−read（gai:232–241/GV:240–249）、Mistral write=0/签名不读取（mistral:616–626,644–680）、非支持协议1h write拆分无读取路径。Anthropic responseModel 是可观察元数据而非不可逆/encoder错误，providerFill 按源model与目标model推导，严格比较。

原23案中 **19项实际PASS，4项仍阻塞**（Responses/Azure跨协议opaque签名）；逐条表见 `final-ledger.md`，未据本表逻辑单测自动变绿。M-Q 后由独立 Mistral microfix 修复；锁定请求源码逐块保序，旧canonical聚合规则亦由该worker修正。两个受影响请求实跑PASS，新增测试层保序断言；本worker不写src或重复改canonical-mistral。

Completions 五个fuzz签名差异按OCC:123–152,261–273,331–338,669–680修reply canonical，实际默认fuzz **1600/0**。最终全量矩阵 **279/35**，cargo test **109/0**，Node回归 **15/0**；旧30Bedrock blockers全解除，Codex旧30加新增缓存1项仍因zstd/UTF8 extractor失败。最终总账保持所有真实失败，仍待独立reviewer gate。
