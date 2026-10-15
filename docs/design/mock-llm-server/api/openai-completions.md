# openai-completions：组装对照协议

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 1. 概览

### 权威、方向与记号

本次只读权威根为 `<pi-mono>/packages/ai/src`。下文 `OCC` = 该根下 `api/openai-completions.ts`，`TM` = `api/transform-messages.ts`，`TR` = `utils/transcript.ts`，`TXT` = `utils/text.ts`，`CS` = `api/constrained-sampling.ts`，`SO` = `api/simple-options.ts`；其他 TS 路径也相对该根。`src/**`、`tests/**` 相对 mock-with-pi；Rust 栏未带目录的 `decode.rs`、`encode.rs`、`tools.rs`、`vendor.rs`、`tests.rs` 均相对 `src/api/openai_completions/`。行号针对本次实际读取内容，不沿用旧文档的版本号或 SDK 版本断言。

- 请求 Q：`Context → normalizeContext → resolveTranscript/transformMessages → convert/buildParams → wire → mock decode → UnifiedRequest`（`TR:8–33,106–119`；`OCC:310,813–832,1195–1233`；`src/api/openai_completions/decode.rs:8–47`）。
- 回复 R：`AssistantMessage → mock encode → SSE → SDK chunk → pi parser → AssistantMessage`（`src/api/openai_completions/encode.rs:8–50,107–115`；`OCC:558–705`）。mock 的当前实现不是 TS 权威；不一致处在第 4 节裁决。
- 采用 `irreversibility-atlas.md` 的五分类：**精确往返** = JSON 值语义相等；**确定性变换** = 明列的投影规则，绝不意味着原值可恢复；**丢弃** = 此方向 convert/encode 的 wire 不携带原字段；**pi 注入** = 客户端用模型、时钟、费率等盖章；**transport 阻断** = 未到内容解析就失败。wire 已携带但 mock 不读，记为“实现缺口”，不冒充“丢弃”。同一行按子字段/前提分列终态。

### wire、路径、认证与 session

| 项 | 组装与服务端对照 | 证据 |
|---|---|---|
| 请求/路径 | OpenAI SDK `chat.completions.create`，客户端 baseURL 来自 `model.baseUrl`；body 基础为 `{model,messages,stream:true}`。mock 接受 POST `/v1/chat/completions`、`/chat/completions`；不是在 OCC 中硬编码默认公网 URL | `OCC:382–392,789–799,822–832`；`src/mounts/protocol.rs:116–118`；`src/mounts/routing.rs:40–44` |
| 回复 | mock Content-Type `text/event-stream`；每帧 `data: <JSON>\n\n`，最后 `data: [DONE]\n\n`；chunk 的 `choices[0]` 才被解析，usage 可在无 choice 帧中 | `src/mounts/transport.rs:15–21`；`src/api/openai_completions/encode.rs:47–49,101–114`；`OCC:568–579` |
| apiKey/KeyID | pi 优先显式 apiKey；若 options.headers 有非空 authorization 或 cf-aig-authorization，则用占位 key `unused`；否则本地报错。`createClient` 把 key 交给 SDK，options headers 最后覆盖 model/default headers。mock KeyID 仅取大小写精确前缀 `Bearer ` 后字符串，不取 cf-aig-authorization；SDK 如何最终合成 Authorization 的内部实现不在锁定 src 内，未验证 | `OCC:78–90,757–799`；`src/mounts/transport.rs:35–43`；`src/mounts/protocol.rs:96–112` |
| session body | retention 非 none 且 baseUrl 含 `api.openai.com`，或 long 且支持 long retention，才尝试带 `prompt_cache_key`；按 Unicode code point 截前 64 个。long 且支持时 `prompt_cache_retention:"24h"` | `OCC:294–302,826–831`；`api/openai-prompt-cache.ts:1–8` |
| session headers | retention=none 先去掉传给 createClient 的 session；启用 affinity 时 openrouter 发 `x-session-id`，其他格式发 `x-client-request-id`、`x-session-affinity`，openai 再发 `session_id`。mock 优先 body key，再依次 x-session-id / x-session-affinity / x-client-request-id，**不读取 session_id** | `OCC:347–362,775–785`；`src/mounts/protocol.rs:60–65`；`src/api/openai_completions/decode.rs:36` |
| 缺 key | 无 mount spec 且空 KeyID 时 process 返回 401；有 mount spec 时不受该检查限制，不能宣称所有缺头请求必为 401 | `src/server.rs:99–114`；`src/mounts/routing.rs:65–80` |

## 2. 请求方向字段映射表

以下 decode 列描述**当前 Rust 实现**。它补出的 timestamp=0、provider=""、零 usage 只是 mock 物化默认值，不是 pi 注入，也不是原历史值被恢复（`src/api/openai_completions/decode.rs:66–94,157–173,180–188`）。所有规则先经过 TM；同模型条件严格为历史 assistant 的 `provider/api/model` 三项均等于目标模型（`TM:95–99`）。

### Message 与内容块

