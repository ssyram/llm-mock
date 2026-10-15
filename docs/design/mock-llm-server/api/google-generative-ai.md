# Google Generative AI：组装对照协议

## 1. 概览

> 锁定参照：pi-mono `packages/ai` @1.2.0（commit `371cc25`），SDK `@google/genai` 2.21.0（pi-mono `node_modules/@google/genai/dist/index.mjs`，下称 `sdk`）。
> 证据缩写：`gai` = `pi-mono/packages/ai/src/api/google-generative-ai.ts`；`shared` = `.../api/google-shared.ts`；`tm` = `.../api/transform-messages.ts`；`tr` = `.../utils/transcript.ts`；`cs` = `.../api/constrained-sampling.ts`。


Q＝unified→pi convert→wire→mock decode；R＝unified→mock encode→wire→pi parser。E＝精确 JSON 值；D＝明确的确定性投影；L＝当前 wire 映射未发源信息；P＝pi 注入（身份、时钟、生成 ID、成本）；T＝内容解析前 transport 失败。wire 已发未读是 D 实现缺口；输入契约拒绝不是 T。默认未改写 onPayload；Gemini 与 Vertex 的独立 parser 条件分别按源码核对，不用 retag 测试冒充全部证明。别名 gai/shared/tm/tr/cs 对应上列文件，编号表兼用 GG/GS/TM/TR/CS 同义别名。

### Wire 传输形态（SDK 层核实）


- 请求：`POST {baseUrl}/v1beta/models/{modelId}:streamGenerateContent?alt=sse`，默认 `baseUrl = https://generativelanguage.googleapis.com/`（`sdk:8150`、`sdk:8014`、`sdk:22040`、`sdk:3217` tModel 给非 `models/`、`tunedModels/` 前缀 id 补 `models/`）。非流式 `:generateContent` 同理（`sdk:21960` 附近）；pi-ai 只走流式（`gai:87` `generateContentStream`）。
- 认证头：`x-goog-api-key: <apiKey>`（`sdk:10064`、`sdk:25688`）。无 Bearer（API key 模式）。
- 请求体 = mldev 形态：`GenerateContentParameters.config` 被 SDK 拆分——`systemInstruction`、`tools`、`toolConfig`、`safetySettings` 提升到请求根，采样参数进 `generationConfig`（`sdk:18119` `generateContentParametersToMldev`、`sdk:17762` `generateContentConfigToMldev`）。`contents[].{role,parts}` 原样（`sdk:17053` `contentToMldev$1`）；part 仅复制已有字段，字段名不变（`sdk:19417` `partToMldev$1`）；`functionCall` 序列化为 `{args,id?,name}`（`sdk:17722`）。`config`（即 `generationConfig`）内 `thinkingConfig` 原样嵌入（`sdk:17900`）。
- 回复：SSE。SDK 以 `\n\n`/`\r\r`/`\r\n\r\n` 分帧，仅取 `data:` 前缀事件，每个 data 载荷是一个完整 `GenerateContentResponse` JSON（`sdk:8371-8460` `processStreamResponse`）。无 `[DONE]` 哨兵；连接关闭即流结束。
- 协议错误：HTTP 4xx/5xx + `application/json` 体；SDK `throwErrorIfNotOK` 解析为 `ApiError{message: JSON.stringify(body), status}`（`sdk:8659`）。另外流读取器对每个原始网络块尝试整体 `JSON.parse`，若得 `{error:{code∈[400,600), status}}` 同样抛 `ApiError`（`sdk:8398-8418`）——即错误 JSON 体即使以 200+SSE 信道送达也会被识别，但规范形态是前者。



- **KeyID**：HTTP 头 `x-goog-api-key`（`sdk:10064,25688`）。缺失时 M1 层 401。
- **session 信号**：无。pi-ai Google 适配器不读取/发送 `sessionId`（`gai` 全文无引用）；URL 查询仅有 `alt=sse`。`RequestInfo.session_signal = None`，`DecodedOptions.session_id = None`。


## 2. 请求方向字段映射表


