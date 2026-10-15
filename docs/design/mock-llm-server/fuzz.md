# Shape-constrained fuzz：矩阵、findings 与处置

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 范围与可复现矩阵

- 入口：`node tests/fuzz.mjs [seedCount]`，默认 `seedCount=200`，每个 API 使用 seed 1–200。
- API：`openai-completions`、`openai-responses`、`anthropic-messages`、`google-generative-ai`。
- 每个 seed/API 各执行一个请求方向和一个回复方向：`200 × 4 × 2 = 1600` 个比较；每个 API/方向为 200 个。
- 伪随机源为 mulberry32，初始化为 `seed * 1000003 + API索引`；同一随机源先生成请求，再生成回复，因此复现必须保留此顺序和 API 索引。
- 请求方向：生成 transcript，经锁定 pi-ai 编码、Rust 解码，与各 API canonical 比较。回复方向：生成同模型 AssistantMessage，经 Rust SSE 编码、锁定 pi-ai 解析，与 providerFill 比较。
- 约束：system 仅在首位；toolCall 后跟配对 toolResult；assistant 不含 image；块数与文本长度有界；覆盖空串、空白、可选签名、同模型/跨模型历史、stop/length/error/toolUse。不是任意字节、恶意 JSON 或所有 API 的穷举测试。
- duality 是独立的固定 corpus/synthetic × 四 API × 双方向回归矩阵，验收至少 84 个比较；不得用 fuzz 成功替代固定回归。

## 首次复现

`node tests/fuzz.mjs`：1600 项中 1592 pass / 8 fail，无服务器 crash。Responses 请求 200/200，回复 197/200；Completions 请求 200/200，回复 195/200；Anthropic、Google 双方向均 200/200。

| finding | 首次差异 | 根因与处置 |
| --- | --- | --- |
| Responses reply seed 50 | `$.content[0].thinking`: expected `""`, got `"e2e axxka"` | providerFill 漏掉累计 delta 回退；修 oracle，保留 encoder |
| Responses reply seed 107 | `$.content[2].thinking`: expected `""`, got `"\n"` | 同上 |
| Responses reply seed 195 | `$.content[0].thinking`: expected `""`, got `"kne otoak2i lad2"` | 同上 |
| Completions reply seeds 30、53、114、156、189 | thinkingSignature 期望 `reasoning_content`，实际为含 `reasoning.encrypted`/`reasoning.text` 的 JSON 数组 | 本次改动前已存在，属于其他 worker 的处理范围，本次不修改 Completions 规范或编码 |

## 锁定源码证据与结论

锁定源码：`<pi-mono>/packages/ai/src/api/openai-responses-shared.ts`；导入固定为仓库同级 pi-mono 的 `src/`，见 `tests/pi-ai-imports.mjs:1-15`。

- `openai-responses-shared.ts:464-475`：reasoning item 创建独立 thinking slot，初值 `thinking: ""`，立即 append 到 `output.content`，索引按 append 顺序确定。
- `openai-responses-shared.ts:603-608`：added 创建 slot，summary delta 累加到 `output_index` 对应 slot。
- `openai-responses-shared.ts:683-700`：done 使用 `summaryText || contentText || slot.block.thinking`，签名为 `JSON.stringify(item)`；不会删除空 thinking 块。
- `src/api/openai_responses/encode.rs:16-30`：reasoning added/done 总会发出；仅当源 thinking 非空时发 delta；签名 item 原样作为 done item，无签名则生成 summary item。
- 原 `tests/matrix-lib.mjs:158-165` 仅使用非空 summary 或 content，没有第三项 delta 回退；这才是三条差异的共同原因。

因此，实测三条并非“源 thinking 为空导致相邻块移位”，而是 **reasoning 签名的 summary/content 为空、源 thinking 非空时，oracle 错把终值判为空**。源码明确保留累计 delta，也保留真正的空 thinking slot，不能声明统一剥离空 thinking。真正的空 thinking 在 summary、content、delta 均为空时会被现有 encoder 忠实还原；非空签名 summary/content 则按客户端优先级覆盖源文本。

经协调批准，采用修 oracle 的最小修订：在 `tests/canonical-ores.mjs` 定义回复 thinking 规范化，并由 `tests/matrix-lib.mjs` 的 `fillResponses` 调用，补上源 thinking（即 encoder 发出的累计 delta）回退。Rust encoder 和 `api/openai-responses.md` §c 不变；没有通过剥离空块或忽略 thinking 差异来掩盖问题。最初允许文件列表之外，仅额外批准上述 `matrix-lib.mjs` 接线，其他 API canonical 只读。