| unified 字段 | convert 处理 + file:line | wire 字段 | decode 重建 | 终态 |
|---|---|---|---|---|
| `Context.systemPrompt/tools` shorthand | 折入 leading system（`TR:8–33`） | messages instructions + tools | 工具挂首条 system，无 system 则造空 system（`src/api/openai_completions/tools.rs:55–76`） | 确定性变换：来源及 shorthand 形式不可恢复 |
| `SystemMessage.content/sections`，默认无 mid-convo | 重放全部 system：content 非空部分 `\n\n` 拼接，section 同名替换、null 删除；之后渲染 content（text blocks `\n` 连接）及非空 section 值 `\n\n` 拼接（`TR:72–119`；`TXT:6–21`；`OCC:1257–1259`） | 单条非空 instruction content | string 或 text parts 以 `""` 连接；sections=None（`src/api/openai_completions/decode.rs:54–74`） | 确定性变换：只剩渲染后的单串；section 名和历史更新丢弃 |
| `SystemMessage`，mid-convo compat | 首条 `getSystemMessageText`；后续 `renderSystemMessageUpdate`，section 值/删除名用固定框架文本表示（`TXT:28–40`；`OCC:1257–1259`） | role 在 reasoning + supportsDeveloperRole 时 developer，否则 system（`OCC:1233`） | developer alias 成 System；更新文本照录，不反解析（`src/api/openai_completions/vendor.rs:28–36`；`decode.rs:66–74`） | 确定性变换：位置可保留，原 section 结构/role 选择不可恢复 |
| `SystemMessage.toolsAdded/toolsRemoved` | 默认重放 remove 后 add；只有两个 mid-convo 标志均真且无移除、无重复名称，才 anchorsAdditions；初始工具进顶层，后续 additions 独立 system.tools（`TR:55–69,200–237`；`OCC:813–816,1248–1255`） | 顶层 tools / `{role:"system",tools:[…]}` | 顶层 tools 追加至首个 system，内嵌 tools 保留为该 system.toolsAdded（`tools.rs:7–25,55–76`；`decode.rs:70`，均在 `src/api/openai_completions/`） | 确定性变换：默认只剩最终工具集；锚定模式见 canonical 条件 |
| `UserMessage.content:string` | sanitize 后保留，包括空串（`OCC:1261–1266`） | user.content:string | 同串（`src/api/openai_completions/decode.rs:76–94`） | 精确往返（无孤立 surrogate）；否则确定性变换：删除孤立 surrogate |
| user `TextContent[]` | 先滤原长度为 0 的 text，余下 sanitize；数组全空则跳过消息（`OCC:1268–1289`） | `{type:"text",text}` parts | 原 part 顺序；每块不带 textSignature（`src/api/openai_completions/decode.rs:62–64,80–94`） | 精确往返：非空 text 的 text/顺序；丢弃：textSignature、空块；确定性变换：sanitize |
| user `ImageContent` | 支持 image 时用 `data:${mimeType};base64,${data}`；不支持时先替为 `(image omitted: model does not support images)`，连续图片/同文占位只保留一个（`OCC:1276–1282`；`TM:8–51,70–85`） | image_url 或占位 text | data URL 按首个 `;base64,` 拆 mime/data，不验证 base64；非 data URL 报错（`src/api/openai_completions/decode.rs:97–100`） | 精确往返：合法 mime/data + 视觉模型；确定性变换：非视觉降级 |
| assistant 的 error/aborted 历史 | 第二遍直接跳过整条（`TM:195–203`） | 无 | 无 | 丢弃：整条历史；不是回复方向 error 不可表达 |
| assistant thinking 跨模型 | redacted 跨模型删除；未签名空白删除；其他非空 thinking 跨模型转 text，同模型已签名可保留空块（`TM:95–128`） | 后续按 text 或 thinking 分支 | 不再知道跨模型前块类型 | 确定性变换：跨模型非空转 text；丢弃：被筛块/redacted 标记 |
| assistant `TextContent.text` | trim 仅作过滤，不 trim 输出；sanitize 后以 `""` 连接；requiresThinkingAsText 则保留多 text parts（`OCC:1298–1308,1324–1337,1351–1357`） | 默认 content:string；thinking-as-text 为数组 | string 为单 Text；数组用 `\n\n` 拼成单 Text（`src/api/openai_completions/decode.rs:128–130`） | 确定性变换：默认串联/数组双换行；丢弃：textSignature、原块边界与交错 |
| assistant `ThinkingContent.thinking` + 三字段名 signature | 仅非空白 thinking；无 preserved details 才取首个非空块的合法字段名，内容原文 `\n` 连接；opencode-go 将 reasoning 改 reasoning_content（`OCC:1319–1350`） | reasoning / reasoning_content / reasoning_text | 固定优先 reasoning_content → reasoning → reasoning_text，取首个存在的字段（**允许空串**），造一个 Thinking（`src/api/openai_completions/decode.rs:105–126`） | 确定性变换：合并与字段名规范；不是任意 signature fallback |
| assistant details signature / toolCall.thoughtSignature | 首个可解析、非空、全项合法的 thinking signature 数组优先；否则收集 legacy encrypted tool signatures（要求非空 id/data）；有 details 则不另发可见 reasoning（`OCC:123–152,220–246,1312–1321,1339–1350,1383–1385`） | reasoning_details | 任何数组直接序列化作单 Thinking.signature，thinking 取 reasoning 字段或空串；不验证 item（`src/api/openai_completions/decode.rs:115–125`） | 确定性变换：只保留所选 details，原可见 thinking 未携带；丢弃：非所选 signature/legacy 签名位置 |
| assistant opaque/missing thinkingSignature | 同模型普通分支没有合法字段名/合法 details 就不发该 thinking；requiresThinkingAsText 时非空 thinking sanitize 后 `\n\n` 合并并前置 text（`OCC:1323–1350`） | 无，或 content text parts | 无 thinking，或并入单 Text | 丢弃：普通 opaque thinking；确定性变换：thinking-as-text，不是字段 fallback |
| assistant 空消息 / reasoning-only | 初始化 content=null（桥接 compat 为 ""）；最终要求非空 content 或 tool_calls，否则跳过。reasoning/details 本身不满足条件（`OCC:1293–1296,1393–1405`） | 可能整条不存在 | decode 自己也跳过完全空内容（`src/api/openai_completions/decode.rs:154–155`） | 丢弃：无 text/tool_calls 的 assistant，即便其 reasoning 有值 |
| assistant `ToolCall.id` / toolResult.toolCallId | **仅跨模型**调用 normalize 回调并记映射，后续结果跟随；同模型不规范化（`TM:129–151`）；具体 ID 规则见 C5（`OCC:1200–1226`） | tool_calls[].id / tool_call_id | 原样（`src/api/openai_completions/decode.rs:135–148,182`） | 精确往返：未改 ID；确定性变换：跨模型规范化 |
| assistant function ToolCall.name/arguments | JSON.stringify(arguments)（`OCC:1371–1379`） | `{type:"function",function:{name,arguments:JSON串}}` | JSON 必须能解析成 map，否则请求失败（`src/api/openai_completions/decode.rs:132–141,176–177`） | 精确往返：JSON 对象值；丢弃：namespace、非 legacy thoughtSignature（`OCC:1360–1385`） |
| assistant grammar ToolCall.arguments | 仅由当前工具 schema 选出的单个 required string 属性取 input 并 sanitize；其他 arguments 属性不发（`CS:158–168,203–218,286–298`；`OCC:1360–1370`） | `{type:"custom",custom:{name,input}}` | 由已 decode 工具 schema 推断属性，否则 "input"（`src/api/openai_completions/decode.rs:142–151`；`tools.rs:38–53`） | 确定性变换：只剩字符串，decode 使用可得 schema 或回退 input；丢弃：custom wire 不携带原 schema/input 属性名，非 input 属性名不能保证恢复 |
| 未答复 ToolCall | 下个 assistant/user 或末尾补结果；system 暂存后移；内容 `No result provided`、isError=true（`TM:159–235`） | 合成 tool 消息 | 文字保留，但 isError 被置 false | 确定性变换：新增结果及 system 排序；非原历史精确往返 |
| toolResult 文本/空内容 | 连续结果逐条把 text `\n` 拼接；无文本时有图用 `(see attached image)`，否则 `(no tool output)`；sanitize（`OCC:1406–1433`） | role:tool, content:string | 单 Text；外来数组内容才以 `\n\n` 拼接（`src/api/openai_completions/decode.rs:180–188`） | 确定性变换：拼接/占位；丢弃：原块边界、textSignature |
| toolResult 图片 | 视觉模型才收集连续一组结果的图片；整组后一个 user，前缀 `Attached image(s) from tool result:`；桥接 compat 另加 assistant（`OCC:1433–1476`） | 后随 user.image_url；可能桥接 assistant | 不回并结果，照录 user/assistant（`src/api/openai_completions/decode.rs:15–26`） | 确定性变换：移动、合组、前缀；原结果归属丢弃；非视觉模型先由 TM 降级 |
| toolResult.toolName/isError/details/usage/nestedCalls/durationMs | toolName 仅 requiresToolResultName 且非空时上线；其余无 wire 字段（`OCC:1419–1432`；`types.ts:620–635`） | name?；无其余字段 | name 缺省 ""、isError=false、duration=None（`src/api/openai_completions/decode.rs:180–188`） | 精确往返：已发 toolName；丢弃：未发名称及其余记录字段 |
| 桥接 assistant | requiresAssistantAfterToolResult 且结果后接 user 时注入固定 `I have processed the tool results.`；图片搬运同样可能插入（`OCC:1241–1245,1450–1458`） | assistant.content | 照录成历史 assistant | 确定性变换：增加合成消息；无法由 wire 确定它是否来自用户原历史 |
| 所有 timestamp；历史 assistant 身份/usage/stop/response/error/levels/diagnostics/deferred/endTurn/duration | convert 不发送这些历史元数据；身份仅参与 TM 判同模型；error/aborted 另有整条删除规则（`types.ts:565–595`；`TM:95–99,195–203`；`OCC:1291–1403`） | 无历史元数据 | assistant.api 固定、provider=""、model=请求 model、usage 零、stop=stop；响应元数据 None；各消息 timestamp=0（`src/api/openai_completions/decode.rs:66–94,157–173,180–188`） | 丢弃：原历史字段。mock 默认装配不属于 pi 注入 |