| wire 字段 | UnifiedRequest / Message / ContentBlock | 证据 |
|---|---|---|
| URL `models/{id}:streamGenerateContent?alt=sse` | `UnifiedRequest.model = id`（剥 `models/`/`tunedModels/` 前缀与 `:action` 后缀） | `gai:383`（params.model = model.id）；`sdk:3217` |
| 根 `systemInstruction.parts[].text`（或字符串） | 领头 `SystemMessage{content: Text(拼接文本), timestamp:0}`；`sections=None` | `gai:387,390`（getSystemMessageText → systemInstruction）；`tr:73-107` collapse；`sdk:3335` tContent 把字符串包成 `{role:"user",parts:[{text}]}` |
| 根 `tools[].functionDeclarations[]` | 同一 SystemMessage 的 `tools_added`：`Tool{name, description, parameters}`，`parameters` 取 `parametersJsonSchema`（缺失时回退 `parameters`，再缺省 `{}`） | `gai:388-390`（getCurrentTools→convertTools(currentTools,false,…)=mldev 用 `parametersJsonSchema`）；`shared:380-402`；`cs:142` |
| `contents[].role="user"` + `parts:[{text}]`（单 text part） | `UserMessage{content: Text(String)}` | `shared:209-216` |
| `user` part `{text}` / `{inlineData:{mimeType,data}}`（多 part 或含图） | `UserMessage{content: Blocks([Text\|Image…])}`，按 part 序 | `shared:217-231` |
| `contents[].role="model"` part `{text, thoughtSignature?}` | assistant `TextContent{text, textSignature}` | `shared:243-253`（convert 侧写入）；流解析读取处 `gai:95-172` |
| `model` part `{thought:true, text, thoughtSignature?}` | `ThinkingContent{thinking, thinkingSignature}` | `shared:263-268`；`shared:128` isThinkingPart（`thought===true` 才是 thinking，`thoughtSignature` 单独不构成） |
| `model` part `{functionCall:{id?, name, args}, thoughtSignature?}` | `ToolCall{id, name, arguments, thoughtSignature}`；`id` 缺失时（`requiresToolCallId=false` 的模型，`shared:165-178`）取 `name` 作 id（见 §4第8条） | `shared:270-284`；`gai:196-214`（流解析：无 id/重复 id 时客户端自造，server 侧 decode 采用确定性 name 回退） |
| `user` part `{functionResponse:{id?, name, response:{output\|error}, parts?:[inlineData]}}` | `ToolResultMessage{tool_call_id: id∥name, tool_name: name, content:[Text(output∥error 文本)]+[Image…], is_error: response 含 error 键, timestamp:0}`；每个 part 一条消息 | `shared:286-341` |
| `generationConfig.temperature` | `options.temperature` | `gai:379-380` |
| `generationConfig.maxOutputTokens` | `options.max_tokens` | `gai:382-383` |
| `generationConfig.thinkingConfig.thinkingLevel`（`MINIMAL/LOW/MEDIUM/HIGH/…`） | `options.reasoning = 小写级别` | `gai:400-401`、`shared:52-65` |
| `generationConfig.thinkingConfig.thinkingBudget = 0` | `options.reasoning = "off"` | `shared:88-97` getDisabledGoogleThinkingConfig（非 Gemini3 走 `{thinkingBudget:0}`） |
| `generationConfig.thinkingConfig.thinkingBudget = N>0` | `options.reasoning = "budget:N"`（十进制字符串；预算值模型相关，见 §4第15条） | `gai:402-403`、`gai:431` getGoogleBudget |
| `toolConfig.functionCallingConfig.mode`（`AUTO/NONE/ANY/VALIDATED`） | `options.tool_choice = 小写 mode`；无 toolConfig → `None` | `gai:404-405`、`shared:410-439` |
| `options.session_id` | 恒 `None`（协议不携带；pi-ai 亦不发送） | `gai` 全文无 sessionId 引用 |
| 时间戳 | 一律 `0`（wire 不携带） | 模型层注释 `src/model/request.rs` |


### 五分类字段核对（Q；条件不能互换）

