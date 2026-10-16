# OpenAI Responses：组装对照协议

## 1. 概览

锁定客户端：`@earendil-works/pi-ai@1.2.0`（`pi-mono/packages/ai`，本地 checkout，只读），OpenAI SDK `openai@7.19.0`。
传输形态：`POST {baseUrl}/responses`，`Authorization: Bearer <key>`，`Content-Type: application/json`，`Accept: text/event-stream`（SDK `node_modules/openai/resources/responses/responses.js:22`：`this._client.post('/responses', { body, stream: body.stream ?? false, __security: { bearerAuth: true } })`）。
请求体 = `ResponseCreateParamsStreaming`；回复 = Responses SSE 事件流（`data: <json>\n\n` 帧）。

源文件缩写：
- `OR` = `pi-mono/packages/ai/src/api/openai-responses.ts`
- `SH` = `pi-mono/packages/ai/src/api/openai-responses-shared.ts`
- `TM` = `pi-mono/packages/ai/src/api/transform-messages.ts`
- `TR` = `pi-mono/packages/ai/src/utils/transcript.ts`
- `TX` = `pi-mono/packages/ai/src/utils/text.ts`
- `HASH` = `pi-mono/packages/ai/src/utils/hash.ts`

参考配置（canonical 基准模型）：provider `openai`、reasoning=true、compat 默认值（`OR:106-121` `getCompat`）：`supportsDeveloperRole=true`、`supportsMidConvoSystemMessages=false`、`sessionAffinityFormat="openai"`、`supportsLongCacheRetention=true`、`supportsStrictMode=true`、`supportsOpenAIGrammarTools=false`、`supportsAdditionalTools=false`、`supportsToolSearch=false`、`supportsMaxOutputTokens=true`。非默认 compat（proxy/openrouter/xai/copilot）的差异在 §5 列为范围外。

---


方向 Q＝unified→pi convert→wire→mock decode；R＝unified→mock encode→wire→pi parser。E＝精确 JSON 值往返；D＝下述确定性投影；L＝当前映射不发源信息；P＝pi 客户端身份/时钟/费率注入；T＝内容解析前 transport 阻断。wire 已发而 mock 未读记 D 并单列实现缺口；输入契约拒绝没有正常 canonical 值，不是 T，也不增加第六类。无 onPayload 改写、默认参考 compat 是以下规则前提；非默认分支按源码条件，不由 fixtures 常量代替。


- **KeyID**：`Authorization: Bearer <apiKey>` 头（SDK bearerAuth）。`key_id` = Bearer 令牌原文。调用方自带 `authorization`/`cf-aig-authorization` 头时 pi-ai 以 `"unused"` 兜底建客户端（`OR:63-68`），实际凭证在被覆写的头里——mock 直接取 `Authorization` 头终值。
- **session 信号出现位置**（`sessionId` 选项，`cacheRetention≠"none"` 时才发）：
  - openai 格式（默认）：头 `session_id` 与 `x-client-request-id`，值 = 原始 sessionId（**不截断**），二者相等除非调用方显式覆写（`OR:278-285`；覆写顺序：options.headers 最后合并，`OR:288-291`）。
  - openrouter 格式：头 `x-session-id`（`OR:278-279`）。
  - body `prompt_cache_key` = sessionId 截 64 码点（`OR:334`；api/openai-prompt-cache.ts:3-8）。
- **解码优先级**：`session_id` 头 → `x-client-request-id` 头 → `x-session-id` 头 → `prompt_cache_key`。头优先于 body：sessionId>64 码点时 body 值已截断，头保留全值。`cacheRetention:"none"` 时三处全无 → `session_signal:None`（OR:334、compat 测试佐证）。

---


## 2. 请求方向字段映射表


### 顶层字段

| wire 字段 | 统一侧 | 证据 |
|---|---|---|
| `model` | `UnifiedRequest.model` | `OR:331` |
| `input` (item 数组) | `TranscriptContext.messages`（逐条见下表） | `OR:332`，`SH:145-355` |
| `stream` | 恒为 `true`，解码忽略 | `OR:333` |
| `store` | 恒为 `false`，解码忽略 | `OR:337` |
| `max_output_tokens` | `options.max_tokens`（≥16 截断后值） | `OR:340-342`（下限 16：`OR:33`） |
| `temperature` | `options.temperature` | `OR:343-346` |
| `tool_choice` | `options.tool_choice`（字符串/对象的JSON值及类型原样保留；src/model/request.rs:26） | `OR:359-361` |
| `reasoning.effort` | `options.reasoning`（逐字） | `OR:363-380` |
| `tools` | 首个 SystemMessage 的 `toolsAdded`（无 system item 时合成空 system） | `OR:352-355`，`SH:360-401` |
| `prompt_cache_key` | session 信号回退源（64 码点截断后） | `OR:334` |
| `service_tier` / `include` / `prompt_cache_retention` / `prompt_cache_options` / 采样参数直写项 | 无统一对应，忽略 | `OR:347-349,373,379,383-386` |

`tools[]` 元素 `{type:"function", name, description, parameters, strict?}` → `Tool{name, description, parameters, constrained_sampling: None}`；`strict` 标志丢弃（见 §4 T4 有损）。`{type:"custom", …}` grammar 工具仅当 `supportsOpenAIGrammarTools` 时出现（参考配置 false）；解码读取 format.syntax/definition，由共用规则重建选中的统一 variant（src/api/grammar_tool.rs:12–31）。

### input item → Message / ContentBlock

