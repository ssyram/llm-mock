# Azure / Codex / Vertex：组装对照协议

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 1. 概览

权威源码根 `P=<pi-mono>/packages/ai/src`（只读）；`A=api/azure-openai-responses.ts`、`AC=api/azure-openai-config.ts`、`C=api/openai-codex-responses.ts`、`S=api/openai-responses-shared.ts`、`V=api/google-vertex.ts`、`G=api/google-shared.ts`、`T=api/transform-messages.ts`、`TR=utils/transcript.ts`、`TX=utils/text.ts`，均相对 P。`OD/OE=src/api/openai_responses/{decode,encode}.rs`、`GD/GE=src/api/google_generative_ai/{decode,encode}.rs`，其余 `src/`、`tests/` 相对本仓库。`SDK-O=<pi-mono>/node_modules/openai`，`SDK-G=<pi-mono>/node_modules/@google/genai/dist/node/index.mjs` 是补充 transport 证据，不冒充 P 内实现。

方向 Q：unified → pi convert → wire → mock decode；方向 R：unified AssistantMessage → mock encode → wire → pi parser。终态沿用 `../irreversibility-atlas.md:A` 的五分类：**精确往返**（JSON 值，不保证字节/键序）、**确定性变换**（明确规则，允许多对一）、**丢弃**（当前映射 wire 不携带）、**pi 注入**（客户端盖章）、**transport 阻断**（解析前失败）。wire 已携带而 mock 未读，终态记 D（mock 投影到缺省/None）并单列“实现缺口”，不能改称 wire 丢弃；五分类用于合法可组装字段，客户端 convert/encoder 拒绝无合法wire结果，不伪称 transport 阻断或第六终态。以下 E/D/L/P/T 为这五种终态的缩写；具体条件见各行。

| 变体 | wire、路径 | 认证 / KeyID | session 载体 |
|---|---|---|---|
| Azure | JSON POST + Responses SSE。base 优先 options.azureBaseUrl → env BASE_URL → resourceName 生成地址 → model.baseUrl；仅 Azure host 的空路径、`/`、`/openai`、`/openai/v1/responses` 改 `/openai/v1`（AC:37–94）。POST `{base}/responses?api-version={version}`；默认 v1（AC:96–106；SDK-O/azure.js:45,94–101,140–150；resources/responses/responses.js:21–26）。**没有自动 deployment 路径**。 | A:155–170 传字符串 apiKey 给 AzureOpenAI；SDK-O/azure.js:115–121 发 `api-key`。mock 取该头合成 Bearer 并 retag（src/api/azure_openai_responses/decode.rs:14–29,54–61）。 | A:155–170 不主动生成 session header；body.prompt_cache_key 为 sessionId 的前 64 个 Unicode code point（A:202；api/openai-prompt-cache.ts:1–8）。用户自定义 headers 仍可携带 session。 |
| Codex | URL 去尾 `/`；已有 `/codex/responses` 不变，已有 `/codex` 补 `/responses`，否则补 `/codex/responses`；默认 `https://chatgpt.com/backend-api`（C:52,642–654）。auto 优先 WS，开始前 transport 失败才回退 JSON POST SSE（C:295–375）；WS frame `{type:'response.create',...body}`（C:1543）。 | JWT 必须恰三段，`JSON.parse(atob(payload))` 读 `https://api.openai.com/auth.chatgpt_account_id`；最终强制 Bearer 和 chatgpt-account-id（C:1628–1661）。mock KeyID 是 Bearer token，不是 account ID（OD:16,214–216）。 | cacheRetention=none 则无 cacheSessionId；否则截 sessionId 前 64 code point；SSE `session-id`、`x-client-request-id`、prompt_cache_key 同值（C:276–284,1676–1679）。mock 不读 `session-id`，但读 x-client-request-id → body 回退（OD:219–224）。WS 无 session 时生成 uuidv7 request ID（C:283）。 |
| Vertex | `GoogleGenAI({vertexai:true,apiVersion:'v1',…})`，generateContentStream（V:357–397,462–520）；SDK POST `{model}:streamGenerateContent?alt=sse`，config 展开为 systemInstruction/tools/toolConfig/generationConfig（SDK-G:15763–15796）。普通模型映射 publishers/google/models/id；含 `/` 的非完整资源映射 publishers/pub/models/name（SDK-G:3255–3284）。 | 非空非占位 key 走 Express，`x-goog-api-key`；空、`gcp-vertex-credentials`、`<…>` 走 ADC（V:425–459；SDK-G:23771–23813）。mock decoder 接收路由传入 credential，不自行验证 ADC（src/api/google_vertex/decode.rs:51–64；GD:33–43）。 | V:462–520 没有 session/cacheRetention 请求字段；GD:191–211 恒 session=None。project/location 是资源定位，不是 session。 |

Vertex ADC 的 project 优先 option → GOOGLE_CLOUD_PROJECT → GCLOUD_PROJECT；location 优先 option → GOOGLE_CLOUD_LOCATION，缺失即客户端抛错（V:441–459）。host：global 或 API key 无 project → aiplatform.googleapis.com；multi-regional → aiplatform.{location}.rep.googleapis.com；其余 → {location}-aiplatform.googleapis.com（SDK-G:13530–13550）。**global 只改 host，不据此删除 projects/locations**，资源前缀还受 SDK auth/resource scope 控制；见第 5 节。custom baseUrl 空/含 `{location}` 被忽略；有版本段时 apiVersion 置空，并设置 COLLECTION scope（V:407–423）。

以下默认 `onPayload` 未替换 body；三者允许非 undefined hook 返回值替换整个请求（A:69–72；C:279–282；V:104–107），任意重写后的行为不能套用默认 canonical。

## 2. 请求方向字段映射表

### 2.1 三者共同前置处理（不是 wire 字段）