### tools、options 与身份字段

| unified 字段 | convert 处理 + file:line | wire 字段 | decode 重建 | 终态 |
|---|---|---|---|---|
| 目标 `Model.id` | `model.id`（`OCC:823`） | model | UnifiedRequest.model（`src/api/openai_completions/decode.rs:31`） | 精确往返（未被 sampling/onPayload 覆盖） |
| 目标 provider/api/baseUrl/headers/cost/compat/input/thinkingLevelMap 等模型配置 | 选择客户端、转换/推理/计费规则，而非原对象序列化（`OCC:310,341–378,762–799,1593–1734`） | URL/headers/分支效果；无完整模型配置 | 只重建 model 字符串 | 丢弃：原模型配置；不能从所选 wire 反推唯一 provider/compat |
| tools.name/description/parameters | function 工具 schema；无 strict 配置不改 schema，支持 strict 时由 CS 决定；strict 字段仅 supportsStrictMode != false 才加（`OCC:1480–1516`；`CS:127–143,224–253`） | tools[].function | 保留 name/description/parameters，忽略 strict（`src/api/openai_completions/tools.rs:7–17`） | 精确往返：普通 schema；确定性变换：strict schema（C9）；丢弃：strict 策略 |
| tools.constrainedSampling grammar | 支持 custom 时优先非空 openai_lark，其次 openai_regex；输出 syntax=lark/regex（`CS:246–284`；`OCC:1483–1498`） | custom.format.grammar | parameters={}；共用 decoder 将 lark/regex 映回 openai_lark/openai_regex（`src/api/grammar_tool.rs:12–31`） | D：仅已选变体保留；L：原 schema/未选择 variants 不发；枚举键缺口已修 |
| 空 tools / 历史工具 | 当前无工具但 hasToolHistory 时发 []；没有历史则可省略（`OCC:93–104,855–863`） | tools:[] / 省略 | 都无 toolsAdded（`src/api/openai_completions/tools.rs:55–58`） | 确定性变换：二者合为无工具声明 |
| options.maxTokens | truthy 时按 compat 选 max_tokens / max_completion_tokens；simple 入口先按 contextWindow 及估算值 clamp（`OCC:842–849,743–745`；`SO:17–21,35–46`） | max_tokens / max_completion_tokens | 两者并存时 max_completion_tokens 优先（`src/api/openai_completions/decode.rs:34`） | 精确往返：直接入口正值；确定性变换：simple 的 clamp / 0 省略 |
| temperature | 非 undefined 则传（`OCC:851–853`） | temperature | 同数值（`src/api/openai_completions/decode.rs:35`） | 精确往返：JSON 数值 |
| toolChoice | truthy 时直接赋（`OCC:869–871`） | tool_choice | JSON字符串/对象原样（`src/api/openai_completions/decode.rs:37`；`src/model/request.rs:26`） | E：已发字符串与对象的JSON值及类型 |
| reasoning / reasoningEffort | simple 先 clamp level，off→undefined；provider map/compat 分支见 C10（`OCC:747–753,880–977`；`models.ts:1230–1259`） | reasoning_effort / reasoning.effort / thinking string 或厂商布尔/对象 | 只取 reasoning_effort → reasoning.effort → thinking string（`src/api/openai_completions/decode.rs:41–51`） | 确定性变换：映射后的 effort；确定性变换：布尔/模板形态被当前 decode 投影为无 reasoning（实现缺口，wire 已携带） |
| thinkingBudgets | 按 level 选 budget，正值才发，最大留 1024 answer room；字段由 compat 指定（`OCC:1012–1031,983–985`；`SO:68–91`） | thinking_token_budget / 配置字段 / 模板值 | 没有 decoded option（`src/api/openai_completions/vendor.rs:3–26`） | 确定性变换：当前 decode 不物化已携带预算（实现缺口）；丢弃：原 budgets 表未上线 |
| sessionId/cacheRetention | 见概览及 C11；none 禁用 pi 自带 session 信号；显式 headers/sampling/onPayload 仍可改写（`OCC:347–362,775–785,826–831,1003–1007`） | prompt_cache_key / affinity headers / retention | body 优先再 header；retention 没有 decoded 字段（`src/api/openai_completions/decode.rs:36`；`vendor.rs:3–26`） | 确定性变换：截短；丢弃：未发 session；**实现缺口**：retention/session_id 已发而未读 |
| supportsUsageInStreaming/store/cache-control/tool_stream/priority/routing | include_usage 默认 true、store 支持时 false；cache-control 打标；tool_stream/priority/provider/providerOptions 按 compat（`OCC:834–874,987–1000,1077–1188`） | 对应字段/标记 | vendor 不列出这些字段，忽略（`src/api/openai_completions/vendor.rs:3–26,55–60,150–182`） | 确定性变换：控制数据上线但当前投影不进入 UnifiedRequest（实现缺口/控制边界），不是 wire 不支持 |
| samplingParams | model → thinking-level → request 按 key 后者覆盖；最后 Object.assign，可覆盖 model/messages/stream 等命名字段（`SO:23–33`；`OCC:1003–1007`） | 任意合并 body | 仅 vendor 已声明字段可重建；未知字段忽略 | 确定性变换：覆盖后投影；不能保证被覆盖字段按前面各行往返（`src/api/openai_completions/vendor.rs:3–26`） |
| onPayload / onResponse / onProviderStreamEvent | payload 回调非 undefined 返回值替换整个 params；response 只观测状态/头；stream hook 在每个 chunk 检查前执行（`OCC:375–378,393,558–560`） | 最终替换 body；回调本身不上线 | 不重建函数 | 丢弃：回调身份；确定性变换：自定义 payload 需单独重新核对，不适用默认 canonical |
| apiKey/headers/fetch/signal/timeoutMs/retries/env/telemetryContext | key/header 见概览；fetch 交 SDK，signal/timeout 交请求，外围 retry；env 用于 retention；telemetry 未在本 adapter 读取（`OCC:294–302,341–393,789–799`） | transport 或客户端控制，不是 body options | keyId 独立提取，不混进 options | 丢弃：原控制对象不上线；transport 阻断：请求在内容解析前失败时 |
| transport/websocketConnectTimeoutMs/metadata | StreamOptions 定义但本 OCC 无对应消费路径（`types.ts:234–261`；`OCC:304–393,802–1009`） | 无 websocket/metadata 字段；始终此 SDK stream 路径 | 无 | 丢弃：此 adapter 忽略这些选项；不能把 transport=websocket 说成支持 WS |