pi-ai 只发两类顶形态：无 `type` 的 `{role, content}`（system/developer/user）与带 `type` 的输出 item（assistant 历史/工具结果）。逐条：

| wire item | 统一形态 | 证据 |
|---|---|---|
| `{role:"system"\|"developer", content:string}` | `SystemMessage{content:Text(s), sections:None, toolsAdded:见顶层 tools, toolsRemoved:None}` | `SH:215,221-227`；`TX:15-22` |
| `{role:"user", content:string}` | `UserMessage{content:Text(s)}` | `SH:230-234` |
| `{role:"user", content:[{type:"input_text",text}]}` | `UserMessage{content:Blocks[Text(text)]}` | `SH:236-242` |
| `{role:"user", content:[{type:"input_image", image_url:"data:<mime>;base64,<data>"}]}` | `UserBlock::Image{data,mime_type}`（解析 data URI） | `SH:243-248` |
| `{type:"reasoning", id, summary:[{type:"summary_text",text}], encrypted_content?, content?}` | `ThinkingContent{thinking: summary 各 text 以 "\n\n" join ‖ content 各 text join，thinking_signature: 该 item 的 JSON 序列化}` | 发出：`SH:264-267`；原始生成：`SH:689-692` |
| `{type:"message", role:"assistant", id, status:"completed", content:[{type:"output_text",text,annotations:[]}], phase?}` | `TextContent{text, text_signature: {"v":1,"id":id}[,"phase":phase]}`（byte-canonical，键序 v,id,phase） | 发出：`SH:269-288`；签名生成：`SH:53-57,700-706` |
| `{type:"function_call", id?, call_id, name, arguments(JSON string), namespace?}` | `ToolCall{id: call_id+"\|"+id（id 缺省时仅 call_id）, name, arguments: JSON 解析, namespace, thought_signature:None}` | 发出：`SH:290-325`；id 组装：`SH:489` |
| `{type:"custom_tool_call", id?, call_id, name, input:string, namespace?}` | `ToolCall{arguments: {"input": input}}`（inputProperty 默认 "input"，见 §5） | 发出：`SH:302-317`；解析：`SH:510-521` |
| `{type:"function_call_output"\|"custom_tool_call_output", call_id, output}` | `ToolResultMessage{tool_call_id: 配对 call 的完整 id, tool_name: 配对 call 的 name, content: 见下, is_error:false}` | 发出：`SH:332-350`；id 重写：`TM:73-78` |
| `output: string` | `content=[Text(output)]` | `SH:81-92` |
| `output: [{type:"input_text",text}\|{type:"input_image",image_url}]` | `content=[Text\|Image]` | `SH:94-106` |

配对规则：`function_call_output.call_id` 向前匹配最近一个同 `call_id` 的 `function_call`/`custom_tool_call` item；`tool_call_id` 取该 ToolCall 的完整 id（`call|item`），`tool_name` 取其 `name`。wire 不携带 tool 名与 isError（§4 有损点）。

assistant 分组：连续的 `reasoning`/`message`/`function_call`/`custom_tool_call` item 归并为一个 `AssistantMessage`，其元数据填请求身份：`api="openai-responses"`、`provider="openai"`（参考配置）、`model=body.model`、`usage` 全 0、`stop_reason=Stop`、`timestamp=0`，其余运行时字段（responseId/endTurn/rawStopReason 等）为 None。

---


### 五分类字段核对（Q；条件不能互换）

| 图谱ID / 字段 | 组装与当前重建 / 源码 | 主类 |
|---|---|---|
| A02.01 / Q system/sections/tool history | G1；系统/developer文本发input（SH:213–227）；wire：文本/当前tools存在；重建：sections和原消息边界不重建（src/api/openai_responses/decode.rs:26–45,118–159） | D |
| A02.02 / Q user.text/image/empty | 每字符串转input_text，含空串；数组空则跳过（SH:229–253）；wire：有text/data URI；重建：user Blocks保序（src/api/openai_responses/decode.rs:26–45） | D |
| A02.03 / Q thinking/thinkingSignature | 有签名直接JSON.parse并原样发item；无签名不发；不会从block.thinking合成历史item（SH:263–268）；wire：只有签名item内信息；重建：thinking=summary或content；签名=原item JSON（src/api/openai_responses/decode.rs:57–63） | D |
| A02.04 / Q assistant.text/textSignature | 每块独立message；解析v1 id/phase，过长id哈希，缺省msg_pi索引（SH:269–289）；wire：有text/id/phase；重建：textSignature v1；连续助手items合一消息（src/api/openai_responses/decode.rs:47–55,118–142） | D |
| A02.05 / Q toolCall.id/namespace/args | call\|item拆分；跨源规范化；item ID按模型/前缀门控；namespace仅同模型（SH:154–177,290–327）；wire：条件有item ID/ns，args JSON；重建：按wire还原（src/api/openai_responses/decode.rs:65–86） | D |
| A02.06 / Q toolResult.content/id/name | call_id+output；无图join("\n")/空占位；有图保留（SH:81–106,332–347）；wire：无独立name，但配对call有name；重建：从call表恢复fullID/name，图文保留（src/api/openai_responses/decode.rs:89–108,178–190） | D |
| A02.07 / Q toolResult.isError | convert不发送（SH:332–347）；wire：无；重建：固定false（src/api/openai_responses/decode.rs:98–103） | L |
| A02.08 / Q tools/schema/options/session | strict schema；truthy max且支持才max(16,n)，0省略；显式effort或truthy summary回退medium，仅显式经map；sampling末写（SH:360–395; OR:330–386）；wire：schema/strict/options终值；默认头原session优先body截64（OR:277–291）；重建：mock未读strict为实现投影；schema/options终值回读（src/api/openai_responses/decode.rs:144–159） | D |
| A02.17 / Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | G3；本表Q的消息发射分支只发内容，AM effort例外已单列；wire：除明确例外无原记录；重建：默认usage0/stop/None；原值不可恢复（各表Q decoder位置；types.ts:565–635） | L |
| A02.18 / Q 历史timestamp/durationMs | 本表Q convert分支不发时间；TM合成timestamp也不发；wire：无原时间；重建：timestamp=0、duration=None（各表Q decoder位置） | L |
| A02.24 / Q 历史assistant.api/provider/model来源 | G2匹配来源影响降级，但vendor只携带目标请求model；各表Q完整发射分支源引用；wire：无独立历史身份字段；重建：mock填固定api/provider/目标model或空串；不能还原原身份 | L |