| unified 字段 | convert 处理 + file:line | wire 字段 | decode 重建 | 终态 |
|---|---|---|---|---|
| systemPrompt/tools 简写；中途 system.content/sections/toolsAdded/toolsRemoved | normalizeContext 把简写变初始 system（TR:10–34）；Azure/Codex resolveTranscript 受 supportsMidConvoSystemMessages 控制，默认 false（A:38,185；C:251,546）；Vertex 恒 collapse（V:74；G:192）。折叠 content 以双换行连接，section 同名覆盖、null 删除，工具按名 remove 后 add（TR:58–120） | 一个初始 system 文本及当前工具集，或 Responses compat 开启后的更新文本/动态工具 item | OD:28–34,141–161；GD:53–87，仅重建文本和最终工具声明，不复原更新历史 | D：重放后折叠；section 名/更新边界与已删除工具的原信息 L |
| user/toolResult 图片，非视觉模型 | T:12–57：每组连续图片替换一个固定 text，分别为 `(image omitted: model does not support images)` / `(tool image omitted: model does not support images)`；相邻已有相同占位时不重复 | text 占位 | 只恢复占位 text | D：图片原值 L；视觉模型见下表 |
| assistant 跨 api/provider/model | T:95–145：same-model 必须三者相等；跨模型 text 去签名；非空非 redacted thinking 变 text，空白或跨模型 redacted thinking 删除；tool thoughtSignature 跨模型删除，ID 按 converter 回调规范化 | 变换后的内容 | 按各家族内容重建 | D；签名/被删内容 L。Google 后续签名门槛虽只比 provider/model，不能跳过此三元前置门槛 |
| error/aborted 历史 assistant；孤儿 toolCall；pending 中 system | T:167–232：先关上一批 pending，error/aborted assistant 整条不发；缺结果补 `No result provided`、isError=true；system 暂存至 pending 关闭 | 被删历史无 item；补出的 tool result；延后的 system | 仅按 wire 重建，补结果 timestamp 仍被 decoder 归零 | D：错误历史 L；生成补结果为确定性内容变换（其 Date.now 不跨 wire）；不是服务端真实执行 |
| 所有消息 timestamp、toolResult.durationMs；历史 assistant usage/cost/stopReason/responseId/responseModel/providerThinkingLevel/thinkingLevel/errorMessage/rawStopReason/endTurn/durationMs/diagnostics/deferred；toolResult.details/usage/nestedCalls | S:219–348；G:203–338 不编码这些字段 | 无对应历史元数据 | OD:118–138 / GD:96–103：usage=0、stop=stop、timestamp=0、可选元数据 None；toolResult duration=None | 原信息 L；默认值 D。历史 api/provider/model 用作转换判据，并非按原值发送 |

### 2.2 Azure / Codex 内容与工具（共享 S，但不能宣称 decode 全量等价）

| unified 字段 | convert 处理 + file:line | wire 字段 | decode 重建 | 终态 |
|---|---|---|---|---|
| system.content/sections | S:213–228 用 TX:15–39：首条 content 后接非 null sections，以双换行连接；后续 section 用精确 `Updated system prompt section "name":\n\nvalue` / `Removed system prompt section "name".`；sanitizeSurrogates | Azure：model.reasoning=true 且 supportsDeveloperRole!==false 时 input.role=developer，否则 system；Codex：首条不进 input，顶层 instructions=初始文本或 `You are a helpful assistant.`（C:543–558）；后续兼容更新仍进 input | Azure OD:28–34；Codex 根 decode 后仅填首条空 System 或前插（src/api/openai_codex_responses/decode.rs:18–54） | D；Codex instructions 不经 S 的 surrogate 清洗（C:552–558）。后续 system 在 input 首位且非空时，mock 不再插 instructions，属于实现缺口 |
| user 字符串/text/image；textSignature | S:229–254：文本清洗，字符串变一 input_text，图片 data URI + detail:auto，空数组整条跳过 | input role=user、input_text/input_image | OD:165–175：parts 还原块数组；不恢复原字符串形态；图片 split data URI | D（字符串→块数组、清洗）；视觉图片 data/mime E；textSignature L |
| assistant.text / textSignature | S:269–289：签名可为 `{v:1,id,phase?}`（仅 commentary/final_answer）或 legacy 原串 ID；缺失用 msg_pi_{msgIndex}，后续块加 _{textBlockIndex}；ID >64 UTF-16 code units 改 msg_{shortHash(id)}；清洗文本 | 每块一个 completed message / output_text；id/phase | OD:47–54：每 item 一 text，签名封装 v1；连续 assistant items 汇成一消息（OD:118–138） | D：签名封装/合并边界/清洗；文本在清洗不改变时 E |
| assistant.thinking / thinkingSignature / redacted | S:263–268 仅 thinkingSignature truthy 时 JSON.parse 并直接当 item；**无 catch** | signature JSON 本身，非独立 thinking 文本 | OD:56–64：summary 以双换行连接，非空优先，否则 content；签名为原 item JSON 重序列化；redacted=None | D：文本由签名重建，不保证原 thinking；无签名 thinking L；redacted L。非法 JSON 客户端 convert 拒绝，不是 transport 阻断 |
| toolCall.id、toolResult.toolCallId | S:154–176；仅跨模型由 T 调用回调：字符非 `[a-zA-Z0-9_-]`→`_`、截 64、去尾 `_`；允许 provider 且含 `\|` 则分 call/item，跨 provider/api item 改 fc_{shortHash}，否则清洗并补 fc_。Azure provider 集多 azure（A:17），Codex 集 C:61。S:292–305,333 发 call ID；仅“同provider/api但不同model”或item前缀不匹配时删item ID，跨provider/api经回调生成fc_的item仍可保留 | function/custom call 的 call_id/id；result.call_id | OD:66–99,195–199：有 item 则 call_id\|id，无则 call_id；result 从 call 表配回 ID/name，孤立结果报错 | D：按规则规范化/裁去 item；已规范化同模型 ID 可 E；配对缺失是 decode 拒绝 |
| toolCall.name/arguments/namespace/thoughtSignature | S:290–326：function arguments JSON.stringify；namespace 仅同 provider/api/model 保留；grammar 则 custom_tool_call，参数从指定字符串 property 提取（api/constrained-sampling.ts:158–167,202–218,251–297，见 §4） | function_call(name,arguments,namespace?) / custom_tool_call(input)；无 thoughtSignature | OD:66–87：function JSON.parse；custom 固定 `{input:...}`，而非原 grammar property | 普通 function name/arguments E；namespace 条件 E，否则 L；thoughtSignature L；custom property 重建有实现缺口，不能称通用往返 |
| toolResult.text/image/isError/toolName | S:81–108,332–348：text 用单换行连接再清洗；视觉图片置于文本后；无图时空文本→`(no tool output)`，仅图但无视觉→`(see attached image)`（通常先被 T 换占位） | *_tool_call_output.output 字符串或 input_text/input_image 数组；无 isError/toolName | OD:89–99,178–191：text 在前、图片随后；isError=false；toolName 取匹配 call | D：聚合与重排；isError L；原 toolName L 后由 call 名重建；图片值在视觉分支 E |
| tools name/description/parameters/constrainedSampling | A:184–218 默认 supportsStrictMode=true，tool strict 未指定；C:538–549,575–580 明确 strict:null；S:360–397 grammar→custom，其他 function schema 经 constrained sampling 转换 | tools[].function(name,description,parameters,strict?) 或 custom(format)；动态工具为 additional_tools / tool_search_call/output（S:184–211） | OD:144–163 function保留schema而不恢复strict意图；custom共用grammar decoder恢复选中变体；vendor WireTypedItem仍无动态工具类型（src/api/openai_responses/vendor.rs:95–104） | name/description E；schema D；constrainedSampling 原对象 L（效果已进 schema）；strict 已在 wire，mock 不读是实现投影；grammar声明缺口已补；动态工具仍为实现缺口，不是wire无法表达 |
| 历史 assistant.api/provider/model | A/C 不发送原身份；作为 T/S 条件 | 无原身份字段；顶层 model 是当前模型/部署 | Azure retag api=azure-openai-responses/provider=azure；Codex retag api=openai-codex-responses/provider=openai-codex；model=body.model（各 decode.rs:54–64；OD:124–126） | 原身份 L；重建为 D（mock 默认值，不叫 pi 注入） |