## 3. 回复方向字段映射表

encode 列是当前 mock，parser 列是权威 pi。`AssistantMessage.content` 的 TS 合法类型只有 text/thinking/toolCall；Rust 还允许 Image，但本 encode 拒绝它（`types.ts:565–567`；`src/api/openai_completions/encode.rs:44`）。encode 拒绝不是“transport 阻断”：它是尚未发流的本地表示边界，当前路由转 HTTP 500（`src/mounts/routing.rs:115–123`）。

| unified AssistantMessage 字段 | encode 事件/字段 + file:line | pi-ai 解析重建 + file:line | 终态 |
|---|---|---|---|
| `content[].Text.text` | 每块一个 `choices:[{index:0,delta:{content:text}}]`（`src/api/openai_completions/encode.rs:18–21,107–114`） | 非空 delta 追加到全流唯一 text slot；slot 在第一次 text 出现时入 content（`OCC:479–485,591–604`） | 确定性变换：所有非空 text 无分隔串联；空块不建 slot；多个块/交错边界不可恢复 |
| `Text.textSignature` | 不检查、不发（`src/api/openai_completions/encode.rs:20–21`） | 新 text 仅 type/text（`OCC:481`） | 丢弃；旧文档“显式报错”错误 |
| `Thinking.thinking`、三字段名 signature | 先统一签名域投影；合法字段名发指定字段，无签名默认reasoning_content，合法details另发；外域签名明文转text（`src/api/openai_completions/encode.rs:23–30`） | 每个 delta 取首个非空 reasoning_content → reasoning → reasoning_text；唯一 thinking slot，按到达顺序直接拼接；opencode-go 的 reasoning 签名改 reasoning_content（`OCC:487–497,610–638`） | 确定性变换：文本无分隔合并；没有 details 时保留首次建 slot 的字段签名。**外域有签名块按O18转text，无签名fallback不变** |
| `Thinking.thinkingSignature` 为 details 数组 | mock 只要求整个数组各项对象的 type 是三类之一；空数组允许；不检查 summary/text/data 类型（`src/api/openai_completions/encode.rs:76–85`） | parser 逐项校验：summary.summary:string；encrypted.data:string；text.text:string，signature 可缺省/null/string；公共 id 可缺省/null/string，format 缺省/string，index 缺省/number。过滤非法项；任一合法项即建 thinking slot（`OCC:123–152,670–680`） | 确定性变换：先 mock 载体门控，再 pi 逐项过滤；不可把 Q 的“非空且全合法数组”校验套到 R |
| details 的累计/签名终值 | 各 thinking 块可各发一个 details delta（`src/api/openai_completions/encode.rs:29–30`） | 相邻 text/summary 同类内容直接连接；text.signature 用 逻辑或赋值（OR=），公共 id/index 用 ??=、format 用 逻辑或赋值（OR=）；encrypted 独立。结束/异常时 JSON.stringify 累计数组覆盖该唯一 thinking slot 的签名，details 不生成可见 thinking（`OCC:251–273,331–338,444–445,708–711`） | 确定性变换：合法 details 的语义数组；原 JSON 格式、分帧、块归属/多签名不可恢复 |
| `Thinking.redacted` | 无字段（`src/api/openai_completions/encode.rs:23–30`） | thinking slot 无 redacted（`OCC:487–497`） | 丢弃；不等于 encrypted details 丢弃 |
| `ToolCall.id/name/arguments` | 全部编码为 function；tool_index 从 0 起**只按 toolCall 递增**；arguments JSON 字符串（`src/api/openai_completions/encode.rs:17,33–42`） | 优先 index 查 slot，再 id；只补空 id/name；arguments 片段拼接后 parseStreamingJson，结束再解析并移除 scratch 字段（`OCC:499–555,640–666,452–470`；`utils/json-parse.ts:104–124`） | 精确往返：不同 index/id、合法 JSON 对象；确定性变换：重复 id 可合并 slot，不承诺任意重复 ID 保持块数 |
| 外来 custom tool delta | 当前 mock 不发 custom（同上） | 若 custom 且无 function，从请求 grammar map 得属性，否则 input；字符串增量累积成单属性 arguments（`OCC:509–520,546–553,657–659`；`CS:171–200`） | 确定性变换：schema 确定的单字符串；mock 的 function 编码不是协议只能 function 的证明 |
| `ToolCall.thoughtSignature/namespace` | 无字段（`src/api/openai_completions/encode.rs:33–41`） | ToolCall 创建时无这些字段（`OCC:512–520`） | 丢弃 |
| 原始 content 顺序 | 按输入块顺序发内容帧（`src/api/openai_completions/encode.rs:18–45`） | 每种 text/thinking 首次出现建一次 slot，工具按首次 index/id 建槽；parser 在同一 chunk 内按 text → reasoning → tools → details 处理（`OCC:479–555,591–680`） | 确定性变换：首次槽位顺序，不是保留所有交错块顺序 |
| `stopReason=stop/length/toolUse` | finish_reason 分别 stop/length/tool_calls，接 usage 帧和 DONE（`src/api/openai_completions/encode.rs:47–49,58–62`） | 同名映射；rawStopReason 记录 wire 字符串（`OCC:581–588,1562–1585`） | 精确往返：stopReason；确定性变换：rawStopReason 变为标准拼写 |
| `stopReason=error/errorMessage` | 只认 errorMessage **开头** `Provider finish_reason: ` 的非空后缀，否则 finish_reason=error（`src/api/openai_completions/encode.rs:63–70`） | stop/end→stop；length→length；function_call/tool_calls→toolUse；其余→error，消息 `Provider finish_reason: X`；error 分支抛出再 catch 格式化（`OCC:1566–1584,698–719`；`utils/error-body.ts:36–56,127–134`） | 确定性变换：一般错误文字丢失，后缀若是 stop 等成功值，甚至会变成功终态；不能泛称 error 精确可逆 |
| `pending/aborted/deferred` + deferred handle | encode 返回 Err，不发帧（`src/api/openai_completions/encode.rs:72`） | pi 的 aborted 只能由本地 signal/catch 产生；不是标准 finish_reason 映射（`OCC:688–703,718–728`） | encoder输入契约拒绝，无正常canonical值，不归D/T；没有发出deferred handle，不能借此断言协议绝对无容量或canonical成stop |
| `usage.input/output/cacheRead/cacheWrite` | prompt_tokens=input+cacheRead+cacheWrite；completion_tokens=output；cached_tokens 总发；write>0 才发 cache_write_tokens（`src/api/openai_completions/encode.rs:88–97`） | 每次 usage 整体替换，不累计；优先 chunk.usage，缺省 choice.usage。input=max(0,prompt-read-write)，cache read 优先 details.cached_tokens → prompt_cache_hit_tokens → cached_tokens → 0，write=details.write（假值取 0）（`OCC:568–579,1530–1555`） | 精确往返：非负合法 token 计数；外来 usage 按该确定性公式投影 |
| `usage.reasoning/cacheWrite1h` | reasoning>0 才发 completion_tokens_details.reasoning_tokens；无 cacheWrite1h（`src/api/openai_completions/encode.rs:98–100`） | reasoning=该字段（假值取 0）；output 已含 reasoning，不二次相加；无 1h 拆分（`OCC:1546–1555`） | 确定性变换：reasoning 缺省→0；丢弃：cacheWrite1h |
| `usage.totalTokens/cost` | 不发输入总数/费用（`src/api/openai_completions/encode.rs:88–104`） | total=input+output+cacheRead+cacheWrite；cost 调 calculateCost，按模型费率及最大匹配 inputTokensAbove tier 计算每百万 tokens 价格（`OCC:1555–1558`；`models.ts:1206–1225`） | 确定性变换：totalTokens；pi 注入：cost，原费用丢弃 |
| `responseId` | 所有 JSON 帧带 id（若 Some）（`src/api/openai_completions/encode.rs:9–12`） | `output.responseId \|\|= chunk.id`，首次 truthy ID 此后保持（`OCC:564`） | 精确往返：固定非空 ID；空/缺省不主张语义等价 |
| `responseModel` | 所有 JSON 帧带 model（若 Some）（`src/api/openai_completions/encode.rs:13–15`） | 首个非空且不同于请求 model.id 的 model；之后不覆盖（`OCC:565–566`） | 精确往返：非空且不等于目标 model.id；确定性变换：相同/空值→不设 responseModel |
| `role/api/provider/model/timestamp/durationMs` | encode 仅取 responseId/responseModel，不发这些字段（`src/api/openai_completions/encode.rs:8–18`） | role=assistant、api/provider/model 取目标模型、timestamp=Date.now；durationMs 在终结时按单调时钟盖章（`OCC:313–329`；`utils/event-stream.ts:97–129`） | pi 注入；不能以回复脚本的身份/时间为权威 |
| `providerThinkingLevel/thinkingLevel/diagnostics/endTurn`；独立 `rawStopReason`/errorMessage | encode 无这些独立字段；stop/error 的有限载体如上（`src/api/openai_completions/encode.rs:8–50,58–73`） | OCC 初始化不填 levels/diagnostics/endTurn；rawStopReason 来自 finish_reason，errorMessage 来自映射/异常（`OCC:313–329,581–588,707–728`） | 丢弃：未上线元数据；确定性变换：由 finish_reason 新推导的值 |
| HTTP MockError | `encode_error` 可造 `{error:{message,type:code,code}}`，但**当前路由不调用它**，实际 http_error 的 type 固定 invalid_request_error（`src/api/openai_completions/encode.rs:53–56`；`src/mounts/routing.rs:115–123`；`src/mounts/transport.rs:23–32`） | SDK 抛错后 normalize/format；状态/body 可能并入 errorMessage（`OCC:707–728`；`utils/error-body.ts:36–91,127–134`） | transport 阻断：非 200、内容尚未解析；异常仍有 pi 错误消息，不代表脚本内容已被解析 |