## 3. 回复方向字段映射表


规格证据 = `processResponsesStream`（`SH:433-776`）。每帧 = `data: <json>\n\n`。最小合法帧序（mock 采用）：

```
response.created → 每内容块: output_item.added [+delta] → output_item.done → response.completed|response.incomplete|response.failed
```

### 内容块 → item 帧

| 统一块 | 帧 | 证据 |
|---|---|---|
| thinking | added `{type:"reasoning", id, summary:[]}`；一条 `reasoning_summary_text.delta {output_index, delta: thinking}`；done = 签名 item 原样（无签名时合成 `{type:"reasoning", id:"rs_<i>", summary:[{type:"summary_text",text}]}`） | 建 slot：`SH:458-468`；delta：`SH:605-613`；finalize（thinking=summary‖content‖累积，签名=JSON.stringify(item)）：`SH:688-697` |
| text | added `{type:"message", id, role:"assistant", status:"in_progress", content:[]}`；一条 `output_text.delta {delta:text}`；done `{type:"message", id, role:"assistant", status:"completed", content:[{type:"output_text", text, annotations:[]}], phase?}`。id/phase 解析自 `textSignature`（`{"v":1,"id",phase?}` 或 legacy 裸串），缺省合成 `msg_<i>` | 建 slot：`SH:469-476`；delta：`SH:635-643`；finalize（text=content join，签名=encodeTextSignatureV1）：`SH:698-707` |
| toolCall | added `{type:"function_call", id, call_id, name, arguments:""}`；done `{type:"function_call", id, call_id, name, arguments: JSON.stringify(args), namespace?}`。id 按 `"\|"` 拆 `call_id`/`item_id`；无 `"\|"` 时合成 `item_id = "fc_"+shortHash(call_id)`（解析器恒组 `call_id+"\|"+item.id`，缺 item id 会产出 `\|undefined`） | 建 slot（id 组装）：`SH:485-497`；finalize（arguments 解析、namespace 拷贝）：`SH:710-724` |

`output_index` = 块序号（0 起）。delta 帧可省（done item 携带终值）；thinking 的 delta 用于签名 item 无 summary/content 时保住 thinking 文本（done 以 summary‖content‖累积 覆盖）。

### 终止帧（usage 与 stopReason 只在终止帧）

| 统一字段 | wire | 证据 |
|---|---|---|
| `response_id` | `response.created` 与终止帧的 `response.id`（缺省合成 `resp_mock`） | `SH:601-602,557-559` |
| `usage.input/cacheRead/cacheWrite` | `usage.input_tokens = input+cacheRead+cacheWrite`，`input_tokens_details.{cached_tokens, cache_write_tokens}`（解析侧 `input = input_tokens − cached − cache_write`） | `SH:560-571` |
| `usage.output` / `reasoning` | `output_tokens` / `output_tokens_details.reasoning_tokens` | `SH:571-572` |
| `usage.total_tokens` | `total_tokens` | `SH:573` |
| stopReason `Stop` / `ToolUse` | `response.completed`（`status:"completed"`；解析侧 content 含 toolCall 时 Stop 自动升为 ToolUse） | `SH:743-744,593-595` |
| stopReason `Length` | `response.incomplete`（`status:"incomplete"`, `incomplete_details.reason:"max_output_tokens"`） | `SH:779-806`（mapStopReason） |
| stopReason `Error` | `response.failed`（`status:"failed"`, `error:{code:"server_error", message: errorMessage}`）；解析侧 throw `"<code>: <message>"` → 流包装器置 `stopReason:"error"` | `SH:747-760`，`OR:231-248` |
| `Pending`/`Aborted`/`Deferred` | 当前 encoder 输入契约拒绝；不是协议绝对无容量，也不是 T，aborted 另可由本地 signal 产生 | `SH:779-806` |

usage 的 `cost` 由 pi-ai 按 model 表计价（`SH:575`），mock 不编码。`end_turn` 仅 codex API 处理（openai-codex-responses.ts:776-778），本 API 忽略。

### MockError → 协议错误响应

HTTP 状态 = `MockError.status`，body = `{"error":{"code":<code>,"message":<message>}}`（OpenAI 错误形态）。pi-ai 侧：SDK 对非 2xx 抛 APIError → 流包装器 `errorMessage = "OpenAI (<status>): <JSON body>"`（utils/error-body.ts：body 取 `error` 对象 JSON 序列化）。流中错误载体：`{"type":"error","code","message"}` 帧（`SH:745-746`）或 `response.failed`。

