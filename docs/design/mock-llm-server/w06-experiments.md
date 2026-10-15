# W-06 实验：冻结定义 × oracle × 实现

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

状态：最终实验账本已落盘；有未闭合 finding，不是全绿验收。2000-01-01；本轮在 30 分钟硬上限内收尾。

## 权威与边界

唯一规范：`irreversibility-atlas.md` 与 `api/` 当前统一规格第 4 节；冻结批准见 `freeze-verdict-2.md`。8 份权威页覆盖 10 协议，`bedrock-mistral.md` 是退役存根，不计第十一协议。canonical 是可逆字段集与双向幂等映射期待，不是原输入可无条件恢复。

仅修改 `tests/**` 与本报告。`src/**`、其他 docs 与 `<pi-mono>/packages/ai/src` 只读；文件初始 SHA256 清单见 `tests/w06-baseline.json`。无有效 Git 元数据（`git status --short` 报 not a git repository），不可伪称已证明暂存区为空。

## 初始对账

确认需修的既有 oracle 缺口：C05/C06/C07（Responses 请求 ID/签名/图像/schema）、C19（Mistral Q/R surrogate）、N1/N3（Google 签名/OCC details）、N7/C22–C28（独立回复期待、usage/native stop/元数据投影）。O18 当前拒绝仍是 finding，不实施外域 opaque 降级；Codex zstd transport 不改。

后续逐协议对账计数、用例增减、完整命令及三类结果将在执行后追加。任何定义与锁定源码矛盾停止相关工作并登记，不改冻结定义。

## 增量执行记录（首轮与纠正）

- 原有 14 项单元测试在修改后通过；独立 transcript/transform/schema 替换后仍通过。
- 首轮 duality：634 案，502 绿 / 132 失败；首轮 fuzz：1600 案，1530 绿 / 70 失败。新增失败均来自本轮 oracle 初稿假设错误，**不是生产 finding**：Google 计数器不保证每回复从 1 开始；R 的 ID 发射条件取 source `message.model`（Google §3），不是目标模型；Bedrock 未提供 1h 时应 undefined（Bedrock §3），不能补 0。原始证据保留 `tests/w06-*-first.log` 与 `tests/w06-duality-first-results.json`。
- 按冻结规则纠正上述假设后，完整第二轮 duality：634 案，553 绿 / 81 失败；fuzz：1600 案，1600 绿 / 0 失败。日志 `tests/w06-duality-second.log` / `tests/w06-fuzz-second.log`。失败仍是 O18×18 与 Codex T63，未降级、未忽略、未改源定义。
- 回复仅排除已结构验证的本地时间值；恢复比较 totalTokens、cost、rawStopReason、确定性 responseId、独立错误文案。Google 生成 ID 逐块结构检查时间区间/正计数/本回复内连续递增/唯一性，已发 ID 精确比较；不拿 actual 值填 expected。

下一步：增加冻结分支反例与真实 SDK 用例，最终结果以后面的最终账本为准。

## 最终对账与改动

### 规则汇编计数

按各权威页第 4 节**主汇编表**计数，不将旧裁决/补充 Cxx 表重复加数；family-variants 一页覆盖 Azure/Codex/Vertex。逐条规则及定义行号、对应 oracle 模块见 `tests/w06-rule-audit.json`。