## 4. canonical form

**O18 / R 统一签名投影（owner裁决，现行）**：OCC：只认可reasoning_content/reasoning/reasoning_text或既有type门控的details数组（含空数组）；其他有签名thinking先转无签名text，空白/redacted删除，再按text单槽拼接。取消任意opaque固定fallback到reasoning_content；无签名thinking与合法details的后续pi过滤规则不变。 统一实现：`src/api/encode_thinking.rs:18–90`；跨源明文规则依据`api/transform-messages.ts:95–116`、`api/openai-responses-shared.ts:179,264–289`、`api/anthropic-messages.ts:1168,1443–1483`、`api/google-generative-ai.ts:374`→`api/google-shared.ts:200,234–266`。这只判目标签名支持域，不做基于reply身份的TM全量转换；历史summary-item降级草案被text规则取代。完整证据/18案复跑见`../o18-resolution.md`与图谱B2。

**Q-COMPOSE（owner 裁决演进）**：本节单轮 canonical 不蕴含全域幂等。固定 M/O，X=Q(C) 时复合期待为 `Q(B(X)) ≡ K(B(X))`；原 `Q(B(X)) ≡ X` 仅记录 rawIdempotent/rawDiffs。请求默认身份触发 TM:95–145 再降级，或发送前清洗所得空块在二轮被过滤，均按本节同一规则合成，不重标身份、不删字段。Q 无值仍记 domain finding，不计通过；Responses 的 OR:277–291 未截断 session header 可在 ByteString 边界被拒绝。统一定义与证据见 ../irreversibility-atlas.md 的 G5、../f4-p1-resolution.md。

### 条件与规则汇编

`decode(convert(C)) = canonicalQ(C, model, compat, options)` 只在成功发出且 decode 成功时定义；`parse(encode(A)) = canonicalR(A, targetModel)` 只在 encode 成功及 transport 成功时定义。不能用一份忽略 compat、options 的固定 expected 函数证明全域等价（`OCC:375–378,802–1009,1193–1233`；`src/api/openai_completions/encode.rs:44,72`）。下表为第 2、3 节的确定性规则全集索引；丢弃/盖章字段也保留投影位置。