---


### 五分类字段核对（R；条件不能互换）

| 图谱ID / 字段 | 组装与当前重建 / 源码 | 主类 |
|---|---|---|
| A02.09 / R text/thinking/empty blocks | added独立slot；done定稿；空thinking保留（SH:464–484,683–710）；wire：有item与output_index；重建：text=done内容；thinking=summary\|\|content\|\|delta | D |
| A02.10 / R thinkingSignature（reasoning JSON域） | done必须reasoning；签名=JSON.stringify(item)（SH:688–693）；wire：有完整item；重建：同域JSON值可往返；任意opaque原串不等于JSON | D |
| A02.11 / R opaque signature（当前策略） | encoder先JSON.parse/type检查，oracle也拒绝（src/api/openai_responses/encode.rs:16–30; tests/canonical-ores.mjs:199–206）；wire：当前未生成合法thinking帧；重建：18案oracle异常；不是transport，也不是thinking无表达形状；见B-O18 | D |
| A02.12 / R toolCall.id/namespace/args | 无itemID时合成fc_hash；done读namespace与JSON args（src/api/openai_responses/encode.rs:52–67; SH:485–503,710–727）；wire：有；重建：id=call_id+竖线+item.id；namespace/args精确 | D |
| A02.13 / R usage.input/output/read/write/reasoning/total | input_tokens=input+read+write，parser减后max(0)；total取wire（SH:560–575）；wire：有；重建：有效计数域原值；缺reasoning为0 | D |
| A02.14 / R usage.cacheWrite1h/responseModel/tool thoughtSignature/redacted | parser无对应赋值（SH:464–524,552–597,683–744）；wire：本encoder未携带这些独立语义；重建：不存在；reasoning item的encrypted_content不等于redacted布尔 | L |
| A02.15 / R responseId | created/terminal.id（SH:557–559,601–602）；wire：有；重建：原id或encoder缺省resp_mock（src/api/openai_responses/encode.rs:11–13） | D |
| A02.16 / R stopReason/errorMessage | completed/incomplete/failed；tool存在将stop升toolUse；failed前缀server_error（SH:584–595,743–760; src/api/openai_responses/encode.rs:101–112）；wire：有status/error；重建：ToolUse无tool→stop；pending/aborted/deferred当前拒绝；failed不处理成功usage | D |
| A02.19 / R api/provider/model 身份 | 由目标Model初始化，响应不覆盖这些身份；G3（OR:137–152）；wire：不以服务端源身份传回；重建：当前请求身份，不是历史源身份 | P |
| A02.20 / R timestamp/durationMs | 请求初始化Date.now；事件流本地计时（OR:137–152; ES:97–129）；wire：无服务端原时间载体；重建：客户端时间/持续时长 | P |
| A02.21 / R usage.cost | G4各协议calculateCost路径；PM例外不适用；wire：无原成本；重建：目标模型费率计算值 | P |
| A02.22 / R rawStopReason | parser读native原因（SH:584–595,747–755）；wire：有native stop/status，不保证源rawStopReason自由值；重建：status或status.incomplete_details.reason；与统一stopReason分开比较 | D |
| A02.23 / R thinkingLevel/providerThinkingLevel | 初始化及内容/终态读取不赋这些字段（OR:137–152; SH:552–597）；wire：无独立原值；重建：None；PM的providerThinkingLevel有独立事件字段，例外见A10 | L |

## 4. canonical form

**O18 / R 统一签名投影（owner裁决，现行）**：Responses/Azure/Codex：有签名但非type=reasoning的JSON item（含非法JSON/opaque）先转无签名text；空白/redacted删除。合法item保留，原本无签名的thinking仍走rs_i/summary，不用该分支冒充外域签名降级。text按投影后索引生成msg_i与v1 textSignature；原thinkingSignature为L。 统一实现：`src/api/encode_thinking.rs:18–90`；跨源明文规则依据`api/transform-messages.ts:95–116`、`api/openai-responses-shared.ts:179,264–289`、`api/anthropic-messages.ts:1168,1443–1483`、`api/google-generative-ai.ts:374`→`api/google-shared.ts:200,234–266`。这只判目标签名支持域，不做基于reply身份的TM全量转换；历史summary-item降级草案被text规则取代。完整证据/18案复跑见`../o18-resolution.md`与图谱B2。

**Q-COMPOSE（owner 裁决演进）**：本节单轮 canonical 不蕴含全域幂等。固定 M/O，X=Q(C) 时复合期待为 `Q(B(X)) ≡ K(B(X))`；原 `Q(B(X)) ≡ X` 仅记录 rawIdempotent/rawDiffs。请求默认身份触发 TM:95–145 再降级，或发送前清洗所得空块在二轮被过滤，均按本节同一规则合成，不重标身份、不删字段。Q 无值仍记 domain finding，不计通过；Responses 的 OR:277–291 未截断 session header 可在 ByteString 边界被拒绝。统一定义与证据见 ../irreversibility-atlas.md 的 G5、../f4-p1-resolution.md。


定义：`decode(convert(C)) ≡ canonical(C)`。`convert` = `stream()` 请求构造链：`resolveTranscript`（`OR:140`→`SH:146-148`）→ `transformMessages`（`SH:179`）→ item 发射（`SH:219-352`）→ params 装配（`OR:330-386`）。以下 T0–T6 为全部确定性变换；canonical(C) 即"先施加 T0–T6，再按 §2 材化"的结果。