| 图谱ID / 字段 | 组装与当前重建 / 源码 | 主类 |
|---|---|---|
| A06.01 / Q system/sections/tools | G1；systemInstruction+functionDeclarations；parametersJsonSchema（GG:379–397; GS:359–400）；wire：文本/完整schema快照有；重建：首System，schema完整；不存在所谓Vertex默认剥meta（src/api/google_generative_ai/decode.rs:35–64） | D |
| A06.02 / Q user.text/image/empty | 字符串空串也发text；数组零parts跳过（GS:203–226）；wire：有text/inlineData；重建：单text折为字符串，图文有序（src/api/google_generative_ai/decode.rs:70–106） | D |
| A06.03 / Q text/thinking/tool thoughtSignature | 同provider/model且合法base64才保留；空块有合法签名可保留（GS:146–159,228–281; TM:95–145）；wire：条件有thoughtSignature；重建：三个签名均实际保留（src/api/google_generative_ai/decode.rs:135–156）；旧canonical漏读不是wire损失 | D |
| A06.04 / Q toolCall.id | claude-/gpt-oss-/Gemini≥3发id，否则不发（GS:165–177,270–281）；wire：条件有；重建：无id→name回填；同名调用原id不可区分（src/api/google_generative_ai/decode.rs:135–143） | D |
| A06.05 / Q toolResult.content/isError/id | output/error区分；text join("\n")；新模型嵌套图片、旧Gemini拆user（GS:285–338）；wire：有error与图片，id按模型条件；重建：isError读取error存在性；id缺省name；图像路由按wire恢复（src/api/google_generative_ai/decode.rs:160–188） | D |
| A06.06 / Q options/toolChoice/reasoning/maxTokens | effort→level/budget；strict工具自动VALIDATED；max终值（GG:379–418,431–460; GS:423–435）；wire：有映射后值；重建：只能回读终值，不逆猜请求level | D |
| A06.07 / Q sessionId/redacted | GG buildParams无session；GS普通thinking不携带redacted标志（GG:369–420; GS:254–268）；wire：无；重建：None/不存在 | L |
| A06.14 / Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | G3；本表Q的消息发射分支只发内容，AM effort例外已单列；wire：除明确例外无原记录；重建：默认usage0/stop/None；原值不可恢复（各表Q decoder位置；types.ts:565–635） | L |
| A06.15 / Q 历史timestamp/durationMs | 本表Q convert分支不发时间；TM合成timestamp也不发；wire：无原时间；重建：timestamp=0、duration=None（各表Q decoder位置） | L |
| A06.21 / Q 历史assistant.api/provider/model来源 | G2匹配来源影响降级，但vendor只携带目标请求model；各表Q完整发射分支源引用；wire：无独立历史身份字段；重建：mock填固定api/provider/目标model或空串；不能还原原身份 | L |

## 3. 回复方向字段映射表


规约 = pi-ai 流解析 `gai:95-281` + SDK SSE 解析 `sdk:8371-8460`。帧形式：`data: <GenerateContentResponse JSON>\n\n`。

| AssistantMessage | SSE 事件 | 证据 |
|---|---|---|
| `response_id` | 首个 data 帧根字段 `responseId`（客户端 `output.responseId \|\|= chunk.responseId` 取首个非空） | `gai:110` |
| `TextContent{text, textSignature}` | 一帧：`candidates[0].content.parts[0] = {text, thoughtSignature?}`（`content.role="model"`） | `gai:96-171` |
| `ThinkingContent{thinking, thinkingSignature}` | 一帧：`parts[0] = {thought:true, text:thinking, thoughtSignature?}`（每内容块单帧 = 架构 D4） | `gai:96-134`、`shared:128` |
| `ToolCall{id,name,arguments,thoughtSignature}` | 一帧：`parts[0] = {functionCall:{id?, name, args}, thoughtSignature?}`；`id` 仅当 `requiresToolCallId(message.model)` 时携带，否则省略 | `gai:175-214`；`shared:165` |
| `usage` | 终帧 `usageMetadata`：`promptTokenCount = input + cacheRead`、`cachedContentTokenCount = cacheRead`（>0 才发）、`candidatesTokenCount = max(0, output − (reasoning??0))`、`thoughtsTokenCount = reasoning`（>0 才发）、`totalTokenCount = totalTokens` | `gai:232-241`（逆运算：input=prompt−cached、output=max(source.output,source.reasoning??0)、reasoning缺省0；read不重复加进input） |
| `stop_reason` | 终帧 `candidates[0].finishReason`：`stop`/`toolUse`→`"STOP"`（toolUse 需流内有 functionCall，客户端才映回 toolUse）；`length`→`"MAX_TOKENS"`；`error`/`aborted`/`pending`/`deferred`→`raw_stop_reason`（缺省 `"OTHER"`；必须按 native 原因重映射：raw=STOP→stop/有call则toolUse，MAX_TOKENS→length，已枚举错误→error+派生文案，未知原因抛错；不能从源 stop 推定始终 error） | `gai:224-228,274-281`；`shared:441-472` |
| 帧序 | 内容帧（按 content 块序）→ 终帧（finishReason+usageMetadata）；无内容块时仅终帧 | `gai:95-281` |
| `errorMessage` | 无 wire 字段（SSE 成功流不携带）；需要可见错误时走 MockError 路径 | `gai:285-297` |
| `api/provider/model/thinking_level/timestamp/duration_ms/end_turn` | 不编码（响应 wire 无对应字段） | — |
| `MockError{status, code, message}` | 非 SSE 错误响应：HTTP `status` + `Content-Type: application/json` + 体 `{"error":{"code":<status 数值>,"message":<message>,"status":<code>}}`；客户端把它变成 stopReason=error + errorMessage 的 AssistantMessage | `sdk:8659-8700`；`gai:283-297`（catch → formatProviderError） |