| 规则 | 精确规则与适用方向 | 权威证据 |
|---|---|---|
| C1 Q transcript | shorthand 前置；默认折叠 system；content 按消息顺序 `\n\n` 累积，sections 同名覆盖/null 删除；tools 先 remove 后 add。同名 Map 更新不改变未被删除项的原顺序，删除再加会到末尾；mid-convo 支持时不折叠，更新框架文本逐条照录 | `TR:8–33,55–119`；`TXT:6–40`；`OCC:1233–1259` |
| C2 Q 图片降级 | 非视觉模型 user/toolResult 图片替为各自固定占位；连续图片或同文占位去重；视觉模型保留 data URL 中 mime/data | `TM:8–51,70–85`；`OCC:1276–1282,1434–1444` |
| C3 Q 跨模型 | provider/api/model 三项判同；跨模型非空 thinking→text，redacted 删除，textSignature/工具 thoughtSignature 清除；同模型带 signature 的空 thinking 可进 convert，但仍受最终消息过滤 | `TM:95–145`；`OCC:1310–1321,1397–1405` |
| C4 Q 历史/孤儿 | error/aborted assistant 删除；pending toolCall 在下个 assistant/user/末尾补 No result provided；system 暂存到结果之后；补结果最终 isError 在 wire 丢失 | `TM:159–235`；`src/api/openai_completions/decode.rs:180–188` |
| C5 Q ID | 仅跨模型：含 `\|` 按首分隔符拆 call/item，两段非法字符 `/[^a-zA-Z0-9_-]/g`→`_`，item 非空拼 `call_item`；≤40 保留，否则 `call.slice(0,max(1,40-hash.length-1)) + '_' + shortHash(original).slice(0,8)`；无 `\|` 且目标 provider=openai 截前 40 UTF-16 单元，其他保留；toolResult 跟随映射 | `TM:129–151`；`OCC:1202–1228`；`utils/hash.ts:1–13` |
| C6 Q 文本 | system text blocks `\n`；assistant 删除 trim 后空块，默认剩余 text 用 `""` 连接；toolResult text 用 `\n`；decode assistant 数组用 `\n\n`，system 数组用 `""`，外来 tool 数组用 `\n\n`；user 仅滤原 length=0 的块。调用 sanitize 的位置删除孤立 surrogate，不是替换为 U+FFFD；普通 reasoning 字段拼接路径没有 sanitize | `TXT:6–21`；`OCC:1257–1285,1298–1308,1325–1347,1414–1426`；`utils/sanitize-unicode.ts:21–25`；`src/api/openai_completions/decode.rs:54–58,68,128,184` |
| C7 Q thinking | 非空 thinking 普通模式仅首块合法字段名才上线，文本 `\n` 合并；首个全合法非空 details 数组优先于 legacy encrypted 集；details 抑制普通 reasoning 字段；thinking-as-text 把 thinking sanitize 后 `\n\n` 合并、前置各 text part，**仍可能另带 preserved details**；DeepSeek compat 需要时注入空 reasoning_content | `OCC:220–246,1310–1392` |
| C8 Q 消息/结果结构 | 无 text/tool_calls assistant 删除（thinking-as-text 的 thinking 本身是 content，例外可保留）；空数组 user 删除，空串 user 保留；tool 结果无 text 用图片/空输出占位；图片按连续结果组合成一个后随 user；桥接 compat 加固定 assistant；decode 固定 Thinking→Text→ToolCalls，timestamp=0、历史元数据默认值 | `OCC:1261–1289,1323–1328,1397–1476`；`src/api/openai_completions/decode.rs:103–188` |
| C9 Q tools | anchors 仅两个 mid-convo 标志均真且无删除、无重复名称；否则全量当前工具集。strict 只在配置 json_schema 且支持、schema 可转换时为 true：clone；递归处理 properties/items/anyOf；object required=所有 property 名、additionalProperties=false，原可选且不接受 null 的 property 包成 anyOf `[原schema,{type:'null'}]`；拒绝 `$ref/$defs/definitions/allOf/oneOf/patternProperties/dependentSchemas/dependencies/unevaluatedProperties/propertyNames/contains/prefixItems/not/if/then/else`；anyOf 必须非空且不能含 object/array 分支，items 不能是数组；object additionalProperties 只接受缺省或 false，required 必须为已声明属性名数组。失败时 require 抛错，prefer 回退。grammar 优先 lark，再 regex，只保留选中 variant 与单个 input 字符串；不支持 grammar 时回到 function schema | `TR:200–237`；`CS:14–143,203–298`；`OCC:1482–1516` |
| C10 Q effort/budget/template | level 在 simple 先按支持级别优先向上、无上级再向下 clamp，off 不传 reasoningEffort；各格式见下一表。默认 minimal=1024/low=2048/medium=8192/high=16384，自定义 budgets 按 key 覆盖；budget=min(level budget,max(0,ceiling-1024))，ceiling=max_tokens ?? max_completion_tokens ?? model.maxTokens，xhigh/max 用 high budget；≤0 不发。模板 primitive/null 原样；omitWhenOff 删除；enabled→布尔，budget→上述值，effort→map 值（undefined 用 effort，非字符串省略）；空模板对象省略 | `models.ts:1230–1259`；`OCC:747–753,880–985,1012–1075`；`SO:68–91` |
| C11 Q session/cache | 显式 retention 优先，env PI_CACHE_RETENTION=long 次之，否则 short；none 禁 pi 自带 session。body key 条件见概览，Array.from 截 64 code points；long retention=24h。Anthropic cache compat 且非 none：ephemeral；long 且支持再 ttl=1h；标首个 system/developer、末个 tool、从后向前首个可标会话消息；非空 string 转单 text part，数组标末个 text | `OCC:294–302,347–362,775–785,826–831,1077–1188`；`api/openai-prompt-cache.ts:1–8` |
| C12 Q options/覆盖 | maxTokens truthy 才上线；simple 上限=min(request或model上限,max(1,contextWindow-estimate-4096))，contextWindow≤0 则 max(1,cap)。temperature 非 undefined、toolChoice truthy；sampling 依 model→level→request 合并并最后覆盖 body；onPayload 非 undefined 再整包替换 | `SO:17–46`；`OCC:375–378,842–871,1003–1007` |
| C13 R 槽位/签名 | 先施加本节O18目标签名域投影；非空 text 合为一槽；非空 reasoning 合为一槽；槽位只在首次出现入 content，无分隔连接；每 delta reasoning 字段优先级固定；details 经当前 mock 门控及 pi 单项校验，合法相邻同类 text/summary 合并；metadata 补齐规则见第 3 节；合法 details 最终覆盖签名且不生成可见 thinking | `src/api/openai_completions/encode.rs:18–42,76–85`；`OCC:123–152,251–273,331–338,479–555,610–680` |
| C14 R usage/身份 | usage 帧整体替换，四计数按第 3 节公式；reasoning 缺省 0，不叠加 output；1h 不存在；total 重算、cost 用目标模型费率；身份/时钟盖章；responseId 首个 truthy 值，responseModel 首个非空且不同目标的值 | `OCC:313–329,564–579,1519–1559`；`models.ts:1206–1225`；`utils/event-stream.ts:97–129` |
| C15 R finish/error | rawStopReason 为 wire truthy finish_reason；stop/end→stop，length→length，function_call/tool_calls→toolUse，其他→error+Provider finish_reason: X；null 不进入映射。缺 finish 时仅 compat.supportsFinishReason=false 可按是否有 toolCall 推断；否则报 Stream ended without finish_reason。异常保留部分内容、移除 scratch、details 写回签名，并按 signal 盖 aborted/error | `src/api/openai_completions/encode.rs:58–73`；`OCC:581–588,685–729,1562–1585` |

C10 的完整格式分支（均还受 model.reasoning 及最后 sampling/onPayload 覆盖约束）：

| thinkingFormat | wire 规则 | 证据 |
|---|---|---|
| zai | thinking enabled+clear_thinking:false / disabled；有 effort 且支持时，map undefined 回原 effort，结果为 string 才发 reasoning_effort（null 不发） | `OCC:880–892` |
| qwen | enable_thinking=!!effort；有 effort 且支持，map??effort 且为 string 才发 reasoning_effort | `OCC:893–900` |
| qwen-chat-template | kwargs={enable_thinking:!!effort,preserve_thinking:true} | `OCC:901–905` |
| chat-template / baseten | 按 C10 解析 kwargs / args；baseten 支持 effort 时从请求 level 或 off 取 map，undefined 回原 effort，string 才发 reasoning_effort | `OCC:906–927,1034–1075` |
| deepseek | 有 effort 则 thinking.enabled；无 effort 且 map.off!==null 则 disabled；有 effort 且支持时 reasoning_effort=map??effort | `OCC:928–937` |
| openrouter | 有 effort：reasoning.effort=map??effort；无 effort 且 off!==null：off??none | `OCC:938–947` |
| ant-ling | 有 effort 且 map 为 string 才写 reasoning.effort，不默认回原 level | `OCC:948–952` |
| together | reasoning.enabled=!!effort；有 effort 且支持时 reasoning_effort=map??effort | `OCC:953–961` |
| string-thinking | 有 effort：thinking=map??effort；无 effort 且 off!==null：off??none | `OCC:962–968` |
| 其他 OpenAI-style | 有 effort 且支持：reasoning_effort=map??effort；无 effort 且支持：只在 off 映射为 string 时发 | `OCC:969–977` |

### 与既有文档、canonical tests 的显式裁决