## 修订定位与校验

- `tests/canonical-ores.mjs:199-206`：新增 `canonicalOresThinking(block, index)`，签名 item 的生成/回放规则不变，终值为 `summary || content || block.thinking`，签名仍为 `JSON.stringify(item)`。
- `tests/matrix-lib.mjs:9,154`：导入并调用规范化函数；移除旧的 Responses thinking 计算和错误描述，其他 API 的 providerFill 原样保留。
- `src/api/openai_responses/encode.rs` 未修改；修订前后 SHA-256 都为 `23912c43b529ab307923af7eba4ed6a1e5493981ca826dfd83b302338d7edb76`。
- `tests/canonical-ores.mjs` SHA-256：修订前 `d87be64a5b8dadc2e307345dae1426dd21d967394ef26ba2516b5f110c3cfb54`；修订后 `d6b7cf7e1d3d66612d068b4acd38a9e9f2c91e8ad928a01eef7878cf6fde29a1`。
- `tests/matrix-lib.mjs` SHA-256：修订前 `71903b71f44b69a7458743633d8c08a0f783d0c7f3f289d1d23ec759fc0436c7`；修订后 `b61e4fb6487045a1654579c38b0912778b99d05e0d0f20c5321160fd8e3aabea`。
- 工作目录无 `.git`，`git status --short` 返回 `fatal: not a git repository`；无本地暂存区，未执行 git stage，也不能伪造 Git diff 证据。两个改动 JS 文件的非空/非行注释行数分别为 192、185，均低于 200 行。

## 验收结果与剩余阻塞

| 命令/验证 | 结果 |
| --- | --- |
| `node --check tests/canonical-ores.mjs` | PASS |
| `node --check tests/matrix-lib.mjs` | PASS |
| `cargo build` | PASS；后续矩阵运行的是本次构建的服务二进制 |
| `cargo test --lib api::openai_responses::tests` | 10 passed / 0 failed |
| `node tests/duality.mjs` | **84 pass / 0 fail**，四 API 双方向零回归 |
| `node tests/fuzz.mjs`（默认 200 seeds） | **1595 pass / 5 fail**；Responses 请求/回复各 200 pass / 0 fail；无 crash |
| `node tests/fuzz.mjs 30`（最小失败 seed 前缀） | **239 pass / 1 fail**；仅 Completions reply seed 30，Responses 双方向各 30/30 |
| 直接调用锁定 `processResponsesStream` 的八组断言（`node --input-type=module` 临时脚本） | 8/8 PASS；显式检查期望 thinking、三块长度、前后 text 和 thinking_end 的 contentIndex=1 |
| 真实 Rust 服务八组回复（`node --input-type=module` 临时脚本，调用 `replyDirection`） | 8/8 PASS；Rust SSE → 锁定 parser → oracle，且前后 text 无移位 |
| `cargo test --lib` 最近一次 | **86 passed / 2 failed**，均在并行修改的 mounts 模块，本次未修改该模块 |

八组专测均将 thinking 放在 `text("before")` 与 `text("after")` 中间：

| 情形 | 源 thinking | 签名 summary / content | 最终 thinking |
| --- | --- | --- | --- |
| 无签名真空块 | `""` | 自动生成空 summary | `""`，块保留 |
| 有签名真空块 | `""` | 空 summary | `""`，块保留 |
| 空 summary 回退 delta | `"delta text"` | 空 summary | `"delta text"` |
| 空 summary 回退空白 delta | `"\n"` | 空 summary | `"\n"` |
| content 优先于 delta | `"delta"` | 空 summary / `"content"` | `"content"` |
| summary 优先于 content/delta | `"delta"` | `"summary"` / `"content"` | `"summary"` |
| 签名无 summary/content | `"delta"` | 均缺省 | `"delta"` |
| 空源文本、非空 summary | `""` | `"summary"` | `"summary"` |

未新增持久化测试文件；修正后的现有 fuzz 矩阵持续覆盖 s50/s107/s195，以上临时专测补充了真空块与优先级边界。

### 非本次改动引起的失败