约束：终帧必须携带 finishReason，否则 pi-ai 抛 `"Google stream ended without a finish reason"`（`gai:277`）；流不得在 content 帧之后再发无 parts 的 content 帧（空 text part 会产生空文本块）。


### 五分类字段核对（R；条件不能互换）

| 图谱ID / 字段 | 组装与当前重建 / 源码 | 主类 |
|---|---|---|
| A06.08 / R text/thinking/签名/块边界 | 相邻同类型part合并，保留最后非空签名（GG:110–171; GS:141–143）；wire：有内容和签名，无原块边界事件；重建：合并文本+最后签名；不是全局删签名 | D |
| A06.09 / R 工具name/args/thoughtSignature及唯一已发ID | functionCall+truthy thoughtSignature（GG:175–219）；wire：条件已发唯一ID；重建：唯一ID/name/args/非空签名保持；缺/重复ID另列 | E |
| A06.09-P / R 缺失/重复toolCall.id | GG:195–201；wire：无合法唯一ID；重建：name_Date.now_counter，本地时钟注入；不全局忽略ID | P |
| A06.10 / R usage.input/read/output/reasoning/total | prompt=input+read，candidates=max(0,output−reasoning)，thoughts=reasoning（src/api/google_generative_ai/encode.rs:90–105; GG:232–241）；wire：有；重建：有效output≥reasoning域原值，否则output提升为reasoning；read不加进最终input | D |
| A06.11 / R usage.cacheWrite/cacheWrite1h | parser cacheWrite固定0且无1h读取（GG:232–241）；wire：当前协议子集无写缓存量；重建：0/None | L |
| A06.12 / R responseId/stopReason/errorMessage | responseId首值；finishReason；stop+call升toolUse；无任意成功流errorMessage（GG:110,224–228,272–297; GS:441–472）；wire：有id/finish，无独立任意error文案；重建：错误文案由finishReason派生；toolUse无call→stop | D |
| A06.13 / R responseModel/redacted/namespace | parts循环不赋这些字段（GG:110–219）；wire：当前映射无；重建：不存在；不能从thoughtSignature推redacted | L |
| A06.16 / R api/provider/model 身份 | 由目标Model初始化，响应不覆盖这些身份；G3（GG:68–84）；wire：不以服务端源身份传回；重建：当前请求身份，不是历史源身份 | P |
| A06.17 / R timestamp/durationMs | 请求初始化Date.now；事件流本地计时（GG:68–84; ES:97–129）；wire：无服务端原时间载体；重建：客户端时间/持续时长 | P |
| A06.18 / R usage.cost | G4各协议calculateCost路径；PM例外不适用；wire：无原成本；重建：目标模型费率计算值 | P |
| A06.19 / R rawStopReason | parser读native原因（GG:224–228）；wire：有native stop/status，不保证源rawStopReason自由值；重建：candidate.finishReason原值；与统一stopReason分开比较 | D |
| A06.20 / R thinkingLevel/providerThinkingLevel | 初始化及内容/终态读取不赋这些字段（GG:68–84,110–250）；wire：无独立原值；重建：None；PM的providerThinkingLevel有独立事件字段，例外见A10 | L |

## 4. canonical form

**O18 / R 统一签名投影（owner裁决，现行）**：Google/Vertex接入同一出口但使用Opaque域：R原生thinkingSignature保留，不套Q的base64/同源过滤，也不按reply来源身份强制转text；本页既有R最后非空签名/合并规则不变。 统一实现：`src/api/encode_thinking.rs:18–90`；跨源明文规则依据`api/transform-messages.ts:95–116`、`api/openai-responses-shared.ts:179,264–289`、`api/anthropic-messages.ts:1168,1443–1483`、`api/google-generative-ai.ts:374`→`api/google-shared.ts:200,234–266`。这只判目标签名支持域，不做基于reply身份的TM全量转换；历史summary-item降级草案被text规则取代。完整证据/18案复跑见`../o18-resolution.md`与图谱B2。