| 对账点 | 已核对事实 / 裁决 | 证据 |
|---|---|---|
| 旧文档“所有 ID 规范化” | **旧文档错，源码对**：只跨模型触发；同模型 `call\|item` 直接探针确认原样。canonical 自己复用 TM，所以不能把它的 normalize 函数理解为无条件执行 | `TM:129–151`；`tests/canonical-occ.mjs:30–32,185–197` |
| 旧文档 surrogate“替换”/canonical 不清洗 | **旧措辞及 request canonical 错，源码对**：sanitize 删除孤立 surrogate；canonical emitUser/emitAssistant 未清洗。探针 `a\\uD800b`：convert=`ab`，canonical 仍含 surrogate | `utils/sanitize-unicode.ts:21–25`；`tests/canonical-occ.mjs:113–139`；`OCC:1265,1305` |
| opaque signature 请求 | **request canonical 错，源码对**：canonical 把 opaque 造为 `["opaque"]` signature；真实 convert 不发 reasoning/details。此差异已用含 text 的同模型 assistant 探针确认 | `tests/canonical-occ.mjs:136–144,163–168`；`OCC:1312–1348` |
| 合法 details 请求 | **request canonical 错，源码对**：canonical 收集 signature 字符串再 JSON.stringify，得到“JSON 字符串的数组”，不是权威所选 details 数组；可见 thinking 被 details 抑制；空 thinking 合法 signature 被 canonical 提前过滤，真实 convert 在消息有 text 时仍发 details。两种探针均确认 | `tests/canonical-occ.mjs:130,136–144,163–168`；`OCC:1310–1319,1339–1348,1383–1385` |
| Q 空/合并 thinking | **旧文档不完整**：reasoning-only 不是一律可保留，默认最终过滤删除整条；thinking-as-text 可保留；多 details signature 只取首个合法数组，不是全并。R 才会累计多帧 details | `OCC:1312–1319,1323–1328,1397–1405,670–680` |
| compat/strict/grammar/options 全域声明 | **旧“全部支持”及全域等价声明错**：request canonical 固定 resolveTranscript(false)、只保留普通 tools schema、options 固定 maxTokens=64；没有模拟 mid-convo、strict schema、grammar/custom、reasoning/template、头覆盖等全部配置 | `tests/canonical-occ.mjs:27–32,100–109,146–151`；`OCC:813–1007,1482–1516` |
| toolResult 数组/回复 tool index | **旧文档错，当前 Rust 与 pi 路径一致**：Q convert 本来发 string，原 text 用单换行；外来 parts 的 decode 是双换行；R tool_index 是第几个工具调用，不是 content 块序号，测试也断言 0 | `src/api/openai_completions/decode.rs:184`；`encode.rs:17,33–42`；`tests.rs:146–176`（后两短路径相对 `src/api/openai_completions/`）；`OCC:1414–1427` |
| textSignature / MockError | **旧文档错**：textSignature 静默不发，不是 encode 报错；encode_error 虽存在，当前路由实际用 http_error，不能把其 type=code 写成线上固定行为 | `src/api/openai_completions/encode.rs:20–21,53–56`；`src/mounts/routing.rs:115–123`；`src/mounts/transport.rs:23–32` |
| R reasoning canonical | **此部分与实际链条一致**：先模拟 mock 的 type 门控，再模拟 pi 的 shape 过滤/相邻合并，不能为“直接模拟 pi”而去掉前者。当前 2 项真实 SSE 回归通过，包括五个 seeds、opaque→text投影、非法项过滤、details-only | `tests/canonical-occ-reasoning.mjs:2–29`；`tests/canonical-occ-reply.mjs:24–37`；`tests/canonical-occ-reply.test.mjs:15–69`；`src/api/openai_completions/encode.rs:76–85`；`OCC:123–152,670–680` |
| R errorMessage canonical | **reply canonical 对非开头前缀错误**：regex 没有 `^`，可从任意位置提取后缀；Rust strip_prefix 只接受开头。并且后缀为 stop 等保留词会改变 stopReason，而 canonical 仅改 errorMessage，非全域正确 | `tests/canonical-occ-reply.mjs:39–41`；`src/api/openai_completions/encode.rs:63–70`；`OCC:1566–1584` |
| R responseId 证明力度 | **测试盲点，不裁成协议损失**：fillCompletions 删除期望 responseId，再取 got.responseId；这样无法独立检测 encode 丢 ID。wire/parser 实际有 ID 路径，需独立断言 | `tests/canonical-occ-reply.mjs:10–11`；`src/api/openai_completions/encode.rs:10–11`；`OCC:564` |
| usage/身份/时间忽略 | **分类须区分**：cacheWrite 可逆、cacheWrite1h 不上线、reasoning 缺省 0；总数重算、cost/身份/时间 pi 盖章。矩阵忽略 cost/total/rawStopReason/levels/时间，只说明未比较，不是不存在 | `tests/canonical-occ-reply.mjs:6–8`；`tests/matrix-lib.mjs:46–54,79–93`；`OCC:313–329,1519–1559` |
| atlas 对账 | 采用 atlas 的字段+方向+前置条件五分类；A01.01–22 的主要投影方向与本文一致。本文细分 A01.08 的预算/grammar decode 缺口，A01.11 的精确域增加工具 ID/index 不冲突前提；A01.17 还须保留“encode 拒绝不等于 transport 阻断”的边界。atlas 部分旧行号偏移不沿用 | `docs/design/mock-llm-server/irreversibility-atlas.md:9–13,29–56`；对应权威 `OCC:499–555,983–985,1562–1585`；`src/api/openai_completions/encode.rs:72` |

### 补充 oracle 差异登记（定义冻结复审）

| 报告ID / 测试 | 当前偏差与独立规则 |
|---|---|
| C24 / tests/canonical-occ-reply.mjs:35 | 工具原样push保留thoughtSignature/namespace，实际encoder:18–45不发，两字段应按第3节L投影；仅OCC该域，不全局删签名；W-06候选。 |
| C29 / tests/canonical-occ-reply.mjs:5–42 | 源responseModel为空/等目标时实际不设；重复id的新index可命中旧工具slot并合并，不能逐源块原样push；OCC:499–555,565–566为权威，第4节C13/C14须按该条件预测；W-06候选。 |

## 5. 不可逆声明与 transport 边界

### Options 槽位镜像补充（本轮裁决）

- toolChoice对象按JSON值/类型E；grammar共用src/api/grammar_tool.rs:12–31，lark/regex映回openai_lark/openai_regex。原schema/inputProperty及未选variant不发，仍L（CS:253–284；OCC:1487–1502）。
- strict最终bool不能逆猜原prefer/require；parameters保留终值，不增造strict模型槽。samplingParams按model→level→request合并后末写根级（SO:24–33；OCC:1003–1007），只读具名wire终值，未知根键不臆测重建原map；wire已发strict/top_p而mock未存是投影，不是pi丢弃。