### 2.3 Azure / Codex options 与身份

| unified 字段 | convert 处理 + file:line | wire 字段 | decode 重建 | 终态 |
|---|---|---|---|---|
| 当前 model.id | Azure deployment option → env map → model.id（AC:14–35；A:199）；Codex model.id（C:555） | model | request.model 原值（OD:113–114） | Azure D：部署覆盖后不能推回原 id；Codex E |
| maxTokens | Azure truthy 才发 Math.max(value,16)（A:206–208）；Codex buildRequestBody 无此字段（C:528–600） | Azure max_output_tokens；Codex 无 | OD:107 对应可选值 | Azure D（0→缺省，其余 truthy→max(16,n)）；Codex L |
| temperature | 非 undefined 直传（A:210–212；C:567–569） | temperature | OD:108 | E，除 Azure samplingParams 最后覆盖 |
| toolChoice | Azure 显式才发（A:220–222）；Codex `?? 'auto'`（C:563） | tool_choice 字符串/函数对象 | src/api/openai_responses/decode.rs:111保留JSON值，家族复用 | 字符串/已携带对象E；Codex缺省D→auto；Codex自身options类型无对象槽（C:84） |
| sessionId/cacheRetention | Azure 不以 cacheRetention 控制 prompt key（A:198–204）；Codex none 禁用（C:276–277）；其余前64 code point | prompt_cache_key；Codex 另有两个 session 头 | OD:219–224 按 header 优先再 body | D：长值截断；Codex none 时 session L。Azure cacheRetention 本身 L |
| reasoningEffort/reasoningSummary | Azure effort=显式值或 truthy summary→medium，仅 model.reasoning 分支；显式 effort 经 map，summary=`value \|\| auto`，无 effort 且 off 映射非 null 时 effort=off映射或none（A:224–239）。Codex 显式 effort 的 none 经 map.off（可 null 禁发），其他经 map，summary=`value ?? auto`；无显式且 reasoning/off非null 则 effort=off映射或none（C:583–598） | reasoning.effort/summary；Azure 有 effort 分支 include encrypted_content，Codex 恒 include（C:561） | OD:111 只还原 effort | D：effort 映射；summary/include 在 wire 存在但 mock D→不投影，不能说 wire 丢弃 |
| textVerbosity/serviceTier | Codex verbosity=`value \|\| low`，serviceTier 非 undefined 直传（C:560,571–573）；Azure 不发送 | text.verbosity/service_tier | WireRequest 无槽位（src/api/openai_responses/vendor.rs:65–85） | Azure L；Codex D→mock未投影（实现边界） |
| samplingParams | Azure `resolveSamplingParams` 后 Object.assign 覆盖所有先前同名字段（A:242–245）；Codex 无调用（C:528–600） | Azure 最终 payload 键；Codex 无 | 仅 OD 已声明字段可恢复 | Azure D（最终写入者优先）；Codex L |
| stream/store/parallel_tool_calls/include | Azure 固定 stream:true/store:false（A:198–204）；Codex 另 parallel=true、include encrypted_content（C:554–565） | 同名字段 | decoder 不输出这些执行常量 | D（组装常量，非原输入的可逆字段） |
| apiKey、Azure endpoint/env options；headers/fetch/signal/retry/timeout/transport/metadata/hooks | apiKey/headers/endpoint 见 §1；传输控制 A:74–95、C:283–470；metadata 不在 build body | 认证/URL/客户端行为，不进消息 body | KeyID 按实际头；Azure version/helper 单独提取（azure decode.rs:44–51），非 UnifiedRequest 字段 | credential 作为 KeyID E（实际头）；运行时对象不序列化 L；传输效果不等于消息字段往返 |

### 2.4 Vertex 内容、options 与身份

| unified 字段 | convert 处理 + file:line | wire 字段 | decode 重建 | 终态 |
|---|---|---|---|---|
| system.content/sections/toolsAdded/toolsRemoved | TR:58–120 折叠，TX:15–20 渲染；V:473–490 清洗并设置 systemInstruction、取当前工具 | systemInstruction.parts[].text；tools.functionDeclarations | GD:53–87 文本 parts 双换行拼接，tools 附首条 system | D：更新/sections 历史 L；不是保留每条 system |
| user 字符串/text/image、textSignature | G:203–227 文本清洗、image inlineData；空数组跳过 | contents role=user parts text/inlineData | GD:110–132 单 text→字符串，其他→数组；不恢复 user textSignature | D：单块折叠/清洗；视觉图片 data/mime E；签名 L |
| assistant.text/thinking/签名/redacted | G:230–264 空白且无有效签名跳过；同 provider/model 且签名长度%4=0、匹配标准 base64 才携带；同源 thinking thought:true，否则普通 text（仍受 T 前置）；G:146–160 | role=model；text、thought、thoughtSignature | GD:145–156 恢复文本/思考与签名，redacted=None | D：空块删除/跨模型降级/签名门槛；redacted L；有效签名 E（此点 canonicalGai 漏算，见 §4） |
| toolCall.id/name/arguments/thoughtSignature/namespace | G:165–178,265–283：claude-/gpt-oss-/Gemini major>=3 才发 ID（跨模型清洗非字母数字_-并截64）；args??{}，签名需同源合法 base64 | functionCall{id?,name,args} + thoughtSignature? | GD:135–143：id缺省name，namespace=None，part签名原值 | name/arguments E；id 条件 E，否则 D→name；签名条件 E，否则 L；namespace L |
| toolResult.toolCallId/toolName/isError/text/image | G:284–338：ID 条件同上；text 单换行聚合/清洗；error/output 区分 isError；视觉图 Gemini>=3 或非Gemini进 functionResponse.parts；Gemini<3 另起 user，首 text=`Tool result image:`；连续 functionResponse 合并 user | role=user functionResponse{name,id?,response:{error或output},parts?}；或额外图 user | GD:160–188：id缺省name；空文本→无 text；图接 text 后；error优先；user普通块先输出再 results（GD:110–132） | isError/toolName E；ID D（缺省name）；内容 D（聚合/重排）；旧 Gemini 图片归属变 user 不可逆 |
| tools parameters/constrainedSampling/name/description | V:485–490 `convertTools(currentTools,false,supportsGoogleStrictToolSampling)`；G:380–401 输出 parametersJsonSchema，**不做 OpenAPI schema 清洗**；Gemini>=3 才支持 strict（G:403–435） | tools[].functionDeclarations{name,description,parametersJsonSchema} | GD:53–65 schema优先 parametersJsonSchema，constrainedSampling=None | name/description E；schema D；constrainedSampling 原对象 L（strict 效果留于 schema） |
| maxTokens/temperature | V:471–477 非 undefined 直传 | generationConfig.maxOutputTokens/temperature（SDK 展开 config） | GD:191–195 | E |
| toolChoice | V:474–492；G:408–435 none→NONE、any→ANY；否则有 strict tool→VALIDATED；否则 auto→AUTO、未指定无mode | toolConfig.functionCallingConfig.mode | GD:197–202 小写 | D：none/any/auto，或 strict 强制 validated |
| reasoning / thinking level,budget | V:496–505：enabled且model.reasoning→includeThoughts:true，level优先，否则budget；disabled用G:92–110规则。streamSimple off→disabled，否则离散level或budget（V:313–355） | generationConfig.thinkingConfig{includeThoughts,thinkingLevel或thinkingBudget} | GD:203–211 level→小写；budget=0→off，其余→budget:n | D（预算/等级规则 §4）；includeThoughts 已携带但mock D→未投影 |
| sessionId/cacheRetention/samplingParams/metadata；apiKey/project/location/baseUrl/headers/fetch/signal/hooks/retries | body builder V:462–520 无前四项；资源/认证见 §1；自定义fetch非globalThis.fetch抛错（V:96–97） | 前四项无；其余为资源/认证/运行时控制 | GD:196,42 session=None；request model 取URL末段冒号前（GD:46–50） | 前四项 L；资源名 D（publisher/project/location 不进入 request.model）；credential KeyID 为传入值，不是 ADC 验证；custom fetch 为客户端拒绝 |
| 历史 assistant.api/provider/model | G:230–283 仅作条件，不发送原身份 | 无 | GD:96–103 provider/model空，Vertex retag api（src/api/google_vertex/decode.rs:45–64） | L；默认身份 D，非 pi 注入 |