**Q-COMPOSE（owner 裁决演进）**：本节单轮 canonical 不蕴含全域幂等。固定 M/O，X=Q(C) 时复合期待为 `Q(B(X)) ≡ K(B(X))`；原 `Q(B(X)) ≡ X` 仅记录 rawIdempotent/rawDiffs。请求默认身份触发 TM:95–145 再降级，或发送前清洗所得空块在二轮被过滤，均按本节同一规则合成，不重标身份、不删字段。Q 无值仍记 domain finding，不计通过；Responses 的 OR:277–291 未截断 session header 可在 ByteString 边界被拒绝。统一定义与证据见 ../irreversibility-atlas.md 的 G5、../f4-p1-resolution.md。


convert 管线 = `collapseSystemMessages` → `withoutInitialSystemMessage` → `transformMessages` → `convertMessages`（`gai:65,384-386`；`shared:191-196`）。canonical(C) 逐项：

1. **system 折叠**：全部 system message 重放为一条领头消息——content 文本以 `\n\n` 连接、sections 按名合并（null 删除）、tools 按名重放（先 delete 后 set）；后续 system message 全部删除（`tr:58-107`）。领头消息 text 经 `getSystemMessageText`（content + 非空 sections 按 `\n\n` 连接，`tr` text.ts:15）成为 wire `systemInstruction` 单 text part；tools 成为 `tools` 参数。text 为空串时不发 `systemInstruction`（`gai:390` falsy 短路）；无 text 且无 tools 时 canonical 中无 system message。
2. **错误/中断助手消息删除**：`stopReason ∈ {error, aborted}` 的 assistant 消息整体丢弃（`tm:201–203`）。
3. **孤儿 toolCall 合成结果**：未获 toolResult 的 toolCall 后插入 `toolResult{content:[{text:"No result provided"}], isError:true}`（`tm:167–185,231–232`）；工具往返中的 system 消息挂起到结果之后（`tm:166-168`）。合成消息 timestamp canonical 置 0。
4. **图像降级**：`model.input` 不含 image 时，user 内容与 toolResult 内容中的 image 以占位文本替换（`"(image omitted: model does not support images)"` / `"(tool image omitted: …)"`，连续图像折叠为一个）（`tm:12,35,44`）。
5. **thinking 块**：同模型保留（含 `thought:true` part），`redacted` 标志不上 wire（丢弃）；空/纯空白 thinking 无签名时丢弃；跨模型非空 thinking → 纯 text part（`tm:104-118`；`shared:263-277`）。
6. **text 块**：空/纯空白且无有效签名时丢弃；`thoughtSignature` 先受 TM 的 api/provider/model 三等门槛，再要求同 provider+model 且 base64 合法（长度 %4==0、字符集 `[A-Za-z0-9+/]+={0,2}`）时保留（`shared:143-162,243-253`）。
7. **toolCall 块**：同模型 id 原样、跨模型先经 normalize（`[^a-zA-Z0-9_-]→"_"`、截 64）（`tm:131-141`；`shared:197-201`）；wire 上 `functionCall.id` 仅当 `requiresToolCallId(model)`（claude-\*、gpt-oss-\*、gemini 主版本 ≥3）才携带，否则整字段丢弃（`shared:165-178,279`）；跨模型 `thoughtSignature` 丢弃。
8. **toolResult 合并/拆分**：连续 toolResult 合并为单个 `role:"user"` turn、每结果一个 `functionResponse` part（`shared:325-333`）；decode 侧逐 part 拆回独立 ToolResultMessage。无 id 模型的 functionResponse 不带 id，decode 以 `name` 回填 `tool_call_id`（同名多次调用不可区分——见 §5 限制）。
9. **toolResult 内容形态**：文本 parts 以 `\n` 连接 → `response.output`（isError → `response.error`）；Gemini≥3 或非 Gemini 图像以 `functionResponse.parts[].inlineData` 嵌套；拼接文本非空时保留原文本，仅无文本而有图片才用 `"(see attached image)"`；Gemini<3 图像拆出为后续合成 user turn `[{text:"Tool result image:"},…inlineData]`（`shared:286-341`，`shared:180-189`）。
10. **空 turn 删除**：user 空块数组、assistant 空块序列产生的空 parts turn 被跳过（`shared:231,282-284`）。
11. **文本清洗**：所有上 wire 文本经 `sanitizeSurrogates`（剔除未配对代理项）（`shared:214,251,308`；utils/sanitize-unicode.ts:21）。
12. **user 内容归一**：单 text part turn → canonical `UserContent::Text`；其余（多 part/含图）→ `Blocks`。
13. **assistant 元数据归零**：wire 不携带 api/provider/model/usage/stopReason/timestamp——canonical assistant 固定 `api="google-generative-ai"`、`provider=""`、`model=""`、usage 全 0、`stopReason=stop`、timestamp 0、其余 optional 字段 None。
14. **工具 schema**：mldev 走 `parametersJsonSchema`，schema 原样透传（不剥离 `$schema` 等 meta 键；Google 和 Vertex 均传 useParameters=false，只有未被这两家采用的 true 分支才剥 meta，`gai:395–397`、`api/google-vertex.ts:485–489`、`shared:380–396`）；仅当工具声明 `constrainedSampling(json_schema)` 且模型为 Gemini≥3 时套用 `makeStrictJsonSchema`（required=全部属性、additionalProperties=false、可空属性包 anyOf）（`cs:127,142,225`；`shared:388-395`）。
15. **options**：仅 `streamSimple` 链路由 `buildBaseOptions` 对 `options.maxTokens ?? model.maxTokens` 执行 `clampMaxTokensToContext`，canonical 取 clamp 后值（`gai:305–321`；`api/simple-options.ts:18–20,35–46`）；原生 `stream` 对非 undefined 的显式 `maxTokens` 原值写入 `maxOutputTokens`，不执行该 context clamp，未指定则省略（`gai:379–384`）；与 G21 一致。`toolChoice` 优先级 none/any > strict 工具的 `VALIDATED` > auto（`shared:423-439`）；reasoning 级别按模型映射为 `thinkingLevel`（Gemini3 系/gemma4/gemini-*-latest）或 `thinkingBudget`（2.5 系预算表，未命中 -1）（`shared:48–110`；`gai:431-460`）。