| 权威页 / 协议 | 主规则数 | 本轮期待侧处理与证据 |
|---|---:|---|
| openai-completions | 15（C1–C15） | Q：surrogate、首个完整合法 details、legacy encrypted、opaque 不伪造 carrier、strict；R：前缀锚定/保留词终态、responseModel 条件、重复工具 ID 首槽/参数部分解析、ID/usage/raw 独立预测 |
| openai-responses | 15（G01–G15） | C05：三元同模型门控、目标 provider 集、call/item、foreign hash、phase/namespace、非法签名直接抛；C06：视觉结果图文保序且纯图不造文本；C07：strict schema、显式预算；R：v1、默认 ID、failed 文案/usage、无 call 的 toolUse 回 stop |
| anthropic-messages | 19（C01–C19） | 文本清洗、每张 error image 原位替换、纯图前缀、未配对结果拒绝、末条缓存形态、legacy schema；R：签名能力/responseModel/ID/1h/费率，unsupported 文案差异保留 F1 |
| google-generative-ai | 11（G16–G26） | 三类合法 Q 签名、Gemini3 ID、图像归属、strict；R 最后非空签名、source message.model 控制已发 ID、生成 ID 分支验证、output 饱和、native stop 重映射 |
| bedrock | 23 | Q：sanitize 顺序、Claude name/id 门控、redacted 空串/无效过滤、MIME jpg→jpeg、bytes/base64、strict；R：optional 1h、零 total 回退、deferred/aborted、redacted payload 与未发字段 |
| mistral | 11（G27–G36＋D14） | C19：Q 先 trim 后 sanitize，R 先 sanitize 后跳空；ID 只跨模型、工具/文本位置、无 system 不伪造 tools System；C20：aborted/deferred 按既有投影；R read/total/native stop 独立验证 |
| pi-messages | 9 | Q 不套 vendor 历史变换，统一模型字段/空块/时间/可选投影；R 原 usage/cost/total、五合法终态、成功 errorMessage 删除；extras/sections 顺序仍是已知模型限制 |
| family-variants（Azure/Codex/Vertex） | 23 | Azure strict 与 body-only session、Codex 默认 instructions/无 max/默认 toolChoice/源 endTurn 丢失、Vertex Google 规则；Codex 内容实验被 T 阻断，不标内容已验 |
| **合计** | **126** | **全部静态对账；不冒称 126 条内所有条件分支均完成动态覆盖** |

已处理旧显式缺口编号：C05/C06/C07、C09/C10/C11、C18/C19/C20、C22/C23/C24/C25/C27/C28/C29（16 个不同编号；协议页自身 C01 等局部规则号不与其混算）。C26 历史已修部分保持，不算新闭合。N1/N2/N3/N7/N8 的期待侧缺口均有新反例；N4/N5/N6/N10 仍按冻结定义记当前实现/模型投影，未冒充已修生产能力。

### 独立性与比较空间

- `canonical-transcript.mjs`、`canonical-transform-messages.mjs`、`canonical-strict-schema.mjs` 按冻结定义独立实现；所有 request canonical 不再 import `pi-ai-imports.mjs`。锁定 pi 源码仅作为被测端与差异定位证据。
- `canonical-reply.mjs` 及协议模块仅接收 source message/model。`actual` 不进入期待生成；比较器单独检查时间及 Google P-ID。恢复所有确定字段比较，request 不再忽略任意嵌套 `api`，reply 不再全局忽略 cost/total/raw/levels/ID。
- 仅 OCC/Responses 的 thinking JSON carrier 按 JSON 值语义比较；opaque thinking/thoughtSignature 和 v1 textSignature 精确比较。新增 mutation tests 证明篡改 responseId、total、cost、raw stop、错误文案、确定性工具 ID 会失败。
- 源 cost 丢失不等于忽略 cost：vendor 依冻结费率/tier/1h 公式重算，PM 保原值。P 时间验证请求时钟区间/非负整数 duration；不声称服务端原时间往返。
- 新 schema/transcript/transform 逻辑无被测源码调用；`shortHash` 是冻结 UTF-16/双32位算法的测试侧实现。重复 OCC args 的组合按冻结 JSON→partial parse 顺序推导，两个完整 JSON 对象串接保留首对象，真实 SDK 反例复核。

### 用例增减

| 套件 | 原有 | 新增 | 删除 | 最终 |
|---|---:|---:|---:|---:|
| duality request | 291 | 97 | 0 | 388 |
| duality reply | 343 | 64 | 0 | 407 |
| duality 合计 | 634 | 161 | 0 | 795 |
| fuzz | 1600（4协议×200 seeds×双向） | 0 | 0 | 1600 |
| canonical 单测 | 14 | 20 | 0 | 34 |

`tests/w06-matrix-cases.mjs` 是新增真实 SDK 用例来源；`canonical-frozen-request.test.mjs` / `canonical-frozen-reply.test.mjs` 是新增独立向量与比较器 mutation tests。fuzz 的 RNG/种子/生成顺序未改，只将原生成器逐字迁到 `fuzz-message-generator.mjs`，以遵守 200 非空非注释行上限，并新增增量 JSON 证据。

## 最终三类结果

`node tests/duality.mjs` **exit 1**（如实保留失败）；`node tests/fuzz.mjs` 默认 seeds=200，**exit 0**。最终总数 **2395＝2293 绿＋80 T＋22 finding**。分类器 `tests/w06-results-ledger.mjs` 只匹配明确机制，未知失败直接抛错，不把其他异常笼统归 T；还检查主键唯一、fuzz crash 列表为空。