## 3. 回复方向字段映射表

### 3.1 Azure / Codex（OE → S；Codex 先归一事件）

| AssistantMessage 字段 | encode 事件/字段 + file:line | pi-ai 解析重建 + file:line | 终态 |
|---|---|---|---|
| content 顺序 / text | OE:11–74 每块 added→delta→done，首帧 response.created；text done output_text；非空才发 delta | S:433–551 按 output_index 建slot，S:688–711 done为权威内容；output_text/refusal拼接 | text E（含空块）；消息块边界依output item保留 |
| textSignature | OE:76–87 v1取id/phase，否则整串作id，缺省msg_i | S:701–703 encodeTextSignatureV1（定义S:53–56）；done携带truthy phase即写入，**请求再转换**时才过滤到commentary/final_answer（S:63–70） | D：legacy→v1；无签名→合成；不要把请求的phase过滤规则套到回复解析 |
| thinking/thinkingSignature/redacted | OE:13–30：有签名 JSON.parse且要求type=reasoning；无签名构造rs_i/summary；delta用thinking，done用签名item | S:688–700 文本summary双换行→content→delta回退；signature=JSON.stringify(item)；S:527–550 终态可回填encrypted_content | D：最终thinking受signature优先级；redacted L。外协议opaque签名经O18出口转text或删空白/redacted，原签名L；不是任意签名保留 |
| toolCall.id/name/arguments/namespace/thoughtSignature | OE:52–69 按首个\|分call/item，无item生成fc_{short_hash(id)}；发function_call JSON arguments；namespace只在done item；无thoughtSignature | S:484–499 start用call_id\|id、namespace；S:712–727 done替换arguments、若namespace非undefined则补回并清partialJson | name/arguments/namespace E；id D（缺item补生成）；thoughtSignature L；namespace在done item仍可恢复，不能因added item未发就断言丢失 |
| usage.input/output/cacheRead/cacheWrite/totalTokens/reasoning | OE:90–97 input_tokens=input+read+write，details分别read/write；output_tokens=output；total原值；reasoning有则写 | S:560–576 input=max(0,input_tokens-read-write)，read/write/output/total默认0；reasoning缺省0 | 非负有效计数E；缺失reasoning D→0；reasoning是output子集，不另加 |
| usage.cacheWrite1h / cost | OE:90–97无cacheWrite1h和cost | S:577–583 calculateCost(model,usage)；Codex C:603–640 可用service tier乘cost | cacheWrite1h L；原cost L；新cost P（按当前model费率与tier盖章） |
| stopReason=stop/toolUse/length | OE:100–106 stop/toolUse→completed；length→incomplete reason=max_output_tokens | S:779–809 completed→stop、incomplete.max_output_tokens→length；有toolCall且stop→toolUse（S:590–596） | D：无工具的toolUse→stop；有工具的stop→toolUse；rawStopReason由status及reason生成 |
| stopReason=error / errorMessage | OE:107–111 response.failed/server_error，message默认unknown error；终帧不带usage | Azure S:749–758 组code/message并抛错，A:110–123加provider前缀；Codex C:766–772先抛CodexApiError，C:486–493格式化 | D：错误文案非任意原串原样；error终帧不更新usage，客户端保留此前usage（本encoder此前无usage→0） |
| stopReason=aborted/pending/deferred；image | OE:71,112 返回编码错误；assistant TS本身不含image（types.ts:565–567） | 无合法流可解析 | 客户端输入/encoder契约拒绝，**不属于 transport 阻断** |
| responseId | OE:11 缺省resp_mock，created及终态携带 | S:603–604,553–558 赋值 | 有值E；缺值D→resp_mock |
| rawStopReason | OE仅按stopReason构造status/incomplete，不发送原raw | S:585–588 重建status或status.reason | 原字段L；重建D |
| api/provider/model/timestamp/durationMs | OE无这些字段 | A:47–63 / C:253–269：api=当前adapter，provider/model=当前model，timestamp=Date.now；utils/event-stream.ts:115–129 有条件补本地durationMs | 原字段L；客户端身份/时间P（duration条件见源码，不是服务端耗时） |
| responseModel/providerThinkingLevel/thinkingLevel/errorMessage(成功终态) | OE:15–121 无这些成功元数据 | S无对应 | 当前encode映射L |
| Codex endTurn（completed/incomplete） | src/api/openai_codex_responses/encode.rs:1–7调用共享OE:15–76,94–121，Some布尔补response.end_turn，None省略；普通Responses/Azure调用OE:11–13仍不发 | C:775–783读取boolean；C:766–772的failed先抛错不读取 | W-07已实施：成功/长度终态true/false/None精确往返E；error源endTurn仍L，不外推普通Responses/Azure |