### 第 4 节规则索引（G16–G26）

| 缺列 ID / 方向 | 精确 canonical 规则 | 源码依据 |
|---|---|---|
| G16 / Q system/tools | system content/sections 按顺序折叠，section 同名覆盖/null 删除、工具 remove→add；空文本不发，tools-only mock 合成 System。Google/Vertex 均 convertTools(...,false)，用 parametersJsonSchema 保根 meta；Gemini major>=3 才支持 strict。strict 算法为 clone、object 全属性 required/additionalProperties=false、原可选非nullable属性包 anyOf 加null；支持/拒绝域按 CS，require 失败抛、prefer 回退，不能说 Vertex 剥 meta。 | GG:379–397；api/google-vertex.ts:485–489；GS:380–406；TR:58–119；CS:15–143,225–248；src/api/google_generative_ai/decode.rs:53–87 |
| G17 / Q user | 字符串含空串发 text，数组零 parts 整条跳过；text 调用点删坏 surrogate；单 text part 解码折串，图文依 parts 保序，inlineData 保 data/mime。 | GS:203–226；src/api/google_generative_ai/decode.rs:70–132；utils/sanitize-unicode.ts:21–24 |
| G18 / Q 三类签名 | 先受 TM 的 api/provider/model 三等门槛，再由 GS 检查 provider/model 与有效标准 base64（非空、长度%4=0、正则 ^[A-Za-z0-9+/]+={0,2}$）。text/thinking/tool thoughtSignature 均可恢复，有有效签名的空 text/thinking 保留；redacted 布尔不发。cross-model thinking/text/工具签名按 TM 删除/降级；oracle 漏读不是协议损失。 | TM:95–145；GS:146–160,230–281；src/api/google_generative_ai/decode.rs:135–156 |
| G19 / Q call ID | claude-/gpt-oss-/Gemini major>=3 才发 ID；cross-model 先清洗非字母数字_-并截64，结果同步；不发 ID 时 mock 按 name 回填，不发明原 ID，也不套 R 的时钟生成规则。 | GS:165–177,197–201,270–281；TM:129–151；src/api/google_generative_ai/decode.rs:135–143 |
| G20 / Q result | text 单换行 join、净化；isError 决定 response.error/output，name 保留、ID 条件同调用。拼接 text 非空则保留，不覆盖混合图文；仅无文本且有图才补 (see attached image)。Gemini>=3/非Gemini图嵌套 functionResponse.parts；Gemini<3图另起 user，首 text=Tool result image:。连续 functionResponse 合一 user，decode 按结果拆回，空文本不建 text。 | GS:285–338；src/api/google_generative_ai/decode.rs:160–188 |
| G21 / Q options | 原生 max/temperature 非undefined直传，Simple 先上下文 clamp；reasoning启用且model.reasoning时 includeThoughts，level优于budget；disabled按模型off规则。Gemini3/gemma4/latest走等级，其余budget，预算表/模型map见GG；decode level小写、budget0→off、其余budget:n，不逆猜原level。toolChoice none/any 优先，其余 strict 工具→VALIDATED，否则auto→AUTO/未指定省略。 | GG:379–418,431–460；GS:48–110,423–435；api/simple-options.ts:18–46；src/api/google_generative_ai/decode.rs:191–211 |
| G22 / R text/thinking | 每part按 text!==undefined（含空串）建块；相邻同型无分隔合并、工具/类型切换结束当前块；text/thinking均取最后 truthy 非空签名，空签名不保留。R 不套 Q base64/同源门槛，也不套Q空白过滤。 | GG:110–171；GS:138–143；src/api/google_generative_ai/encode.rs:54–78 |
| G23 / R ID | 合法唯一已发工具 ID 是 E；缺失/重复是 P：name+Date.now()+递增counter。只对生成分支结构验证时钟/计数/唯一性，禁止忽略全部ID；name/args/非空thoughtSignature独立保留，args缺省{}。 | GG:175–219；api/google-vertex.ts:184–227；src/api/google_generative_ai/encode.rs:63–73,101–117 |
| G24 / R usage | 非负有效域：prompt=input+read，cached仅正；candidates=max(0,output-(reasoning??0))，thoughts仅正；parse input=prompt-cached（read不得再加），output=max(source.output,source.reasoning??0)，reasoning缺省0，total取wire；source write/1h 不发为 L，重建write=0是派生 D；cost按模型计算 P。 | src/api/google_generative_ai/encode.rs:90–98；GG:232–250 |
| G25 / R ID/stop/error | responseId 取首 truthy；STOP→stop，有call升toolUse，无call的toolUse→stop；MAX_TOKENS→length。源error/aborted/pending/deferred仅选择raw或OTHER，不决定最终stop：raw=STOP/MAX_TOKENS同样可变成功/length。已枚举错误→error+Provider stopped with: native原因；未知值抛错，任意源errorMessage不往返。 | GG:110,224–228,272–297；GS:441–475；src/api/google_generative_ai/encode.rs:82–86 |
| G26 / R rawStop | rawStopReason=wire finishReason；源raw仅在非成功encoder分支参与候选，stop/toolUse/length不使用源raw。raw与统一stop分别预测比较，不能因源error而假设wire错误原因。 | GG:224–228；src/api/google_generative_ai/encode.rs:82–86 |