| duality API | 绿 | T | finding |
|---|---:|---:|---:|
| openai-completions | 81 | 0 | 0 |
| openai-responses | 68 | 1 | 9（既有 O18） |
| azure-openai-responses | 69 | 0 | 9（既有 O18） |
| openai-codex-responses | 0 | 78 | 0 |
| anthropic-messages | 77 | 0 | 2 |
| google-generative-ai | 80 | 0 | 0 |
| google-vertex | 80 | 0 | 0 |
| bedrock-converse-stream | 81 | 0 | 0 |
| mistral-conversations | 76 | 1 | 2 |
| pi-messages | 81 | 0 | 0 |
| **duality** | **693** | **80** | **22** |
| **fuzz 四协议（各400）** | **1600** | **0** | **0** |

“绿”只证明本向量的冻结投影×oracle×真实执行一致，不证明 wire 上已发送但被当前定义登记为 mock/model 投影的字段有完整 fidelity。

### T：证实的外部边界

1. **Codex zstd，77 案**：既有 63＋新增 14。capture=0，SDK 报 `Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1`。冻结 atlas A04.01/B3；锁定 `api/openai-codex-responses.ts:208–231,377–385`；mock `src/mounts/routing.rs:16–22` 的 String extractor 先于 decode。未改压缩/transport，不声称后面的字段已验。
2. **Node header ByteString，3 案**：Responses/Codex/Mistral 的 request `w06-unicode-session`，session=`"😀".repeat(70)`。均 capture=0，精确异常 `Cannot convert argument to a ByteString because the character at index 0 has a value of 55357 which is greater than 255.`。源 header carrier 属原字符串或按码点截断的字符串；请求在 HTTP 头构造前置失败，内容无结论。独立 ASCII 70 字符向量已另保留，不能以换 ASCII 输入声称 Unicode 原案成功。

### 既有 finding：O18×18（非 T）

Responses/Azure 各 9 个 corpus reply 的 `reasoning_content` 不是 JSON；已执行 withCapture 后，phase=`oracle` 在冻结的当前域检查抛 `Unexpected token 'r', "reasoning_content" is not valid JSON`。依据 Responses §4 G09/G10（api/openai-responses.md:208–209）与 atlas B2。当前拒绝继续记 finding；未采用未经批准的 summary 降级，也不将整条回复静默剥签名后判绿。18 个完整主键、阶段、diff 在最终 JSON 中逐条保留。

## 新 finding 清单（3 根因 / 4 实例，均未修）

### W06-F1：Anthropic unsupported 终态文案与冻结期待不同（2）

- 定义：`api/anthropic-messages.md:159` C16，unsupported 三终态经 refusal→error，空/缺失拒绝文案默认；source error 文案在所定义拒绝路径内保留。按此固定期待，不依 actual 改写。
- `anthropic-messages/reply/w06-r-aborted`：source=`aborted,errorMessage="cancelled"`；expected=`error,"cancelled",rawStopReason="refusal"`；actual=`error,"unsupported stop reason for anthropic-messages: Aborted",rawStopReason="refusal"`。
- `anthropic-messages/reply/w06-r-deferred`：source=`deferred`、无 errorMessage；expected=`The model refused to complete the request`；actual=`unsupported stop reason for anthropic-messages: Deferred`。
- 期待冻结后只读定位：`src/api/anthropic_messages/encode.rs:111–114` 对 other 使用固定 unsupported 文案，再由 `:53–63` 填 refusal explanation；锁定 parser 按 `api/anthropic-messages.ts:851–858` 读取解释。不是 transport；确有已解析内容与终态。
- 按冻结纪律暂停 oracle 修改并通过 live channel 待裁决；监督方批准**仅继续最终验证与报告、保留两 FAIL，不改定义、不反向改期待**。归定义/当前 encoder 行为不一致待裁决；W-07 只能在后续批准后修，本文不预裁定义。

### W06-F2：Mistral cacheRetention=none 时被自动路由为 Completions（1）