Codex 包装层：C:744–789 将 response.done/completed/incomplete 归一为 response.completed，合法status保留、未知status→undefined（C:791–794），boolean end_turn进入output；遇首终态后停止迭代。与Azure共享解析不意味着相同异常文案或service-tier费率。S:760–775 要求terminal event、工具参数已完成；不能仅发 `[DONE]`。

### 3.2 Vertex（GE → V）

| AssistantMessage 字段 | encode 事件/字段 + file:line | pi-ai 解析重建 + file:line | 终态 |
|---|---|---|---|
| text/thinking 与相邻块边界 | GE:9–37,54–78 每块一个candidate.content.parts chunk，thinking thought=true | V:123–181 相邻同类型串接为一个块，仅类型变化/工具调用结束块；text!==undefined含空串 | 文本D（拼接）；同类型边界L |
| textSignature/thinkingSignature/toolCall.thoughtSignature | GE:54–78 作为part.thoughtSignature，不做请求侧base64门槛 | V:165–180 最后非空incoming签名覆盖旧值（G:138–143）；工具V:205–206直接取truthy签名 | 单块非空签名E；合并块D→最后非空；空签名不保留 |
| thinking.redacted / toolCall.namespace | GE:54–78未编码 | V不重建 | L |
| toolCall.id/name/arguments | GE:63–73,101–117仅claude-/gpt-oss-/Gemini>=3发id，name/args直传 | V:184–227 缺ID或重复ID→`${name}_${Date.now()}_${++counter}`；args??{}；仅candidate[0] | name/arguments E；合法唯一已发id E；否则ID P（含时间，不能写成确定字符串canonical） |
| usage.input/output/cacheRead/reasoning/totalTokens | GE:88–98 prompt=input+read；cached仅正；candidates=output.saturating_sub(reasoning??0)；thoughts仅正；total原值 | V:240–258 input=prompt-cached，output=candidates+thoughts，read=cached，reasoning=thoughts\|\|0；total原值 | reasoning<=output且非负时E；否则output D→max(output,reasoning)；缺reasoning D→0 |
| usage.cacheWrite/cacheWrite1h/cost | GE:88–98无这些字段 | V:247 cacheWrite=0；V:258 calculateCost | 源write L（wire未携带）；重建write=0为派生D；1h L；原cost L，新cost P |
| stopReason/rawStopReason/errorMessage | GE:82–85 stop/toolUse→STOP；length→MAX_TOKENS；其他用rawStopReason或OTHER | V:232–237，G:441–475 STOP→stop（有工具→toolUse）、MAX_TOKENS→length、其余已枚举错误→error；未知值抛；V:280–306按provider原因生成文案 | D：原errorMessage L；error/aborted不靠流表示原原因，aborted只由本地signal产生；pending/deferred同样先选raw或OTHER，再按native finishReason映射：raw=STOP/MAX_TOKENS仍可变成功/length；未知值抛错，不能从源stop推断恒error |
| responseId | GE:12–15,27–32 有值仅首chunk（空content时终帧） | V:119 `output.responseId \|\|= chunk.responseId` | 非空值E；空值不保证保留 |
| api/provider/model/timestamp/durationMs | GE不发 | V:77–93盖当前model/adapter/Date.now；event-stream.ts:115–129补duration | 原值L；P |
| responseModel/providerThinkingLevel/thinkingLevel/endTurn | GE:9–98不发；V响应循环无赋值 | 无 | L |
| image / HTTP错误 | GE:75拒绝image；GE:43–51 HTTP JSON error非SSE | V:109 SDK调用异常进V:292–304本地error；实际ADC/HTTP鉴权失败未在线验证 | 编码拒绝不叫T；真实HTTP链路未验证 |

## 4. canonical form 与 tests 对账

**O18 / R 统一签名投影（owner裁决，现行）**：Azure/Codex复用Responses目标域：合法reasoning-item JSON保留；其他有签名thinking明文转text，空白/redacted删除；原本无签名thinking仍走unsigned分支。Vertex复用Google的opaque-native出口，不新增签名丢弃。Codex真实SDK的zstd/WS已在transport-unblock轮解阻，条件与剩余边界见第5节及../transport-unblock.md。 统一实现：`src/api/encode_thinking.rs:18–90`；跨源明文规则依据`api/transform-messages.ts:95–116`、`api/openai-responses-shared.ts:179,264–289`、`api/anthropic-messages.ts:1168,1443–1483`、`api/google-generative-ai.ts:374`→`api/google-shared.ts:200,234–266`。这只判目标签名支持域，不做基于reply身份的TM全量转换；历史summary-item降级草案被text规则取代。完整证据/18案复跑见`../o18-resolution.md`与图谱B2。

canonical 是字段投影后的等价类，**不是恢复丢失信息**。以下规则按 §2/§3 条件组合，不能把 tests 中固定fixture选项外推为协议常量。

**本仓库请求接纳域（本轮用户要求修复）**：锁定客户端的 Codex 顶层 `instructions` 可含孤立 surrogate，并能发出合法 JSON 转义。服务端在解析此字段时删除未配对 UTF-16 surrogate，采用既有 canonical 的文本净化规则；若原非空文本仅含这些字符，净化为空后采用 canonical 的默认 `You are a helpful assistant.`。这是明确有损转换，不声称原字符精确往返。其他字段仍严格解析，不全局替换 JSON 字符串；U+FFFD、合法 surrogate pair、字面反斜杠文本保持不变。HTTP identity/zstd 与 WebSocket 使用同一 Codex 解析入口。历史 final-four 的 400 拒收结果仅描述旧实现，不能当作当前要求已满足。

Responses/Codex/Mistral 的 Unicode session 在锁定客户端构造 HTTP Headers 时因 ByteString 约束拒绝，服务器未收到请求。矩阵须实际断言明确拒绝原因、fetch 调用数为0且无 capture，再单列为 expected-rejection；不得混入成功对偶数，意外成功、不同错误或产生网络调用都计失败。Unicode JSON 正文不受这一请求头限制。