1. **Completions 五条签名差异仍在**：最小 seed 前缀复现为 `node tests/fuzz.mjs 30`（已实际运行：239 pass / 1 fail，仅 seed 30；首次及修复后也均实际运行默认 200-seed 命令）。seed 30 位于 `$.content[1].thinkingSignature`，expected `"reasoning_content"`，actual `[{"data":"RW5jcnlwdGVk","type":"reasoning.encrypted"},{"text":" xxxio ","type":"reasoning.text"}]` 的 JSON 字符串。s53、s114、s156、s189 同类。修订前后 seed 和差异完全相同；本次唯一 matrix 行为改动位于 Responses 分支，没有修改 `fillCompletions`、Completions canonical 或 encoder。交后续 worker 处理，不能把全局 fuzz 标为 0 fail。
2. **Rust 全量测试受到并行 mounts 改动影响**：首次 `cargo test --lib` 因 `src/mounts/mod.rs:12` 引用当时尚不存在的 `routing_tests` 模块而 E0583。文件出现后重跑 88 项，失败为 `mounts::tests::dedicated_port_conflict_and_release`（`src/mounts/tests.rs:45`，地址占用，409 port_unavailable）和 `mounts::routing_tests::mount_routes_script_protocols_then_remove_returns_404`（`src/mounts/routing_tests.rs:44`，`/test/v1/responses` 使用字符串 input，实际 400 / 期望 200）。本次没有触碰 Rust 源码或这些测试。
3. 最初直接 parser 专测夹具未提供终止 usage，导致 `calculateCost` 对缺失 cost 写入失败；补齐终止 usage 后八组全部通过。这是验证脚本的问题，不是产品 finding，也没有改动产品来规避它。

**当前结论：三条 Responses finding 已按锁定源码修复为正确 oracle；空 thinking 不剥离，encoder 保持不变。84 项固定回归已满足；全局 fuzz 0 fail 与 Rust 全绿仍被范围外失败阻塞，需要后续 worker 修复后重新验收。**

## 收官处置（supersedes 上述五条 Completions 未闭项）

本轮只修 reply canonical，不改 `src/**`、fuzz 生成器/seed/比较忽略表。锁定 `openai-completions.ts:123–152` 校验详情；`:261–273` 合并连续同类 text/summary detail；`:331–338` 终结 thinking 时用累计 details JSON 覆盖字段名签名；`:487–497,669–680` details-only 也创建 thinking slot，详情不是可见 thinking 文本。Rust encoder 已发送 reasoning 字段及 details，无需修生产代码。

`tests/canonical-occ-reply.mjs` 与 `canonical-occ-reasoning.mjs` 明确模拟该元数据路径：保留 visible thinking；合法详情存在则输出累计数组签名；无合法详情仍保留首次字段名；encrypted 独立，相邻 text/summary 合并并按源码补公共字段。`tests/matrix-lib.mjs` 接线后 s30/s53/s114/s156/s189 五项全部修复，不删样本，不添加 signature ignore。畸形 `reasoning.summary{text}` 被客户端拒绝；正确字段为 summary。

默认 `node tests/fuzz.mjs` 已实际得到 **1600 pass / 0 fail**（200 seeds × 4 APIs × 双方向），无 crash；日志 `tests/matrix-ten-fuzz.log`。全量矩阵非 fuzz 失败见 final-ledger，不能把 fuzz 0 fail 推广成十协议全绿。

持久化 `tests/canonical-occ-reply.test.mjs` 复用原随机推进顺序验证全部五个 seed，另真实 Rust SSE → 锁定 pi-ai 七组签名向量，独立断言 visible thinking、块数、签名值/JSON语义；还单测累计/merge/原样输入不变。新增测试首次夹具误带非 AssistantMessage 的 id 字段、随后发现 JSON 键序不能 byte 比较；修正仅限新夹具和按既有规格 JSON 值断言，不改现有 corpus/fuzz 或弱化比较。首次与矩阵并跑发生首选端口抢占，按要求 sleep 30 后重试；最终所有启动服务的 Node 命令串行，未扩大 harness。

最终 `node --test --test-concurrency=1 tests/canonical-ten.test.mjs tests/canonical-occ-reply.test.mjs tests/canonical-reply-projections.test.mjs tests/mock-script-contract.test.mjs`：**14 pass / 0 fail**。此前 Rust/mounts 历史失败已由前置修复解除，本轮实际 `cargo test` 为 **105 pass / 0 fail**。

最终联动复验（Mistral microfix 合并、1h缓存投影补齐后）：默认 fuzz **1600/0**，持久化 Node suite **15/0**，cargo test **109/0**（新增四项Rust测试来自独立microfix，不是本测试worker修改）。此前14/0、105/0为较早检查点。