### 与现有 tests 的显式对账

| 报告ID / 测试位置 | 当前差异与正确规则 |
|---|---|
| C09 / tests/canonical-gai.mjs:46–59,129–142 | 模拟发text/thinking签名却重建删除，工具签名也未模拟；G18三类合法同源签名当前wire/decoder均支持，不是协议损失；W-06候选。 |
| C10 / tests/canonical-gai.mjs:3–5,27,59,64–78,158 | identity ID、无图、固定64仅mock-gemini窄fixture，未证明Gemini3/非Gemini视觉分支或预算全集；G19–G21分别覆盖定义，扩oracle/向量为W-06候选，不改正确源映射。 |
| C11 / tests/matrix-lib.mjs:171–175 | fill只更新thinking签名，text留首签名，且空签名也照留；实际text/thinking均最后非空签名（GG:141–165；GS:138–143）；G22与Vertex一致，W-06候选。 |
| C22 / tests/matrix-lib.mjs:46–54,153–190 | 全局ignore ID/total/cost/rawStop或从got取ID不是独立证明；唯一已发ID应E，缺/重复为P结构断言；G23–G26要求独立预测，W-06候选。 |
| C24 / tests/matrix-lib.mjs:153–190 | 保留responseModel/redacted/namespace，但encoder:54–78不发；按R能力L清理，不全局删签名，W-06候选。 |
| C25 / tests/matrix-lib.mjs:182–189 | 只stop升toolUse，未处理无call toolUse回stop；raw保留词与源stop不一致仍按G25重映射（GS:441–475），W-06候选。 |

## 5. 不可逆声明与 transport 边界

任何wire已发未读的options补读只标W-07候选；输入契约拒绝无正常canonical值，内容前HTTP/网络失败才T，已收partial content后的错误不笼统T。