- 定义：`api/mistral.md:65` G31，retention!=none 且 truthy session 才发缓存信号；关闭缓存不应改变所调用 API 身份。请求身份单独与原 `api` 精确核对。
- `mistral-conversations/req/w06-retention-none`：source=普通 user `session`、options `{maxTokens:64,sessionId:"d-s1",cacheRetention:"none"}`；expected capture API=`mistral-conversations`，actual=`openai-completions`；diff 原文 `capture API: expected mistral-conversations, got openai-completions`。
- 已有 capture，非 T。`src/mounts/protocol.rs:116–130` 将 `/chat/completions` 先认成 Completions，`src/mounts/routing.rs:44` 再 select_api；缺缓存信号时实际未选回 Mistral。这是 mount/routing 身份缺口，不通过保持 session/cache 信号隐藏。

### W06-F3：Mistral Q 净化后空 text chunk 丢失（1）

- 定义：`api/mistral.md:66` D14；atlas A09.03-D：先 trim 判原块非空，再 sanitize，故 surrogate-only 原非空块可发 `""`，剩余 chunks 保序不合并。
- `mistral-conversations/req/w06-surrogate-order`：assistant source text blocks=`["\ud800","a\ud800x"]`；expected=`[{type:"text",text:""},{type:"text",text:"ax"}]`；actual 只剩第二块。实际 diff：`$.context.messages[2].content: expected length 2, got 1`。
- 锁定 converter `api/mistral-conversations.ts:844–858` 与冻结规则一致；期待固定后只读定位 `src/api/mistral_conversations/decode_messages.rs:69–75` 的 `!text.is_empty()` 删除已发送空块。此为 mock decoder 差异，不是“Rust 无法表示原 surrogate”的借口（wire 上此时已是合法空串）。不把 canonical 改成删空掩盖。

## 验证、文件边界与复跑证据

- 最终完整日志：`tests/w06-duality-final.log`、`tests/w06-fuzz-final.log`、`tests/w06-unit-final.log`；最终单测 **34/34**，完整 fuzz **1600/1600**，server crash=0。
- 分类与完整 expected/actual：`tests/matrix-ten-results.json`、`tests/w06-fuzz-results.json`、`tests/w06-results-ledger.json`。复算：`node tests/w06-results-ledger.mjs`，exit 0，输出 `tests/w06-ledger.log`；795＋1600 主键均唯一。
- 33 个改动/新增 `.mjs` 均 `node --check` exit 0；最大 194 非空非注释行。完整命令结果、改动清单见 `tests/w06-validation.json`。
- `tests/w06-baseline.json` 的 395 个初始文件 SHA256 对比：`src/**`、其他 docs、锁定 TS 源根 **0 变化**；仅 tests 与指定报告改动。没有 staging 命令；当前目录及祖先无 Git 元数据，无法提供 Git diff/index 认证，不能将此描述为 `git diff --cached` 已通过。
- 未运行 cargo/build；使用现有 server binary，不声称重新构建的源码一致性。binary SHA256=`d75a36b3ab7e831ab34b79fe139322921b57a2db482a5cd3992a02efb51c8986`；各证据 SHA256 及字节数见 `tests/w06-artifact-hashes.json`。
- 启动阻塞：扩展矩阵第一次因 `Address already in use` 未进入测试；等待 30 秒后完整重跑，日志 `w06-duality-expanded.log` / `w06-duality-expanded-retry.log`。这次启动阻塞不虚增为协议 T 实例。

## 验证边界与后续

本轮完成的是现有 native/default harness 域 oracle 修正、独立推导、反例扩展和三类记账；**不是所有 126 主规则的每个配置分支都已实现/验证的通用 oracle**。尤其 mid-conversation/native dynamic tools、grammar/custom、OAuth/managed effort、Simple 上下文预算、reasoning 模型全部模板/采样覆盖、任意 onPayload、一般畸形 SSE/修复流、Codex WS/tier、Vertex ADC 未在本次矩阵穷尽；目前 canonical 对其中若干分支仍仅建模默认路径。静态规则 inventory 不冒充动态/形式化全覆盖。若“全面对齐”要求这些任意 compat/options 输入均有可执行通用 canonical，则此项仍有覆盖/实现缺口，不能用本轮全量脚本跑完宣告无剩余工作。

保留的 Bedrock/Mistral 工具图像、Mistral tools-only、PM sections 顺序/extras、Codex endTurn 等既有 mock/model 投影均不在本轮偷偷修复；绿灯仅是当前冻结投影，不是这些字段完整往返。下一步先独立 reviewer 复核本账本与 F1–F3，裁决定义/实现边界；随后另批 W-07，不能从测试层把这 4 项失败改绿。