| 规则 | 精确规则与源码 | 对账与裁决 |
|---|---|---|
| Q 系统/工具重放 | TR:58–120；TX:6–39；默认折叠，支持mid-convo时保留后续更新；tools remove/re-add按名覆盖 | tests/canonical-family-variants.mjs:38–39 恒false，仅默认compat适用；不是全compat canonical |
| Q 全消息预处理 | T:12–57 图片占位；T:95–145跨模型；T:167–232删error/aborted、补No result provided、延后system | tests/canonical-ores.mjs:43 / canonical-gai.mjs:27复用T，基础行为一致，但ID回调简化，不能覆盖真实provider条件 |
| Q Unicode | utils/sanitize-unicode.ts:21–24 删除未配对surrogate；适用S/G调用该函数的文本；Codex客户端instructions仍不清洗（C:552–558），但本轮服务端在该字段接纳时采用同一净化规则，见上文 | canonical-ores.mjs:52–61,86,102；canonical-gai.mjs:35–37,48–56,65未调用清洗；**tests漏规则，源码正确** |
| Q Responses ID/签名 | S:154–176,269–326：拆call/item、同源条件、fc_/ctc_前缀；text签名取v1/legacy，超长短hash；S:263–268非法thinking签名直接抛 | canonical-ores.mjs:43只规范整个ID；:83–86恒造text ID忽略签名；:76–80吞JSON异常；:88–96无namespace。**tests不完整/错误，源码权威** |
| Q Responses tool output | S:81–108 文本先聚合，视觉图随后，空值固定占位；OD:178–191支持parts | canonical-ores.mjs:100–108,170总把输出变text，未覆盖视觉图片。**不能用该canonical断言图片必丢** |
| Q 严格schema | S:361–394默认strict=false；Azure未显式strict，constrainedSampling优先，supportsStrictMode默认true；Codex strict:null（C:549,577）；Vertex parametersJsonSchema且Gemini>=3才strict（G:380–435） | canonical-family-variants.mjs:37–45用constrainedSampling解析，默认工具与显式json_schema用例可对齐；**这不证明Azure/Codex wire strict字段相同**。测试:46–58仅证明Azure constrained prefer schema；grammar/dynamic工具未覆盖 |
| Q Codex 默认/预算/推理 | C:554–598 instructions空→默认、toolChoice缺省auto、无maxTokens；reasoning按§2.3映射；verbosity默认low | canonical-family-variants.mjs:10–20默认instructions/无maxTokens正确，但toolChoice**无条件auto**仅默认fixture成立；canonical-ores.mjs:195固定64/d-s1不是转换算法；Azure部署选项非identity model，不能retag后声称覆盖 |
| Q Google签名 | G:146–160,230–283 base64有效且同源；GD:141,149,155确实恢复三类签名 | canonical-gai.mjs:46–53先模拟发签名，:129–142重建时删签名，tool:59也不发签名。**tests错：当前wire和decoder均支持；不是不可逆** |
| Q Google工具ID/图 | G:165–186,284–338条件ID及两种图归属；GD:135–188条件重建 | canonical-gai.mjs:3–5明确仅mock-gemini模型，:59无ID、:64–78无图片；可用于窄fixture，**不能外推Gemini3/视觉分支** |
| Q options | Azure:206–245；C:554–598；V:477–505；decode见§2 | canonical-family-variants.mjs:18–19及根canonical固定maxTokens/session的结果是harness基线，不是全部options；tools schema的strict效果保留，strict/constrainedSampling对象不恢复 |
| Q Google预算 | V:524–553自定义budget对应level优先；2.5-pro minimal/low/medium/high=128/2048/8192/32768；2.5-flash=128/2048/8192/24576；其他=-1；离散level用G:48–110所列模型与映射，仅minimal/low/medium/high合法 | canonical-gai.mjs:158仅maxTokens，**预算选项未验证**；非零budget decode为budget:n，而非原reasoning等级 |
| Q strict schema/grammar精确域 | api/constrained-sampling.ts:56–143,225–248：strict时clone schema，根object；递归object所有属性required，原可选且不允许null的属性包anyOf加null，additionalProperties=false；不支持的$ref/$defs/definitions/allOf/oneOf等关键词、tuple或非object根会抛。constrained require失败抛，prefer失败→undefined。:202–218 grammar恰一required字符串属性，支持时lark优先regex；:158–167 input必须字符串 | canonical-family-variants.mjs:43–44复用同函数，在该域正确；未覆盖失败/grammar transport不等于支持任意schema |
| R 测试投影缺口 | V:165–180对合并的text与thinking都保留最后非空签名；S:557–558/603–604与V:119按wire取得responseId | tests/matrix-lib.mjs:171–175只更新thinking签名，合并text未更新，**tests漏规则**；:106–107/:164–165从got填expected.responseId不能证明原responseId往返；:85–89删除cost/totalTokens也不能证明它们E（totalTokens实际按wire传，cost按model重算） |
| Q shortHash / sampling优先级 | utils/hash.ts:2–12逐UTF-16 charCode，用两条32位Math.imul累积再混合，返回unsigned h2与h1的base36串连接；精确实现以该函数为准。api/simple-options.ts:24–34：model.samplingParams→有效thinking等级参数→request.samplingParams逐键覆盖，Azure A:243–245最后覆盖具名字段 | canonical-ores.mjs:20–24只模拟ID清洗，不等同provider-aware hash；固定fixture未覆盖sampling覆盖 |
| Q streamSimple预算前置 | A:132–152/C:501–521/V:313–355先buildBaseOptions；api/simple-options.ts:18–21,42–46：maxTokens默认model.maxTokens，再取min(maxTokens,max(1,contextWindow-estimateContextTokens(context).tokens-4096))，contextWindow<=0时仅下限1。Azure再按A:206–208 clamp16；Codex仍不发送预算 | canonical固定64只证明显式fixture选项；不能替代simple入口的预算推导 |
| R Responses canonical | OE:11–112与S:560–596,688–734：思考summary→content→delta；cache read/write从input扣除；成本重算；ID默认；stop与工具覆盖；失败usage不回传 | canonical-encode-thinking.mjs:2–23先做目标域投影；canonical-ores.mjs:199–206仅处理投影后合法item；18案真实锁定SDK复跑全绿（../o18-resolution.md），原opaque仍L |
| R Vertex canonical | GE:54–98；V:123–258：同类型块合并、最后非空签名、缺ID本地时间生成、write=0、成本重算、reasoning超output时output抬高 | tests/matrix-lib.mjs:153起fillGoogle及缓存fixtures必须在这些条件下解读；ID含Date.now只可结构匹配，非固定字节等价 |
| R Codex failed专有分支 | C:766–772在共享parser前抛CodexApiError(message或Codex response failed)，C:486–493格式化；encoder缺文案发unknown error | tests/canonical-responses-reply.mjs已按Codex分支预测：不加server_error前缀、不写rawStopReason=failed、usage仍0，tests/canonical-codex-error.test.mjs含反例。原7项oracle错误由解压后暴露，不改服务端迎合oracle。 |
| Q WS无缓存session | C:276–290无codexSessionId时生成uuidv7，用于WS x-client-request-id；SSE无此生成头 | src decoder按header回读，故session为P而非None；tests/transport-matrix.mjs预测@pi-generated:uuidv7，canonical-request-comparison.mjs独立验证格式与请求时间窗；不回填actual、不全局忽略session。 |
| R Codex service tier定价 | C:603–640：flex倍率0.5；priority对gpt-5.5倍率2.5、其他2；其余1。response tier为default但请求flex/priority时取请求，否则response??request；四项cost乘倍率再求total | tests/matrix-lib.mjs:85–89删除cost，不证明费率与tier已覆盖 |
| R Google finishReason全集 | G:441–475：STOP→stop、MAX_TOKENS→length；BLOCKLIST/PROHIBITED_CONTENT/SPII/SAFETY/IMAGE_SAFETY/IMAGE_PROHIBITED_CONTENT/IMAGE_RECITATION/IMAGE_OTHER/RECITATION/FINISH_REASON_UNSPECIFIED/OTHER/LANGUAGE/MALFORMED_FUNCTION_CALL/UNEXPECTED_TOOL_CALL/TOO_MANY_TOOL_CALLS/NO_IMAGE→error，未知值抛错。V:235–237有工具且stop→toolUse | 固定STOP/MAX_TOKENS/OTHER fixtures不能证明所有provider原因已端到端验证 |
| G37 / R Codex endTurn | W-07起仅Codex wrapper传递源endTurn：completed/incomplete的Some(true/false)→response.end_turn同布尔，None→省略；锁定parser按boolean读取，源字段由L转E。failed在读取前抛错，仍无正常endTurn往返；pending/aborted/deferred拒绝。普通Responses/Azure仍不发、不强迫支持。 | C:766–783；src/api/openai_codex_responses/encode.rs:1–7；OE:11–15,94–121；src/api/openai_codex_responses/encode_tests.rs:9–35；../irreversibility-atlas.md A04.08/F5；历史单测不证明transport；本轮真实SDK SSE/WS的成功、长度、toolUse endTurn矩阵已绿，failed仍无endTurn。 |
| R Vertex write层次 | 源write没有编码是L；V重建常数0为派生D，不用D掩盖源信息未发；1h同为L，read可逆不可删除。 | GE:90–98；V:240–249。 |
| R Google raw保留词条件 | GE:82–86仅非成功源stop使用rawStopReason或OTHER，随后G:441–475按native原因重映射：raw STOP→stop/有工具toolUse，MAX_TOKENS→length，已枚举错误→error，未知抛。不能把源pending/deferred/error等一律定义为error。 | tests/matrix-lib.mjs:182–189未覆盖该raw与源stop不一致条件；W-06候选。 |
| C23/C28 / R Responses oracle | S:688–703总把textSignature封装v1；S:590–595无call的toolUse→stop。OE:109缺文案unknown error，显式空文案由S:749–754回退no message；failed无usage finalize。 | tests/matrix-lib.mjs:110–126保legacy/仅stop升toolUse/错误文案直接拼源串，均为既有W-06候选差异；与根页第4节G08/G14一致。 |
| C24 / R 未发元数据 | OE:11–74不发responseModel/tool thoughtSignature/redacted，GE:54–78不发responseModel/redacted/namespace；按源能力L，不从另一个协议的支持域外推。 | tests/matrix-lib.mjs:104–126,153–190未清理上述字段，公共fill不代做该投影；W-06候选，禁止全局剥所有签名。 |
| R 客户端身份/时间 | A:47–63、C:253–269、V:77–93；utils/event-stream.ts:126–129仅尚未done、无duration且timestamp不早于stream启动时计时 | 不能以删除timestamp后deepEqual的绿灯推断服务端timestamp已往返；这是P，不是E |