- **T0 折叠前置**：`normalizeContext` 把 `systemPrompt`/`tools` 折入首个 system message（pi-ai StreamFunction 契约）。
- **T1 system 折叠**（默认 compat `supportsMidConvoSystemMessages=false`，`TR:108-118`）：全部 system messages 重放为**一个**首部 system：content = 各 message 文本以 `"\n\n"` join，再接非 null `sections` 值（`TR:73-106`，`TX:15-22`）；`toolsAdded` = `getCurrentTools`（按声明序重放 add/remove，`TR:58-71`）。wire 上至多一个 `{role:"developer",…}` item（`SH:215`，reasoning 模型且 supportsDeveloperRole），文本为空时不发送（`SH:225-227`）。
- **T2 transformMessages**（`TM:64-235`）：
  - content 为 null/undefined 的消息 → `content: []`（`TM:73-75`）。
  - `stopReason ∈ {error, aborted}` 的 assistant 消息整条丢弃（`TM:201-203`）。
  - thinking 块：`redacted` 仅同模型保留（`TM:105-108`）；同模型且带签名保留（`TM:109-110`）；空文本丢弃（`TM:111-112`）；跨模型非空 → 转纯文本块（`TM:113-117`）。
  - text 块：跨模型剥 `textSignature`（`TM:119-125`）。
  - toolCall 块：跨模型（provider/api/model 任一不同）剥 `thoughtSignature`（`TM:130-134`）并规范化 id（`TM:136-141`→`SH:165-177`）：无 `"|"` → `normalizeIdPart(整串)`；有 `"|"` → `normalizeIdPart(callId) + "|" + itemId'`，其中 `itemId'` = 跨源时 `fc_<shortHash(itemId)>`（>64 再截断）、同 provider 不同模型时 `normalizeIdPart(itemId)`，且强制 `fc_` 前缀（`SH:160-163,172-175`）。`normalizeIdPart`：`[^a-zA-Z0-9_-]`→`_`、截 64、去尾部 `_`（`SH:154-158`）。`shortHash` = 双 32 位 imul 哈希 base36（`HASH:2-13`）。
  - 孤儿 toolCall（下一个 assistant/user 或结尾前无结果）→ 合成 `ToolResult{content:[{text:"No result provided"}], isError:true}`（`TM:167-186,224,232`）；system message 夹在 call 与结果之间时延迟到结果之后（`TM:177-186`）。
  - toolResult 的 `toolCallId` 随 toolCall id 映射同步重写（`TM:73-78`）。
- **T3 item 发射**（`SH:219-352`）：
  - assistant → 连续顶层 items：带签名 thinking → `JSON.parse(thinkingSignature)` **原样**回放（`SH:264-267`）；无签名 thinking 丢弃；text → message item，`id` 取签名 id（>64 → `msg_<shortHash(id)>`，`SH:277-280`），无签名回退 `msg_pi_<msgIndex>[_<textBlockIndex>]`（`SH:271-275`）；toolCall → `function_call`（`arguments=JSON.stringify`），item id 仅在 isDifferentModel（同 provider/api、不同 model）或前缀不匹配 `fc_`（function）/`ctc_`（custom）时置空；foreign 经 normalizer 生成的 fc_ item 可保留（`SH:291-306`）；`namespace` 仅同模型回放（`SH:313,324`）。
  - 产出 0 个 item 的 assistant 消息丢弃（`SH:330-331`）；空 content 数组 user 消息丢弃（`SH:250-251`）。
  - toolResult → `function_call_output`/`custom_tool_call_output`，`call_id` = `toolCallId` 的 `"|"` 前段（`SH:333`）；output：纯文本/无图 → 各 text `"\n"` join（`SH:84-92`），无文本无图 → `"(no tool output)"`，有图但不支持视觉 → `"(see attached image)"`，有图且视觉 → `input_text`+`input_image`(data URI) 数组（`SH:94-106`）。
- **T4 tools**：`params.tools = convertResponsesTools(getCurrentTools)` 仅当非空（`OR:352-355`）。参考配置（supportsStrictMode=true，无 grammar）：`{type:"function", name, description, parameters: strict? makeStrictJsonSchema(p) : p, strict: constrainedStrict ?? false}`（`SH:360-401`；strict 变换 = constrained-sampling.ts 的 makeStrictJsonSchema）。
- **T5 options**：`maxTokens` truthy 且 supportsMaxOutputTokens、非 omitUnsupportedFields 时才发 `max_output_tokens = max(maxTokens,16)`；0 省略（`OR:339-342`；streamSimple 恒有 maxTokens，经 `clampMaxTokensToContext`）；`temperature` 直传；`tool_choice` 直传；reasoning 模型：effort=显式 reasoningEffort ?? (truthy reasoningSummary ? "medium" : undefined)；仅显式 effort 经 thinkingLevelMap；有 truthy effort 发 `{effort, summary: reasoningSummary || "auto"}` 和 encrypted include；否则非 Copilot 且 off map !== null 才发 `{effort: off ?? "none"}`（`OR:363-380`）；`samplingParams` 最后 `Object.assign`（`OR:383-386`）——wire 上是终值。
- **T6 文本净化白名单**：system 渲染文本、user 字符串/text、assistant output_text、custom grammar input、tool output 聚合文本在调用点删除未配对 surrogate（`SH:226,233,240,286,314`；`SH:81–108`；`utils/sanitize-unicode.ts:21–24`）。reasoning 签名 item 直接 JSON.parse 后 push，不递归净化 summary/content；工具 name、function arguments 与签名不套普通文本清洗。Rust String 不能表示坏代理并不否定 JS 输入存在该值；后续拒绝不能先在 canonical 里伪清洗成成功。