- **Q 固有多对一**：system 历史/section 名被渲染，assistant text 合块与跨模型 thinking→text、ID 规范化、tool 图片按连续结果合组搬运、grammar 只发单 input，均有不同原输入产生同 wire；canonical 只能定义投影，不能恢复原结构（`TR:72–119`；`TM:95–145`；`OCC:1202–1225,1298–1405,1410–1467,1487–1501`）。
- **Q 不携带的记录信息**：timestamp、历史 assistant usage/response/error/身份等、tool isError/details/usage/nestedCalls 不上线。mock 补零或空串不意味着这些字段可逆；默认 requiresToolResultName=false 又使 toolName 不发（`types.ts:565–635`；`OCC:1291–1405,1424–1431,1652–1654`；`src/api/openai_completions/decode.rs:157–188`）。
- **R 固有多对一与盖章**：text/thinking 各单槽，分块边界丢失；reply text/tool 签名不发；usage 1h 拆分不发；原身份/时间/费率被客户端取代；responseModel 等于请求 ID 时不设。responseId 和四类 token 计数有可读 wire，不能顺带删去（`src/api/openai_completions/encode.rs:8–50,88–104`；`OCC:313–329,479–497,564–579,1530–1558`）。
- **mock 缺口不等于信息论损失**：wire budget、cache retention、routing/priority 等已发但当前 decode 不存；grammar 原 schema 确实未携带；本轮共用 decoder 已将 lark/regex 映回 openai_lark/openai_regex（src/api/grammar_tool.rs:18–21），不得再记作未修缺口（`src/api/openai_completions/vendor.rs:3–26`；`tools.rs:28–53`，短路径相对 `src/api/openai_completions/`；`CS:264–278`；`types.ts:728–746`）。
- **transport 阻断**：本地缺 key、请求失败/非 200、SDK 在交付 chunk 前失败，无法推出脚本内容的重建终态。catch 会产一个身份/时间已盖章的 error/aborted AssistantMessage，但这不是成功解析 encode 内容（`OCC:87–90,340–393,707–729`）。缺 finish 是已经进入内容流后的完整性错误，不能归为“解析前 transport 阻断”（`OCC:685–703`）。
- **SDK SSE 错误边界未验证**：旧文档“任何 SSE error 对象都会被 !choice 静默丢弃”不能成立为已验证结论：OCC 的 !choice 在 SDK 交付 chunk 后，SDK 本身可能先抛。锁定 src 只证明 hook → chunk 元数据/usage → choice 检查，不证明 SDK 内部处理；须另测 SDK 才能裁定（`OCC:558–579`）。
- **本地表示拒绝**：strict=require 但不支持/不合法、grammar 配置不合法在发请求前抛；R Image/pending/aborted/deferred 在 mock encode 被拒绝，当前路由 HTTP 500；这些不是丢弃某个字段后继续成功的 canonical（`CS:203–218,225–282`；`src/api/openai_completions/encode.rs:44,72`；`src/mounts/routing.rs:115–123`）。

## 6. 覆盖与 fixture 索引

### 源码阅读覆盖

本次先完整逐函数读取 `OCC:1–1734`：认证 guards、details validate/parse/append、retention、stream 的块创建/结束/工具增量/usage/finish/catch、streamSimple、createClient、buildParams、预算/模板/cache-control 全辅助函数、convertMessages 四类消息及 convertTools、parseChunkUsage、mapStopReason、detectCompat/getCompat；再核对 `TM:1–235`、`TR:1–237`、`TXT:1–40`、`CS:1–298`、`SO:1–108` 及 Rust decode/encode/tools/vendor。表中结论来自源码，不来自旧文档结论。

### fixtures 与已执行验证

| 位置 | 覆盖 / 实际状态 |
|---|---|
| `src/api/openai_completions/tests.rs:59–212` | 普通工具请求、options/session、图片 URL 拒绝、details decode、SSE 工具 index、响应 metadata、错误及 encode 拒绝。运行 `cargo test openai_completions -- --nocapture`：9 passed（含下行缓存测试），0 failed |
| `src/api/usage_cache_tests.rs:5–21,32–50` | input=11/output=5/read=13/write=17/1h=7/reasoning=2，wire prompt=41；四 token 计数非零 fixture；本次上述 cargo 命令已运行 |
| `tests/canonical-occ-reply.test.mjs:15–69` | 运行 `node --test tests/canonical-occ-reply.test.mjs`：2 passed；真实 Rust SSE→锁定 pi，五 fuzz seeds 及七类 signature 向量。比较的忽略项见 `tests/matrix-lib.mjs:46–54` |
| `tests/canonical-occ.mjs:27–197` | 已逐函数对账，**不是全域 oracle**；本次临时 Node 直接调用权威 convertMessages，对 opaque、合法 details、空 thinking details、同模型 pipe ID、孤立 surrogate 作断言，5 项探针通过；其中四项确认 canonical 偏差，第 4 节已明确裁决。未修改 tests |
| `tests/canonical-occ-reasoning.mjs:2–29`、`tests/canonical-occ-reply.mjs:5–42` | 回复签名两阶段处理已核对；另用临时 Node 调真实 Rust SSE 两例确认错误前缀偏差：`prefix Provider finish_reason: content_filter` 得 `Provider finish_reason: error`；`Provider finish_reason: stop` 得 stopReason=stop。两例与现有 reply canonical 不一致，预期偏差断言均通过；responseId 盲点仍需独立断言 |
| `tests/duality.mjs:20–46`、`tests/matrix-lib.mjs:25–75` | matrix runner 会写 `matrix-ten-results.json`，本次未运行，避免改动名下文档以外的快照；不把旧快照 pass 数当成本次证据 |

### 上游 fixture 检索入口（只读，未运行上游 Vitest）

以下路径相对 `<pi-mono>/packages/ai/test`；“索引”仅指已找到 fixture 入口，不以测试名称替代源码行为证明。

| fixture | 定位与用途 |
|---|---|
| `openai-completions-prompt-cache.test.ts:115–258` | key/24h/64 字符/none/env/affinity/显式头覆盖入口；权威规则 `OCC:294–302,347–362,775–785,826–831` |
| `openai-completions-reasoning-details.test.ts:118–188` | details/legacy/replay/合并入口；权威规则 `OCC:220–273,1312–1385,670–680` |
| `openai-completions-tool-choice.test.ts:702–734,810–921` | 缺 finish、index 归槽、混合增量入口；权威规则 `OCC:499–555,581–703` |
| `openai-completions-tool-choice.test.ts:1641–1717` | reasoning 不二次计数、chunk/choice 缓存 usage；权威规则 `OCC:568–579,1519–1559` |
| `openai-completions-thinking-token-budget.test.ts:105–189` | budget/off/xhigh/answer room/模板入口；权威规则 `OCC:983–1075`；`SO:68–91` |
| `openai-completions-thinking-as-text.test.ts:119–155` | thinking+text/thinking-only/端点入口；权威规则 `OCC:1323–1328,1397–1405` |

文档静态检查通过：恰好六个编号章节、五类终态名称齐全、298 处显式引用的文件存在且行号不越界、所有 Markdown 表格列数一致。首次检查发现的范围末端偏移及表格 pipe 已修正后复验；此检查不替代逐条语义复核。本工作区无 `.git` 元数据，`git status --short` 不可用；未执行 staging，无本地 Git index。

未验证范围：SDK 内部 Authorization/SSE error 细节、真实公网 provider 接受性、全部 compat 组合的执行覆盖、浮点/超大 JSON 数字跨 JS/Rust 的精度极限、空 responseId 边界。本文不宣称这些范围精确往返；本次只改本文件，Responses 文档不在权威输出路径内。