与旧版本本文件的明确裁决：

- 旧文“decode/encode 100%复用”只能描述Rust委托关系，不能作语义保证：grammar/dynamic工具、对象toolChoice、Codex instructions首System冲突见§2/§3；namespace回复终块已由S:717恢复，不属缺口；源码与实现接缝优先。
- 旧文“Codex buildRequestBody:528–576、sampling与根同形”范围不完整；实际到C:600，reasoning有none/null分支，且没有Azure最后samplingParams覆盖。旧结论错误。
- 旧文WS beta头的结论需沿完整链复核：C:1684–1699 builder设置后，C:1088–1089确有删除 `OpenAI-Beta`，但utils/headers.ts:3–8用Headers.entries生成小写key，删除大写key不命中。**本轮Node实测仍有openai-beta**。因此不能只看delete语句判为不发送；完整链与实测支持旧文该项结论，其他runtime未验证。
- 旧文“Express/global均无projects/locations”错误：SDK-G:13539–13550中global只选择host，资源前缀由另一步处理（§5）；不再把global与Express等同。
- 旧文“base64url真实JWT一定如何”超出源码验证；C:1632只证明使用atob。mock支持两种字母表（codex decode.rs:75–115）是实现宽容，不证明真实OAuth样本或atob所有输入语义；真实token未验证。
- 旧文请求“29/30 transport blockers”、Vertex“16+15全部覆盖”等不是本轮执行证据。现存snapshot应按§6重新计数，不能把旧执行历史当当前成功结论。

## 5. 不可逆声明与 transport 边界

### Options 槽位镜像补充（本轮裁决）

- Azure复用Responses JSON toolChoice槽和共用grammar decoder（A:220–222；SH:366–378；src/api/azure_openai_responses/decode.rs:14–21）。Codex grammar同样复用，但Codex原生toolChoice类型仅auto/none/required（C:84），不能把共享parser能读对象宣称为Codex会发送对象。
- supportsStrictMode默认true不是工具strict默认true：SH:361–362默认strict=false；Codex以strict:null为default，但constrainedStrict可覆盖（C:575–580；SH:381–394）。strict最终bool/null不恢复原prefer/require；不发明strict槽。Azure samplingParams末写（A:242–245；SO:24–33）只读取wire终值、不逆猜原map；Codex builder C:528–600不使用samplingParams。Vertex同Google，无grammar custom/对象toolChoice槽且不使用samplingParams（V:462–520；G:380–435）。


W-07已在专用wrapper实施Codex completed/incomplete的endTurn补发，§3/G37为批准契约；普通Responses/Azure不变。W-08新增HTTP wire检查发现Codex分支调用根encoder而非wrapper，6个Some(bool)案漏发，记W08-F4（../w08-match.md）。owner裁决后在统一 `src/mounts/protocol.rs:85–90` 出口按Api选择Codex wrapper，公共/命名挂载路由共用，不逐路径补丁；两种Codex路径及挂载复跑见../f4-p1-resolution.md。E契约不变，当时未压缩HTTP不消除真实SDK zstd/WS；本轮已另行实施并通过真实SDK矩阵，见../transport-unblock.md。其余decoder/transport仍候选，签名降级、模型扩容、新stop策略须另批。W-07证据见../w07-implementation.md。

信息论边界：Q中原timestamp/历史usage、Responses toolResult.isError、被折叠system结构、被删error历史、未发送签名等，均有多个原输入映射相同wire；服务端无法从wire反推。R中原成本、服务端身份/时间等同理。有效签名、图片或end_turn既然在wire有槽位，漏读必须标为实现缺口，不得以canonical删除“证明协议有损”（证据逐项见§2/§3）。