**支持**：system（含 tools 声明）、user（text/image/混合）、assistant（text/thinking/toolCall，thoughtSignature 全路径）、toolResult（text/image、error、Gemini3 嵌套图像与 Gemini<3 合成 turn 两种形态）、options（maxTokens/temperature/toolChoice/reasoning 三态）。SSE 回复：text/thinking/toolCall、usage（含 cacheRead/reasoning 拆分）、stopReason 按原生原因条件映射（非成功源枚举也可能因raw保留词回到成功/length，未知raw抛错）、responseId、MockError。

**有损点（canonical 吸收）**：① 无 id 模型的 toolCall id 以 name 回填，同名多次调用 id 重复；② toolResult 纯图像文本 `"(see attached image)"` / `"Tool result image:"` 标记串不可与真实用户文本区分；③ assistant 元数据（provider/model/usage/stopReason/timestamp）请求侧不上 wire，canonical 归零；④ sections 结构折叠为纯文本后不可恢复；⑤ `redacted` thinking 标志、`end_turn`、cost 无 wire 对应；⑥ stopReason=toolUse 但无 toolCall 块时编码为 STOP，客户端解析回 stop；⑦ usage cost 字段不编码；⑧ sanitizeSurrogates 已剔除的代理字符不可恢复。

**假设**：pi-ai 适配器输出代表协议公共子集（架构 H1/A4）；mock 客户端不用自定义 fetch / baseUrl 重定向（`gai:78-80` 显式拒绝 custom fetch）；`alt=sse` 恒成立（SDK 硬编码，`sdk:22040`）。


## 6. 覆盖与 fixture 索引

**fixture 来源清单**（`pi-mono/packages/ai/test/`）：
- `google-raw-stop-reason.test.ts`：流 chunk 形态（responseId/candidates/finishReason/usageMetadata）、finishReason→stopReason 矩阵（STOP+toolCall→toolUse、MAX_TOKENS→length、SAFETY/MALFORMED_FUNCTION_CALL→error）。
- `google-shared-gemini3-unsigned-tool-call.test.ts`：Gemini3 id 保留（call_1/call_2）、Gemini2.5 无 id、requiresToolCallId 判定表。
- `google-shared-signed-empty-blocks.test.ts`：带签名空 text/thinking part 保留、跨模型丢弃。
- `google-shared-image-tool-result-routing.test.ts`：Gemini2.5 合成图像 turn（5 contents）与 Gemini3 嵌套（3 contents）。
- `google-shared-convert-tools.test.ts`：functionDeclarations/参数 schema 形态（mldev 侧 parametersJsonSchema 不剥 meta 键）。
- `google-thinking-level-map.test.ts` / `google-thinking-disable.test.ts`：thinkingConfig wire 形态（`{includeThoughts?,thinkingLevel}` / `{thinkingBudget:0}` / `{includeThoughts:true,thinkingBudget:N}`）与 maxOutputTokens/temperature。
- 请求 wire 顶层拆分（systemInstruction/tools/toolConfig 在根、generationConfig 嵌套）以 SDK 转换代码 `sdk:18119/17762/17053/19417` 为准（pi-ai 测试捕获的是 SDK 参数层 payload，不含该拆分）。

### 测试层收敛：cache read 的逆公式与固有 write 投影

锁定 `google-generative-ai.ts:232–241`（Vertex 同构 `google-vertex.ts:240–249`）明确赋值 `input = promptTokenCount - cachedContentTokenCount`、`cacheRead = cachedContentTokenCount || 0`、`cacheWrite = 0`。encoder 发 `prompt=input+read`，所以 providerFill 的 input 必须保持源 input，**不得再加 read**；read 本身可逆。cacheWrite 非零却解析为 0 是客户端固有不可逆，不发明写缓存 wire 字段。

`tests/matrix-lib.mjs:fillGoogle` 声明 cacheWrite=0 而保留原 input/read。历史 corpus 的 117+704、2+1289 不能把 expected input 写为 821、1291。新增 `reply-nonzero-cache-usage` 保留非零输入 write=17，Google/Vertex 投影为 0，同时严格断言 input=11、read=13；不是删除非零缓存测试。

`usage.cacheWrite1h` 无读取路径（gai:232–241；Vertex:240–249），canonical 删除该拆分字段；cacheWrite=0 与 cacheRead 可逆的边界保持。 新增十协议缓存夹具全部保留源 input=11/output=5/read=13/write=17/1h=7，严格验证各协议声明的投影。