### canonical 等价的归一化事实（decode 侧输出即 canonical(C)）

1. assistant 消息的 `api/provider/model` 重写为请求身份；`usage` 归零；`stopReason := Stop`；`timestamp := 0`；运行时字段全 None。
2. `thinkingSignature` 与 wire 的 reasoning item JSON **语义相等**（比较时两侧都先 JSON.parse；键序差异：pi-ai 为插入序，Rust 解码为字母序——byte 比较无意义，见 §5）。
3. `thinking` 文本 := 签名 item 的 summary/content 文本；仅由 delta 累积出的 thinking 文本不上 wire（有损）。
4. `textSignature` byte-canonical：`{"v":1,"id":…}` / `{"v":1,"id":…,"phase":…}`。
5. toolCall id：同模型且 item 前缀合法的 `call|item` 保持；foreign 按 T2 规范化后可保留 `call|fc_<hash>`；同 provider/api 不同 model 或前缀不匹配时 item 被 T3 丢弃，仅剩 call 段。
6. toolResult：`is_error := false`（合成结果与真实结果 wire 上不可区分）；`tool_name` 来自配对 call；字符串 output 块合并为单 Text 块。
7. 连续多条 assistant 消息在 wire 上不可分，canonical 合并为一条。
8. system：`sections`/`toolsRemoved` 不上 wire；`toolsAdded := 顶层 tools`（wire 无 tools → None）；无文本有 tools → 合成 `content:Text("")` 的首部 system。
9. function tools：`constrained_sampling := None`；`parameters` := wire 值（T4 strict 变换后的 schema）；`strict` 终值未建模。custom tools：parameters={}，constrainedSampling={type:grammar,variants:{openai_lark或openai_regex:definition}}，只重建已发送变体。

---


### 第 4 节规则索引（G01–G15）

以下规则是当前组合映射，不是候选 encoder 的实现承诺。TS 根及别名见 §1；Rust 路径相对本仓库。

| 缺列 ID / 方向 | 精确 canonical 规则 | 源码依据 |
|---|---|---|
| G01 / Q system | 默认按顺序折 content/sections/tools 快照；content 双换行、section 同名覆盖/null 删除、tools remove→add。空文本不发 system；有 tools 无 system 时 mock 物化空 System。native mid-convo 不套折叠，使用更新框架/动态工具 item，当前 mock 覆盖见 §5。 | SH:184–227；TR:58–119；src/api/openai_responses/decode.rs:141–161 |
| G02 / Q user | 字符串（含空串）→input_text 数组；空数组 user 跳过；调用点 sanitize 删除未配对 surrogate；图片 data URI 保值保序，mock 重建 Blocks，不逆猜原字符串。 | SH:229–253；src/api/openai_responses/decode.rs:165–175 |
| G03 / Q thinking | 有 truthy 签名才 JSON.parse 并直接回放 item；非法 JSON 必须抛错，无 catch；不递归净化 item 的 summary/content；无签名不发。mock thinking 取 summary 双换行，非空优先否则 content，签名取 item JSON；redacted 布尔不发。 | SH:263–268；src/api/openai_responses/decode.rs:56–64 |
| G04 / Q text | v1/legacy id 与 phase 解析；phase 仅 commentary/final_answer；缺 ID 用 msg_pi_消息索引，后续 text 块加块索引；ID 长度>64 UTF-16 单元改 msg_shortHash；text 净化；连续 assistant items 合并，签名重建 v1（键 v,id,phase）。 | SH:53–70,269–289；src/api/openai_responses/decode.rs:118–142 |
| G05 / Q tools ID | sameModel 必须 api/provider/model 三等。只在 cross-model 调 normalizer，并剥 thoughtSignature。允许 provider 集下拆 call/item；foreign api/provider 的 item→fc_shortHash，其他清洗且补 fc_；call 清洗非字母数字_-、截64、去尾_。isDifferentModel＝同provider/api不同model，或 item 前缀不匹配时删 item；foreign fc_ 可保留。namespace 仅三等时保留；结果 ID 同步。 | TM:95–98,129–151；SH:154–177,257–325 |
| G06 / Q result | text 单换行聚合并净化；无文本/图用 (no tool output)，不支持视觉且仅图用 (see attached image)；视觉图放文本后。call_id 取 call 段；mock 向前配对全 ID/name，isError=false；找不到配对拒绝而非成功空名。 | SH:81–108,332–348；src/api/openai_responses/decode.rs:89–108,178–199 |
| G07 / Q schema/options/session | strict 深拷贝：object 所有属性 required、additionalProperties=false；原可选且不接受 null 的属性包 anyOf 加 null，递归 properties/items/标量 anyOf；拒绝非 object 根、tuple、结构化/空 anyOf、非法 required/properties 及 $ref/$defs/definitions/allOf/oneOf/patternProperties/dependentSchemas/dependencies/unevaluatedProperties/propertyNames/contains/prefixItems/not/if/then/else；require 失败抛，prefer 回退。参考 compat strict 默认 false，constrainedSampling 可覆盖。maxTokens truthy 且支持 max 且非 omitUnsupportedFields 才发 max(16,n)，0 省略；Simple 先 context clamp。reasoningEffort 显式 ?? (truthy summary?medium:undefined)，显式 effort 才经 map，summary=value或auto；无 effort 分支非Copilot且off非null才发off或none。sampling model→level→request 合并后最后覆盖；session retention!=none 才发，默认头保留原串、body截64码点，显式头覆盖后头优先。wire strict 已发未读是 D 缺口。 | SH:360–397；api/constrained-sampling.ts:15–143,225–248；OR:277–291,330–386；api/simple-options.ts:18–46 |
| G08 / R content | added 按 output_index 建独立 slot 并保空；done text 为权威；thinking=summary双换行或content双换行或delta，不能套 Q 过滤。textSignature 总封装 v1，legacy 不原样保留。 | SH:464–484,688–710；src/api/openai_responses/encode.rs:76–87 |
| G09 / R signature | 缺签名生成rs_i/summary；合法type=reasoning的item JSON仍保留，终值JSON.stringify(item)、JSON值比较；其他有签名块先走O18的text投影，不再拒绝。 | SH:688–693；src/api/openai_responses/encode.rs:17–30 |
| G10 / R 外域 | owner批准且已实施：外域有签名thinking→无签名text，空白/redacted删；原18案18/18绿。替代未批准summary-item草案；原thinkingSignature为L、文本块类型为D，不宣称无损E。 | SH:688–693；src/api/encode_thinking.rs:32–90；tests/canonical-encode-thinking.mjs:2–23；../irreversibility-atlas.md:B2 |
| G11 / R call | 按首个竖线拆 call/item；无 item 补 fc_shortHash(call)；parser fullID=call_id+竖线+item.id。arguments 按 JSON 值保留，done 可补 namespace；thoughtSignature 不发。 | SH:485–503,710–727；src/api/openai_responses/encode.rs:52–69 |
| G12 / R usage | 非负有效计数域：wire input_tokens=input+read+write；parse input=max(0,wire input-read-write)，output/read/write 原值，reasoning 缺省0且是output子集；total取wire，cost按目标模型费率重算。failed 不走 usage finalize，本 encoder 无此前 usage 故结果0；1h拆分无读取而删除。 | SH:560–595,747–757；src/api/openai_responses/encode.rs:90–109 |
| G13 / R ID | encoder 缺省 resp_mock；created 与 terminal 都带 ID，parser 各自赋回；expected 从源值与缺省规则独立预测，不从 actual 复制。 | src/api/openai_responses/encode.rs:11；SH:557–559,601–604 |
| G14 / R stop/error | stop/toolUse→completed→stop，有 call 再升 toolUse；无 call 的 toolUse→stop；length→incomplete.max_output_tokens。error→failed，code=server_error；源文案 missing→unknown error，显式空串由 parser truthy 回退 no message，最终 server_error: 文案；failed 保留已收内容但不完成 usage。pending/aborted/deferred 当前拒绝，不是协议绝对无容量/T。 | SH:584–595,743–760；src/api/openai_responses/encode.rs:100–112 |
| G15 / R rawStop | rawStopReason 由 status 或 status.reason（如 incomplete.max_output_tokens）生成；failed 为 failed。源 raw 串不发，必须和统一 stop 独立比较。 | SH:584–589,747–755；src/api/openai_responses/encode.rs:100–109 |