| 边界 | 源码事实 | 判定与范围 |
|---|---|---|
| Codex SSE压缩 | C:208–232,377–405压缩成功即content-encoding:zstd；mock现以bytes提取，src/mounts/request_body.rs调用which zstd、std::process管道解压，再UTF-8/JSON | CLI可用且decoded body≤2 MiB时可达；缺CLI/损坏/超限返回协议JSON 400与官网指引，不加zstd crate。真实SDK SSE 88/90绿，原89个压缩blocker解锁88，另1为lone-surrogate内容定义域；见../transport-unblock.md |
| Codex WS与回退 | C:295–375仅开始前transport故障回退，开始后/非transport错误抛出；C:1154–1249缓存连接，C:1439–1477按前缀发送增量 | mock使用同一axum crate的ws feature，src/mounts/codex_websocket.rs升级/处理response.create，共享decode/execute/encode；codex_continuation.rs按连接恢复前次input+output，未知ID报previous_response_not_found。显式WS矩阵、auto复用增量、无凭据命名/专用端口已验证；不宣称云端持久化或全部故障注入覆盖 |
| Codex SSE帧 | C:800–860只按LF-LF切帧，收集data行；忽略[DONE]；无CRLF归一句 | 本mock OE:115–116发LF帧可对齐；不据此承诺任意CRLF流，或仅[DONE]可终止 |
| Vertex ADC / fetch | V:96–101拒绝自定义fetch；marker强制ADC并读project/location/keyFilename；SDK NodeAuth强制cloud-platform scope，GoogleAuth.JWTClient在非默认universe本地自签（google-auth-library/build/src/auth/jwtclient.js:80–129） | 可用临时RSA伪service-account + universe_domain=mock.invalid + custom baseUrl：80/80真实ADC Q/R通过，Bearer仅取KeyID不验签，不需真云凭据。默认googleapis.com universe的授权用户/服务账号token刷新仍需云；缺项目配置仍为客户端前置失败；不是整个ADC永久边界 |
| Vertex global与资源路径 | SDK-G:3255–3284模型资源转换；SDK-G:13611–13677 URL与COLLECTION scope处理；V:357–423对自定义base设COLLECTION | ADC正常资源可为 `/v1/projects/{p}/locations/global/publishers/google/models/{id}:streamGenerateContent`；Express或collection-scope自定义base可没有project前缀。model有完整projects资源时还须按SDK分支，不用一个“global无前缀”规则替代 |
| Azure endpoint/headers | AC:37–66只在列出的Azure host/path归一；A:155–170允许model/options headers覆盖 | 自定义路径不强行改/openai/v1。Azure decode只接受api-key并追加Bearer（azure decode.rs:14–29）；已有Authorization时根header取第一个（OD:210–216），可能优先原Authorization，是实现歧义，不称KeyID无条件等于api-key |
| HTTP错误与流错误 | OE:7–8/GE:43–51普通JSON错误；S:749–758、C:757–772、V:292–304为各自流/SDK异常路径；server src/mounts/routing.rs:115–122决定HTTP状态/encode失败 | HTTP JSON不是SSE terminal。真实HTTP状态、headers、客户端取消决定最终error/aborted；不得仅将unified.errorMessage原样写入后宣称E |

## 6. 覆盖与 fixture 索引

冻结轮为文档核对；W-07已新增src/api/openai_codex_responses/encode_tests.rs验证endTurn的true/false/None与completed/incomplete/failed及普通Responses不发。TS/tests与matrix快照仍不改；本轮结果写../w07-implementation.md。冻结轮源码已逐函数阅读A/AC/C（含请求、SSE、WS、缓存续传、headers/错误辅助）、S、V/G、T、TR、TX及上述Rust decoder/encoder；SDK仅查与路径/认证/序列化直接相关的分支，不声称审计整个SDK。

| 索引 | 覆盖/证据 | 未覆盖或限制 |
|---|---|---|
| src/api/azure_openai_responses/tests.rs | api-key、body.model、路径、retag、session等模块fixture（不覆盖TS部署名映射）；真实转换入口A:35–100 | 不能替代真实SDK请求与所有compat分支 |
| src/api/openai_codex_responses/tests.rs | instructions默认/注入、JWT helper、路由、retag | 直接decoder不是zstd HTTP/WS证据 |
| src/api/google_vertex/tests.rs | project/location路径解析、root委托、api retag | parse_route只取相邻段与末段，不是完整资源认证校验（decode.rs:21–39） |
| tests/canonical-family-variants.mjs:5–47；canonical-ten.test.mjs:33–68 | 默认retag、Codex默认instructions/预算缺省、Azure constrained schema、Vertex完整schema | 条件缺口按§4；单元测试不等于TS convert→HTTP→Rust端到端 |
| tests/canonical-reply-projections.test.mjs:26–33,71–85 | Responses合法签名域，所有协议非零cache fixture仍在 | “fixture存在”不等于Codex已通过transport |
| tests/extended-matrix-cases.mjs；tests/matrix-ten-results.json | corpus与新增请求/回复的已有矩阵快照 | 快照是历史记录，本轮不伪造新矩阵；本轮实跑结果见后续验证记录 |

### 冻结轮历史验证记录

最新transport解阻轮以../transport-unblock.md为准：完整SSE矩阵824/828绿（92红→4红）；另有真实WS/ADC扩展矩阵。以下是原冻结轮历史执行，不代表当前未实现。

- `node --test tests/canonical-ten.test.mjs tests/canonical-reply-projections.test.mjs`：12 passed，0 failed。测试通过不消除§4列出的未覆盖/错误canonical规则。
- `cargo test --lib api::azure_openai_responses::`：4 passed；`cargo test --lib api::openai_codex_responses::`：6 passed；`cargo test --lib api::google_vertex::`：5 passed；共享根 `cargo test --lib api::openai_responses::`：10 passed，`cargo test --lib api::google_generative_ai::`：13 passed；均0 failed。
- 使用Node读取 `tests/matrix-ten-results.json` 按api/dir重新计数（只读历史快照，不是重跑）：Azure Q=29/29、R=25/34（9个reasoning_content非JSON）；Codex Q=0/29、R=0/34（UTF-8 body提取失败，全部T）；Vertex Q=29/29、R=34/34。旧文的更小覆盖计数已过时。
- `node --experimental-strip-types --input-type=module` 导入真实utils/headers.ts并重放C:1088–1089的header删除：输出 `{"openai-beta":"responses_websockets=2026-02-06"}`；验证大小写删除不命中，不代表已建立真实WebSocket连接。
- Python文档静态检查：六节齐全、Markdown表列一致、本地引用路径存在、241个TS/Rust简写引用行号范围有效；通过。初次检查把SDK-G误识别成G，修正检查器边界后通过；不是源码变动。
- Git状态命令返回 `fatal: not a git repository`，项目无可用Git index；未执行stage/commit。未运行新的HTTP矩阵/WS/ADC，仍需独立review gate。