### 与现有 tests 的显式对账

| 报告ID / 测试位置 | 当前差异与正确域（实现均未修改） |
|---|---|
| C05 / tests/canonical-ores.mjs:43,75–96 | 简化整ID，吞JSON.parse异常，忽略textSignature/phase/namespace；按G03–G05保留三元模型门控、foreign fc_保留、非法JSON拒绝；W-06候选。 |
| C06 / tests/canonical-ores.mjs:100–108,170 | 总把工具结果转text，实际SH:81–108与decoder支持视觉图；按G06聚合文本再附图，不能定义为图片协议L；W-06候选。 |
| C07 / tests/canonical-ores.mjs:178–195；tests/canonical-family-variants.mjs:37–45 | 根oracle不strict、固定64/d-s1，家族wrapper才strictTools；两层测试域不同，不能外推；G07定义schema、0省略、summary回退与采样覆盖，W-06候选。grammar/动态工具补读另为W-07候选，非协议无载体。 |
| C22 / tests/matrix-lib.mjs:46–54,85–89,106–107 | 从got填ID及ignore total/cost/rawStop不是独立证明；按G12–G15独立预测ID、total/native原因及费率；W-06候选。 |
| C23 / tests/matrix-lib.mjs:110–126 | fill仅补缺省text签名，保legacy，且只stop→toolUse；实际总v1且无call的toolUse→stop（SH:703,590–595）；W-06候选。 |
| C24 / tests/matrix-lib.mjs:104–126 | 保留responseModel/tool thoughtSignature/redacted，但encoder:11–74不发；按本页R能力L清理，不能全局删其他协议支持的签名；W-06候选。 |
| C28 / tests/matrix-lib.mjs:117–120 | 缺文案模板会拼undefined、空串得空后缀；G14分别unknown error/no message，独立预测，不从actual复制；W-06候选。 |

## 5. 不可逆声明与 transport 边界

### Options 槽位镜像补充（本轮裁决）

- toolChoice对象现在按JSON值及类型E（OR:359–361；src/api/openai_responses/decode.rs:111）。custom声明读取flat format.syntax/definition，共用src/api/grammar_tool.rs:12–31恢复已选variant；未发schema/inputProperty/未选variant仍L（SH:366–378；CS:253–284）。
- strict bool不能逆猜prefer/require，不新增strict模型槽；schema保留终值，已发strict未建模仍D。samplingParams最后覆盖根级（OR:383–386；SO:24–33），原map及来源不再携带，已建模字段读终值，未知根键不臆测还原。


本轮已补读对象toolChoice与grammar工具声明；dynamic工具仍是范围外finding。strict wire终值未建模与原prefer/require不可逆严格分开，详见本节补充及../slots-mirror-pi.md。


**支持范围**：§2 全部 item 形态与顶层字段的解码；§3 全部内容块/usage/stopReason/MockError 的编码；openai 默认 compat 参考配置。

**已知限制 / 有损点**（canonical 定义内，非缺陷）：
1. `thinkingSignature`、toolCall `arguments` 等只能语义（JSON 值）比较：键序 pi-ai 插入序 vs Rust 字母序。
2. thinking 文本：仅 delta 累积（无 summary/content）的历史文本不上 wire。
3. `toolResult.isError`、原始 `stopReason`（除 error/aborted 丢弃规则）、`timestamp`、`durationMs`、`usage`、`responseId`、`thinkingLevel` 等 assistant 元数据均不上 wire（canonical 归一）。
4. 合成 "No result provided" 结果与真实结果不可区分（isError 丢失）。
5. 连续 assistant 消息 wire 上合并为一条。
6. tools 原 `constrainedSampling`/strict化前意图不可逆；wire `strict` 标志仍存在但mock未建模（D实现投影），strict变换后的parameters照读，不能将两种损失混称。
7. `custom_tool_call` 解码固定 `inputProperty="input"`（pi-ai 解析器默认回退，`SH:511`）；真实 grammar 场景 property 来自模型 schema，mock 无法从 wire 恢复。encode 侧只产 `function_call` 形态。
8. `tool_choice` 对象形态（如 `{type:"function",name}`）现在按JSON值及类型保留；pi-ai streamSimple的统一类型仍仅auto/none（types.ts:132,369–371）。
9. 未知 item 类型（web_search_call 等）仍解码报错；grammar 自定义工具声明已支持，共用规则拒绝未知syntax（src/api/grammar_tool.rs:18–21）。
10. `reasoning.effort` 经 model `thinkingLevelMap` 映射，解码只能逐字回读（如 "xhigh" 可能原为 "high"）。
11. samplingParams 直写项（top_p 等）、`service_tier`、`include`、`prompt_cache_retention/options` 解码忽略。
12. assistant `stopReason=ToolUse` 但无 toolCall 块时，编码为 completed 后解析侧回读为 Stop。
13. 非默认 compat（mid-convo system、additional_tools/tool_search item、openrouter/xai/copilot 专有头与字段）不在参考范围。

**假设**：
- 参考身份 `provider="openai"`（wire 不携带 provider，assistant 消息元数据按 §2 填充）。
- `Authorization` 头存在且为 Bearer 形态；否则 decode 报错。
- mock 生成的合成 id（`resp_mock`、`rs_<i>`、`msg_<i>`、`fc_<shortHash>`）确定性可复现。
- pi-ai 契约：system prompt 与 tools 位于首部 system message（StreamFunction 注释，types.ts）。


## 6. 覆盖与 fixture 索引

**fixture 来源**（wire 样本均取自 pi-mono/packages/ai/test/，逐条标注于代码）：
- `openai-responses-message-id.test.ts`：`msg_pi_1` 回退 id 场景。
- `openai-responses-foreign-toolcall-id.test.ts`：Copilot 长 id → `fc_1l1qc04z6lycg`（`shortHash(itemId)`，本仓 Rust 移植用 node 实算锚定）。
- `openai-responses-empty-tool-result.test.ts`：`"(no tool output)"`。
- `openai-responses-tool-result-images.test.ts`：`input_text`+`input_image` output 数组、data URI 形态。
- `openai-responses-namespace.test.ts`：function_call/custom_tool_call item 形状、namespace 回放、`call_test|fc_test` id。
- `openai-responses-terminal-event.test.ts`：终止帧 usage 明细、status 映射、最小帧序。
- `openai-responses-compat.test.ts`：session 头/prompt_cache_key/tool_choice/max_output_tokens/reasoning.wire 值。
- `azure-openai-responses-reasoning-replay.test.ts`：reasoning item（summary/encrypted_content）回放形状。

### 测试层收敛：reasoning signature 的支持域

锁定 `openai-responses-shared.ts:265–267` 请求回放直接 `JSON.parse(thinkingSignature)`；`:688–693` 回复最终签名始终 `JSON.stringify(reasoning item)`，thinking 取 `summary || content || accumulatedDelta`。回复编码域为缺省签名（生成 reasoning item）或 `type:"reasoning"` 的 item JSON；跨协议 `reasoning_content` 等 opaque 字符串**不在此域**，没有无损往返保证。`tests/canonical-ores.mjs:canonicalOresThinking` 明确拒绝非 reasoning JSON，不包装/替换语料，不把拒绝改成 pass。

历史 `reply-corpus-kahuwo-2` / `reply-corpus-claude2-2` 的拒绝曾构成候选阶段的失败；现行已采用上文G09/G10的O18确定性text投影，不再把18案标作仍待裁定或仍全部失败。私有原语料不可用时，相关重放明确skip；公开合成和脱敏素材继续执行。usage cache read/write按逆公式独立保留，不与签名支持域混淆。

`usage.cacheWrite1h` 无读取路径（SH:560–575），canonical 删除该拆分字段；Azure/Codex 共享此边界。 新增十协议缓存夹具全部保留源 input=11/output=5/read=13/write=17/1h=7，严格验证各协议声明的投影。
