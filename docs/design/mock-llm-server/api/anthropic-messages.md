# Anthropic Messages：组装对照协议

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 1. 概览

### 权威、方向与引用

当前参照为官方 v1.2.0 commit `06a466935536f8c9bcacb2d5efc0fc021be1bdff`，源码根 `vendor/pi-mono/packages/ai/src`。C08 已按此版本修正；其余历史源码行号来自旧 fork，不能不经定位直接套用。旧 fork 的错误结果图片降级规则不属于此官方版本。下列缩写是 **file:line 的文件别名**；`src/`、`tests/` 相对 mock-with-pi，其他客户端文件相对上述只读根。

| 别名 | 文件 |
|---|---|
| AM | `api/anthropic-messages.ts` |
| TM | `api/transform-messages.ts` |
| TR | `utils/transcript.ts` |
| TX | `utils/text.ts` |
| SO | `api/simple-options.ts` |
| CS | `api/constrained-sampling.ts` |
| JP | `utils/json-parse.ts` |
| ES | `utils/event-stream.ts` |
| TY | `types.ts` |
| D | `src/api/anthropic_messages/decode.rs` |
| M | `src/api/anthropic_messages/messages.rs` |
| V | `src/api/anthropic_messages/vendor.rs` |
| E | `src/api/anthropic_messages/encode.rs` |
| CA | `tests/canonical-am.mjs` |
| ML | `tests/matrix-lib.mjs` |

- 请求 Q：`TranscriptContext/options → resolveTranscript → transformMessages → buildParams/convertMessages/convertTools → wire → mock decode → UnifiedRequest`（AM:577–578,648–656,1157–1215；D:25–105）。`Context.systemPrompt/tools` 的旧入口先由 `normalizeContext` 前插初始 system，不是 `stream` 自行读取这些旁路字段（TR:10–33）。
- 回复 R：`AssistantMessage → mock encode → SSE → pi-ai parser → AssistantMessage`（E:8–66；AM:696–929）。Q 的历史 usage 丢失不能推广成 R 的 usage 不可传。
- 五分类沿用 `docs/design/mock-llm-server/irreversibility-atlas.md:9–13`：**精确往返 E**＝JSON 值语义；**确定性变换 D**＝下表精确给出的投影、合并或降级；**丢弃 L**＝原字段 wire 不携带；**pi 注入 P**＝客户端根据目标模型/时钟/费率盖章；**transport 阻断 T**＝内容解析前失败。类别缩写与文件别名 E/D 不同，终态列始终写全称。mock 自行补的零值不是“pi 注入”；wire 已携带而 mock 不读的是实现缺口，不是信息论不可逆。

### wire、路径、认证与 session

| 项 | 组装事实与边界 |
|---|---|
| 请求体 | JSON：`model/messages/max_tokens/stream:true` 必有；其余由 options/compat 门控；实际调用 `client.beta.messages.create(...).asResponse()`（AM:648–656,1207–1215）。 |
| 路径 | mock 接受 `POST /v1/messages`，也接受挂载名前缀；query 不参与 `path_api(uri.path())` 选择（`src/mounts/protocol.rs:115–120`；`src/mounts/routing.rs:24–44,61–64`）。SDK 的确切 URL 后缀（旧稿声称 `?beta=true`）不由锁定 `src` 直接定义，**未验证**，不作为本规格硬约束。 |
| 回复 | `text/event-stream`；mock 每帧 `event: <name>\ndata: <JSON>\n\n`，把完整帧向量连接成响应体（E:76–95；`src/mounts/transport.rs:15–21`）。不是必须“一块只有一次 delta”的解析限制；mock 当前确实这样编码（E:19–46；AM:771–814）。 |
| API key / KeyID | 普通客户端传 SDK `apiKey`、`authToken:null`；OAuth（key 包含 `sk-ant-oat`）与 Copilot 传 `authToken`、`apiKey:null`（AM:1011–1066,1101–1108）。mock 优先 `x-api-key`，否则剥离精确 `Bearer ` 前缀的 authorization；独立 decoder 对非 Bearer authorization 也接受原值（D:28–36）。HTTP 路由的 KeyID 则只接受 x-api-key 或真正 Bearer（`src/mounts/protocol.rs:99–112`；`src/mounts/transport.rs:39–43`）。SDK 自带 `anthropic-version` 等默认头值不在锁定 src 中定义，**未验证**。 |
| 其他认证 | pi 允许 options.headers 的 authorization/x-api-key/cf-aig-authorization，或 anthropic OIDC federation；自定义 client 跳过构造且 `isOAuth=false`（AM:307–369,607–613）。mock 不支持 cf-aig 专有 KeyID 提取；federation 交换的最终网络行为**未验证**，不能声称必然走 x-api-key（同上；D:12–16,28–36）。 |
| session 发送 | 仅普通/federation 构造分支，在 sessionId 非空、retention 非 none、compat 开启时发 `x-session-affinity`，OpenRouter 格式发 `x-session-id`；OAuth/Copilot 分支不自动加此头。headers 可覆盖它（AM:624–635,1025–1084）。OpenRouter 默认开启，其他默认关闭（AM:215–227）。 |
| session 解码与实际脚本输入 | 独立 decoder：affinity 优先于 session-id；`info.sessionSignal` 再回退到 metadata.user_id，`options.sessionId` 只取头（D:70–96）。实际 HTTP 路由保留 decoder 的 session_signal 并转发脚本；metadata-only 信号不会写入 options.sessionId。显式头优先，见 `src/mounts/protocol.rs`、`src/server.rs` 与 `tests/protocol-regressions.test.mjs`。 |

默认讨论未使用 onPayload 改写、普通 API key、默认 compat。compat 默认 eager/long-cache/tool-cache/temperature=true，empty-signature/strict/mid-system/mid-tool=false；managed effort 直接检查 model.compat，不来自此默认对象（AM:215–228,1202,1271）。所有例外在对应行明确列出。

## 2. 请求方向字段映射表

终态针对“原 unified 字段＋方向＋前提”。表内 `decode` 是现有 Rust 实现，不是建议实现。空值的缺省占位不代表恢复了原值。

### 消息、内容与工具

| unified 字段 | convert 处理＋file:line | wire 字段 | decode 重建 | 终态 |
|---|---|---|---|---|
| `SystemMessage.role/content`（默认 compat） | 重放所有 system 的非空 contentText，双换行拼接；初始文本非空才发送（TR:73–95,108–119；TX:6–20；AM:1166–1169,1234–1242） | 顶层 `system:[{type:"text",text}]` | text 块双换行拼接为头部 system 字符串；无文本且无工具则不建消息（D:112–142） | 确定性变换：多条/块 → 一个串，空 system 可消失 |
| `SystemMessage.sections` | 同名后写覆盖、null 删除；值按枚举顺序附到 content 后，以双换行分隔；不传 section 名（TR:82–95；TX:15–20） | `system[].text` | `sections=None`（D:136–141） | 确定性变换：只保留最终渲染文本；名称/补丁历史丢失 |
| 后续 system（mid-system=true） | `renderSystemMessageUpdate` 渲染 content＋具名 section 更新/删除框架；暂存至下一 assistant 前或末尾（TX:28–40；AM:1364–1399,1438–1439,1526） | `messages[].role:"system",content:[text,…]` | 文本双换行拼接；不逆解析框架，sections=None（M:20–42） | 确定性变换：位置延后、section 补丁成为字面文本 |
| `SystemMessage.toolsAdded/toolsRemoved`（非 native） | 依时序先 remove 再 set，Map 保持当前顺序；发送终态非空快照（TR:58–65；AM:1263–1265） | 顶层 `tools[]` | 放头部 system.toolsAdded；无 removed 历史（D:127–141） | 确定性变换：增量工具集 → 终态快照 |
| 同上（native） | mid-system 和 mid-tool 均开启且初始工具非空才启用；初始工具＋占位工具；同次同名 addition 抑制 removal（AM:1194–1203,1261,1384–1397） | 顶层 tools；后续 `tool_addition.tool.definition`、`tool_removal.tool.name` | 过滤名字为 `__pi_deferred_placeholder__` 的顶层工具；后续增删重建（D:127–131；M:20–42） | 确定性变换：保留有序增删但省去同次冗余 removal；保留名占位工具按名过滤 |
| `UserMessage.role/content` 字符串 | trim 只判空，不 trim 实际文本；非空时清洗 surrogate（AM:1400–1406） | `role:"user",content:string`；末条缓存可包装成 text 数组 | 字符串保持字符串；数组保持 blocks（M:68–77,108–113） | 精确往返：未清洗且未包装时；否则确定性变换（§4 C06/C09） |
| user text 块数组 | 逐块清洗，删 trim 空 text，全空消息删；**纯 text 数组仍为数组**（AM:1408–1436） | `content:[{type:"text",text},…]` | TextContent，textSignature=None（M:45–59,108–113） | 精确往返：剩余文本值/边界；确定性变换：过滤/清洗；textSignature 另见下行 |
| user image `data/mimeType` | vision 模型保留 base64 字节串和 MIME；非 vision 用占位文本替代并合并连续图片（TM:12–56；AM:1415–1423） | `{type:"image",source:{type:"base64",media_type,data}}` | `{data,mimeType}`（M:52–58） | 精确往返：vision；确定性变换：非 vision → §4 C03 占位文本，不验证 base64/MIME 内容 |
| 历史 assistant 整条消息 | error/aborted 整条跳过；剩余块全空也删（TM:192–205；AM:1493） | 无或 `role:"assistant",content:[…]` | 消息块数组（M:118–177） | 丢弃：被过滤的整条；其他按下面各字段 |
| assistant text `text` | 删 trim 空白；清洗 surrogate（AM:1443–1448） | `{type:"text",text}` | TextContent（M:130–133） | 精确往返：非空且不需清洗；否则确定性变换 |
| 所有请求 text 的 `textSignature` | user/system/assistant/toolResult 转换只取 text（TX:6–20；AM:153,158–162,1383,1410–1414,1443–1448） | 无 | None（M:45–49,130–133） | 丢弃（wire 不携带） |
| 普通 thinking 的 `thinking/thinkingSignature` | 同模型＝api/provider/model 三者相等；跨模型非空转 text，空删；同模型签名 trim 非空保留；无有效签名时非空文本默认转 text，allowEmptySignature=true 才发 thinking+空签名（TM:95–116；AM:1458–1482） | `thinking:{thinking,signature}` 或 text 或无 | thinking 原样重建签名；text 不还原成 thinking（M:130–139） | 精确往返：同模型有效签名且文本无需清洗；其余确定性变换，规则 C04；普通块的 redacted=false 在 decode 变为缺失 |
| redacted thinking | 跨模型删；同模型只发 opaque signature（TM:101–106；AM:1451–1456） | `{type:"redacted_thinking",data}` | 文本固定 `[Reasoning redacted]`，signature=data，redacted=true（M:141–146） | 丢弃：跨模型块；确定性变换：同模型文本固定化 |
| `ToolCall.id` / 结果 `toolCallId` | 仅跨模型调用 normalize：非法字符→`_`、截断64，后续结果同步映射；同模型不规范化（TM:82–88,129–142；AM:1326–1327） | `tool_use.id` / `tool_result.tool_use_id` | 原样取 id（M:97,149–153） | 精确往返：同模型或 ID 不变；确定性变换：跨模型规范化（不保证无碰撞） |
| `ToolCall.name/arguments` | name 普通原样、OAuth 固定表大小写；arguments 缺失时 `{}`（AM:124–131,1484–1489） | `tool_use.{name,input}` | name 原样并写 id→name 表；input 仅 object 可保留，否则 `{}`（M:148–155） | 精确往返：普通模式 object 参数；确定性变换：OAuth 名称/缺省 object；非 object 为 decoder 投影，不是协议限制 |
| `ToolCall.thoughtSignature/namespace` | thoughtSignature 跨模型先删；本协议 converter 两字段始终不输出（TM:129–132；AM:1484–1490） | 无 | None（M:154–155） | 丢弃（wire 不携带） |
| toolResult `role/content` | 连续结果合一条 user，各自一个 tool_result；无图 text 以单换行拼成串；有图保持块，纯图前插 `(see attached image)`（AM:137–183,1507–1522） | user.content 中 `tool_result.content:string/blocks` | 拆成逐条 toolResult；串→单 text 块（M:79–105） | 确定性变换：消息合并可拆，文本块边界不可恢复、纯图多占位文本 |
| toolResult `isError` 与图片 | 官方 v1.2.0 的 convertToolResult 对成功／错误结果均调用 convertContentBlocks；vision 图片保值保序，不因 isError 替换。非 vision 在 transformMessages 阶段降级（AM:1330–1335,137–182；TM:34–55） | `is_error`；`content` | isError 与图片块按 wire 原样解码（M:91–103） | 精确往返：isError 和 vision 图片；确定性变换：非 vision 与纯图占位，见 C08 |
| toolResult `toolName` | 不发送（AM:1340–1345） | 无；引用已有 tool_use_id | 从之前遇到的同 id tool_use 反查，后出现同 id 覆盖；找不到报错（M:87–90,149） | 丢弃：原 toolName；重建值是反查推导，原值与调用名不同不会保留；无配对时 decode 输入契约拒绝（已解析内容），不是 T |
| 孤儿 toolCall 的缺失结果 | 下一个 assistant/user 或收尾时，逐个补未配对结果，text=`No result provided`、isError=true；system 移到结果后（TM:159–185,192–232） | 合成 `tool_result` | 普通结果重建（M:79–105） | 确定性变换：新增结果；不是服务端原样恢复 |
| 所有消息 `timestamp`；toolResult `durationMs/details/usage/nestedCalls` | 不进入 wire（TY:541–635；AM:1378–1522） | 无 | timestamp=0、durationMs=None；其余不在 Rust 此结果结构中（M:36–42,69–73,96–103,161–176） | 丢弃（wire 不携带）；0 为 mock 占位，不是 pi 注入 |
| 历史 assistant `api/provider/model` | 仅用于同模型判定/effort 门控，不写每条身份（TM:95–99；AM:1495–1505） | 每条无；顶层 model 是本次目标 | 固定 api=anthropic-messages、provider=anthropic、model=本次请求值（M:163–165） | 丢弃：历史身份；decode 常量并不证明历史 provider 是 anthropic |
| 历史 assistant `usage/stopReason/responseId/responseModel/rawStopReason/errorMessage/endTurn/thinkingLevel/diagnostics/deferred/durationMs` | 除 stopReason 控制过滤外不写入（TM:202–205；AM:1438–1506） | 无 | usage=0、stopReason=stop，其余未设置（M:166–176）；Rust 未建模 diagnostics/deferred | 丢弃（wire 不携带）；不是精确往返 |
| 历史 assistant `providerThinkingLevel` | managed 模式、api=anthropic-messages、provider=当前 provider、值∈low/medium/high/xhigh/max 时，在该 assistant 前插 system effort；**无 model 相等要求**（AM:1499–1505,1559–1576） | `role:"system",content:[],output_config.effort` | 只保留最后一个 effort 到 options.reasoning，不回填各 assistant（D:46–64；M:168） | 确定性变换：wire 有历史值但当前 decoder 丢失逐条归属；实现缺口 |
| Tool `name/description` | 普通直接拷贝；OAuth name 按固定表改大小写（AM:101–131,1652–1654） | `tools[].name/description` | 原样（M:8–16） | 精确往返：普通；确定性变换：OAuth 名称 |
| Tool `parameters` | 非 strict 固定投影 `{type:"object",properties:p.properties??{},required:p.required??[]}`；strict 先 strictify 再展开 schema 并覆盖上述三字段（AM:1631–1650；CS:56–143） | `input_schema` | 原样 JSON（M:12–15） | 确定性变换：非 strict 丢根级其他键、nested 原样；strict 精确规则见 C11 |
| Tool `constrainedSampling` | JSON schema require 无法满足时抛错；prefer 可退非 strict；grammar 不走 grammar 转换。strict/eager/cache 由配置推导（CS:225–248；AM:1632–1658） | 可有 `strict:true/eager_input_streaming/cache_control`，无原配置 | constrained_sampling=None，忽略额外标记（M:8–16；V:100–107） | 丢弃：原配置；输入契约拒绝：require 不满足，非 T；wire 标记被忽略是 decode 投影 |

### options、身份与传输控制

| unified 字段 | convert 处理＋file:line | wire 字段 | decode 重建 | 终态 |
|---|---|---|---|---|
| 目标 `Model.id` / request model | 直接赋值（AM:1208） | `model` | request/info.model（D:94,100） | 精确往返 |
| 目标 `api/provider/baseUrl/compat/input/cost/contextWindow` | api/provider/compat 决定分支，baseUrl 交 SDK；其余影响图片/预算/费率（AM:577–588,1015–1108；TM:35；SO:18–21） | 无独立同名 body 字段；URL/头/形态可受其影响 | request 不重建模型目录 | 丢弃：模型目录原值；不是从 wire 内容可逆推出 |
| `maxTokens` | 原生 stream：显式值否则 model.maxTokens；streamSimple：先 context clamp，再可能预算调整/再次 clamp（AM:1213,970–1007；SO:18–21,36–46,92–107） | `max_tokens` | options.maxTokens（D:80–82） | 精确往返：原生显式值；确定性变换：默认/简单预算规则 C12 |
| `temperature` | 仅显式、thinkingEnabled 为假、非 managed、supportsTemperature 时发（AM:1245–1252） | `temperature` 或无 | options.temperature（D:82） | 精确往返：通过门控；丢弃：未通过时 wire 不携带 |
| 原生 `toolChoice` | 字符串包装 type，对象原样（AM:1309–1314） | `tool_choice` | type=tool对象保留，auto/any/none包装解回字符串（src/api/anthropic_messages/decode.rs:84–87） | E：原生字符串/具名工具对象JSON值及类型 |
| `thinkingEnabled/thinkingBudgetTokens/effort/thinkingDisplay` | managed 固定 adaptive/display/default summarized/drop_block，顶层 effort 固定 high，活动 effort 在末尾 marker；其他 reasoning 模型按 adaptive/budget/disabled 分支（AM:1271–1299,1575） | `thinking`、`output_config`、system marker | enabled→`budget:<u64预算>`（非法缺省1024），disabled→off；其他取最后 marker、否则顶层 effort、否则有 thinking 时 high；display/binding 不重建（D:46–65） | 确定性变换：只重建一种 reasoning 字符串；display/binding 已在 wire，mock 不读，属实现缺口 |
| simple `reasoning/thinkingBudgets` | 无 reasoning→thinkingEnabled=false；forceAdaptive→model map 或 minimal/low→low、medium→medium、其余→high；否则预算表与 context clamp（AM:941–1008；SO:69–107） | 上行 thinking 等终值 | 同上，不能恢复原 reasoning level/custom budgets | 确定性变换：C12/C13 |
| `cacheRetention/env.PI_CACHE_RETENTION` | 显式优先，再 env=long，再 short；none 不加标记；long 且支持才 ttl=1h（AM:69–92） | `cache_control` 位于 system、最后工具、最后 user/system 的末块 | 额外字段忽略；字符串被包装则按数组重建（V:8–26,46–82；M:68–113） | 确定性变换：缓存 policy→标记/包装，无法恢复 policy 与默认来源 |
| `sessionId` / `metadata.user_id` | session 门控见§1；metadata 仅字符串 user_id 可发，其他 metadata 不发（AM:624–635,1072–1084,1302–1306） | session 头 / `metadata.user_id` | D:70–96；实际路由保留info中的信号，见§1 | 精确往返：实际发送的 session 头值；确定性变换：metadata 投影及路由缺口；丢弃：其他 metadata 键 |
| `apiKey/headers` | API key/OAuth/Copilot/federation/custom client 分支，默认头→model.headers→options.headers，Copilot 在两者间合 dynamic headers（AM:1025–1108）；认证预检见 AM:316–369 | 认证及自定义 HTTP 头；不在 JSON | KeyID 规则见§1；不重建整套 headers/options.apiKey | 确定性变换：认证载体→KeyID；丢弃：未另建模的配置；transport 阻断：认证/路由不接受 |
| `interleavedThinking` / beta 配置 | `model.headers → options.headers` 的 anthropic-beta：null→[]，显式逗号分隔 trim 去空去重，后者覆盖；否则自动 features（AM:1113–1154,1579–1583） | SDK 参数 `betas`，实际 HTTP 序列化由 SDK 负责 | 无 betas 字段（V:8–26） | 确定性变换：功能配置推导；wire→mock 不读，非原始意图恢复 |
| `compat.allowedFallbackModels` | 非空投影为 `{model}` 数组（AM:1317–1319） | `fallbacks` | 不重建（V:8–26） | 确定性变换：provider/cost 已在客户端投影丢失；wire 模型列表又被 decoder 忽略 |
| `signal/timeoutMs/maxRetries/maxRetryDelayMs/fetch/env/client` | 交请求/重试/构造，不进 body（AM:607–661,1015–1108） | HTTP 行为而非语义字段 | 不重建 | 丢弃：原配置；transport 阻断：实际在内容前失败时 |
| `onPayload` | build 后调用；可原地修改，返回非 undefined 则替换 params 并强制 stream=true（AM:648–653） | 可以替换上述任意字段 | 按修改后的 wire 解码 | 确定性变换：调用者给出的结果；任意回调行为**未验证**，不在默认 canonical 等式内 |
| `onResponse/onProviderStreamEvent/telemetryContext/transport/websocketConnectTimeoutMs` | 前两者本地回调；AM 不读取其余语义作为 body 或 WS 选择（AM:639–661,690,696–697；SO:36–61） | 无对应 JSON 字段；本协议走 SDK HTTP response body | 不重建 | 丢弃：本地配置；不是支持 websocket 的证据 |
| `samplingParams`；simple `deferred` | Anthropic buildParams 不合并 samplingParams；streamSimple 不转发 deferred（AM:970–1008,1157–1323；TY:225–232,369–376） | 无 | 不重建 | 丢弃（wire 不携带） |
| 客户端常量 `stream:true`、OAuth system、placeholder | stream 恒 true；OAuth 身份块前插；native placeholder 注入（AM:204–208,1214,1219–1232,1261） | 常量、身份 text、占位工具 | stream 不校验也不保留；身份 text 按字面进入 system；placeholder 按名删（V:8–26；D:112–141） | pi 注入：这些不是用户原字段；decode 行为见 C02/C10 |

## 3. 回复方向字段映射表

mock 序列为 message_start → 每块 start/delta/stop → message_delta → message_stop（E:8–66）。pi 用 wire index 找块，文字/思考/签名追加，tool JSON 逐片解析；结束去掉 index/partialJson（AM:771–847）。下表精确往返均假定合法 object 参数、普通非 OAuth、完整有效 SSE；额外失败路径见§5。

| AssistantMessage 字段 | encode 事件/字段＋file:line | pi-ai 解析重建＋file:line | 终态 |
|---|---|---|---|
| `role` | 无独立 role，编码器输入就是 assistant（E:8–16） | 初始化 role=assistant（AM:582–588） | pi 注入：客户端固定身份 |
| `content` 块顺序 | 枚举 index，按输入顺序发（E:17–46） | start 到达顺序 push；wire index 只匹配 delta（AM:729–768,771–817） | 精确往返：本编码器顺序；不保证任意乱序 wire 会被排序 |
| text `text` | 空 text start＋一次 text_delta（E:19–22） | 起始 text＋所有 delta（AM:729–736,771–781） | 精确往返，包括空串；不会像请求侧过滤空白 |
| text `textSignature` | 不编码（E:19–22） | 不设置（AM:729–736） | 丢弃（wire 不携带） |
| thinking `thinking/thinkingSignature`，非 redacted | 空 thinking/signature start，thinking_delta，非空 Some(signature) 才 signature_delta（E:29–37） | 文本/签名累加，初始 signature 缺省空串（AM:737–745,783–814） | 精确往返：文本与已存在签名；确定性变换：缺签名→`""`；redacted=false→字段缺失 |
| redacted thinking | 只用 signature（缺省空串）发 redacted_thinking.data，无文字 delta（E:24–27） | 固定 thinking=`[Reasoning redacted]`、signature=data、redacted=true（AM:746–755） | 确定性变换：源 thinking 不保留；缺签名→空串 |
| toolCall `id/name/arguments` | tool_use start input={}；arguments object 序列化为 partial_json（E:39–46） | id/name/input；partial_json 累加经 parseStreamingJson，stop 再解析；OAuth 名称按 currentTools 大小写不敏感首个匹配还原（AM:756–768,795–805,835–845；JP:104–124；AM:125–131） | 精确往返：普通 object JSON；确定性变换：OAuth 工具名；分片字节不属于等价条件 |
| toolCall `thoughtSignature/namespace` | 不编码（E:39–46） | 不设置（AM:756–766） | 丢弃（wire 不携带） |
| image | Rust 允许的 Image 分支直接 Err（E:48–50）；TS AssistantMessage 合法类型没有 image（TY:565–567） | 无 image 输出分支（AM:722–768）；路由先完成 encode 才产生 SSE（`src/mounts/routing.rs:116–120`） | encoder 输入契约拒绝，非 T；下游 HTTP 客户端可观察 encode_failed HTTP500，不宣称 TS 合法回复存在 image |
| `responseId` | Some 值，否则 msg_mock（E:9–15） | message_start.message.id（AM:698–699） | 精确往返：已提供；确定性变换：缺省 msg_mock |
| `model` / `responseModel` | **源 model** 发 message_start.model；源 responseModel 不编码（E:14） | model 保持目标 model.id；wire model≠目标时另写 responseModel（AM:585–587,702–703） | pi 注入：model=目标；确定性变换：responseModel 条件推导；丢弃：源 responseModel 原值 |
| `api/provider` | 不编码（E:8–66） | 来自目标 model.api/provider（AM:585–587） | pi 注入，不固定为 anthropic provider |
| `usage.input/output/cacheRead/cacheWrite` | start 与 delta 都映射 input_tokens/output_tokens/cache_read_input_tokens/cache_creation_input_tokens（E:14,63,118–123） | start 缺值用0；delta 仅非 null 才覆盖（AM:713–720,861–873） | 精确往返：当前编码器提供的四计数 |
| `usage.cacheWrite1h` | Some 时 cache_creation.ephemeral_1h_input_tokens（E:124–128） | start 缺省0，delta 有值再覆盖（AM:717,875–879） | 精确往返：Some；确定性变换：缺省→0（是 cacheWrite 子集，不再计入 total） |
| `usage.reasoning` | Some 时 output_tokens_details.thinking_tokens（E:130–131），当前 start/delta 都发 | 仅 delta 读取，保留 undefined 或报告值（AM:881–884） | 精确往返：可选计数（output 子集） |
| `usage.totalTokens` | 不编码（E:118–133） | input+output+cacheRead+cacheWrite（AM:719–720,887–890） | 确定性变换：重算；不加 reasoning/cacheWrite1h 两个子集 |
| `usage.cost` | 不编码（E:118–133） | 根据请求模型费率或同 provider 允许 fallback 的费率重算；1h write 按2倍 input 费率（AM:704–721,890；`models.ts:1206–1225`） | pi 注入：源 cost 不可保留；精确公式见 C17 |
| `stopReason=stop/length/toolUse` | 分别 end_turn/max_tokens/tool_use（E:98–102） | 分别 stop/length/toolUse（AM:1667–1673） | 精确往返 |
| `stopReason=error` / `errorMessage` | refusal，explanation=errorMessage 或默认拒绝文本（E:103–109） | rawStopReason=refusal；explanation **truthy** 才保留，空串转默认；最终走 error 事件（AM:851–857,901–902,920–929,1674–1677） | 确定性变换：error 保留，缺/空 errorMessage→默认文本；内容仍保留 |
| `stopReason=pending/aborted/deferred` | 当前实现不是拒绝编码：统一 refusal，说明为 `unsupported stop reason for anthropic-messages: ` 加 `Pending` / `Aborted` / `Deferred`（E:111–113；`src/model/usage.rs:3–13`） | stopReason=error、rawStopReason=refusal、说明文本；非 signal abort 不重建 aborted（AM:851–857,926–929,1674–1677） | 确定性变换：三者都降为 error；这是 mock 策略，不是协议原生等价 |
| 非 error 的源 `errorMessage` | stop/length/toolUse 不编码说明；pending/aborted/deferred 生成固定 unsupported 说明而不用源错误文本（E:98–115） | 正常成功不设置 errorMessage；unsupported 分支按上行固定说明（AM:851–857,920–929） | 丢弃：源 errorMessage（wire 不携带）；unsupported 的新说明是确定性变换 |
| `rawStopReason` | 源值不用，按上述 stopReason 新算（E:53–65,98–115） | 来自 wire stop_reason（AM:851–854） | 确定性变换：stop→end_turn、length→max_tokens、toolUse→tool_use、其余→refusal |
| `timestamp/durationMs` | 不编码（E:8–66） | timestamp=Date.now；durationMs=单调时钟 elapsed 四舍五入且≥0，已有 duration 或消息早于流则不覆盖（AM:598；ES:99–132） | pi 注入；并非 timing 原样往返 |
| `providerThinkingLevel` | 源值不编码（E:8–66） | managed compat 时 options.effort??high，否则不设（AM:581–588） | pi 注入；与收到的 thinking 文本无关 |
| `thinkingLevel/endTurn/deferred/diagnostics` | 源值均不编码（E:8–66） | AM 不回填前三者；可新注入 strict fallback / input transformations diagnostics（AM:681–687,904–915） | 丢弃：源字段；pi 注入：新 diagnostics，不是原诊断往返 |
| `MockError.code/message/status` | 独立 encode_error：error SSE JSON 带 code/message，不带 status（E:69–77）；实际 registry 错误走 HTTP 错误体（`src/mounts/routing.rs:116–123`；`src/mounts/transport.rs:23–33`） | 若收到 error SSE，直接 Error(sse.data)，errorMessage 是整段原 JSON 文本；stopReason=error 或 signal 已 abort 时 aborted（AM:542–544,920–929） | 确定性变换：code/message→JSON错误串；status 不在 SSE。HTTP 失败属于 transport 阻断，SDK 异常文本未由此解析器规定 |

## 4. canonical form：确定性规则与测试裁决

**O18 / R 统一签名投影（owner裁决，现行）**：Anthropic接入同一出口但使用Opaque域：原生thinkingSignature/redacted data保留，不因其他协议的域限制全局剥签名。不用reply来源元数据触发请求侧TM；本页既有R块规则不变。 统一实现：`src/api/encode_thinking.rs:18–90`；跨源明文规则依据`api/transform-messages.ts:95–116`、`api/openai-responses-shared.ts:179,264–289`、`api/anthropic-messages.ts:1168,1443–1483`、`api/google-generative-ai.ts:374`→`api/google-shared.ts:200,234–266`。这只判目标签名支持域，不做基于reply身份的TM全量转换；历史summary-item降级草案被text规则取代。完整证据/18案复跑见`../o18-resolution.md`与图谱B2。

**Q-COMPOSE（owner 裁决演进）**：本节单轮 canonical 不蕴含全域幂等。固定 M/O，X=Q(C) 时复合期待为 `Q(B(X)) ≡ K(B(X))`；原 `Q(B(X)) ≡ X` 仅记录 rawIdempotent/rawDiffs。请求默认身份触发 TM:95–145 再降级，或发送前清洗所得空块在二轮被过滤，均按本节同一规则合成，不重标身份、不删字段。Q 无值仍记 domain finding，不计通过；Responses 的 OR:277–291 未截断 session header 可在 ByteString 边界被拒绝。统一定义与证据见 ../irreversibility-atlas.md 的 G5、../f4-p1-resolution.md。

定义 `Q(C,O,M)=decode(convert(resolveTranscript(C),O,M))`；默认关系不是“可恢复 C”，而是投影后的等价类。若 converter/decoder 抛错，Q 无正常值。`CA:19–24,192` 只实现默认 compat、maxTokens=64 的测试域；不能把它当所有 options/transport 的 oracle。R 的规则独立定义为 `parse(encode(A),targetModel,options)`，不从实测结果复制期望。

### 全规则汇编

| ID／方向 | 精确 canonical 规则 | 源码依据 |
|---|---|---|
| C01／Q 输入 | 旧 Context.systemPrompt 非空或 tools 非空时前插 system（timestamp=0）；provider stream 期待 TranscriptContext。transform 第一遍先把 null/undefined content 变 []，再图片降级、跨模型变换；第二遍才过滤错误历史和补结果。 | TR:10–33；TM:62–75,159–232 |
| C02／Q system | 默认：非空 contentText 按 system 顺序双换行连接；sections 用 Map 按名 patch，null 删除；tools 依序 remove→set；timestamp 原重放取首条，但 wire 不发。再将 content 与最终 section 值双换行连接。非 OAuth 空文本不发 system；decode 有 system 或有有效 tools 才建 timestamp=0 的头部。mid-system：后续文本用 `Removed system prompt section "name".` 或 `Updated system prompt section "name":\n\nvalue` 框架，暂存到下一 assistant 前/收尾，decode 不反解框架。 | TR:58–95,108–119；TX:6–40；AM:1234–1242,1378–1399,1438–1439,1526；D:112–142 |
| C03／Q 图片能力 | model.input 不含 image 时，user 图片→`(image omitted: model does not support images)`，toolResult 图片→`(tool image omitted: model does not support images)`；相邻图片只产生一份，前一 text 已等于该占位串也抑制紧随图片重复。含 image 时不降级。官方 v1.2.0 没有按错误结果专门替换图片的后续步骤。 | TM:12–56,73–75；AM:1330–1339 |
| C04／Q thinking | same＝api/provider/model 三等。redacted：same 保留 opaque，否则删。普通：same 且 signature truthy 先保留；其余 thinking 空白删，same 非空保留、cross 非空转 text。AM 再用 signature truthy 且 trim 非空判有效签名：thinking 空白且无有效签名删；无有效签名的非空 thinking 默认转 text，allowEmptySignature 时保留 thinking 并统一 signature=""；有效签名保留、文本清洗。redacted decode 文字固定 `[Reasoning redacted]`。 | TM:95–116；AM:1449–1482；M:134–146 |
| C05／Q ID 与缺失结果 | 只对 cross-model toolCall 执行 `id.replace(/[^a-zA-Z0-9_-]/g,"_").slice(0,64)`，后续 toolResult 同步映射；同模型不改。第二遍在新 assistant/user 或末尾关闭待处理调用，为缺结果的每个调用补 text=`No result provided`、isError=true 的结果，并把夹入 system 放到结果后；error/aborted assistant 整条删。 | TM:82–88,129–142,159–232；AM:1326–1327 |
| C06／Q 空白/Unicode/块形态 | user 字符串先 trim 判空，发送清洗后原串；user 数组先清洗再删 trim 空 text，仍保持数组；assistant text 先 trim 判空再清洗，空内容 assistant 删。清洗仅移除未配对 UTF-16 surrogate、保留合法对；用于已列出的文本路径及 system/thinking/toolResult 文本，不用于 name/description/参数 JSON/签名/图片数据。特别地 surrogate-only 字符串或 assistant text 可能清洗成已发送的空串。 | AM:153,158–162,1230,1239,1383,1400–1448,1469–1481；`utils/sanitize-unicode.ts:20–24` |
| C07／Q 结果拼接与配对 | 连续 toolResult 合成单 user，按原顺序一块一个结果；无图片时全部 text 按单换行拼接（不 trim、不删空 text）；有图保留 text/image 顺序，完全没有 text 才前插 `(see attached image)`。decode 串→一个 text 块；toolName 用此前同 id 最近写入的 tool_use 名称，不用原 toolResult.toolName；找不到报错。 | AM:137–183,1507–1522；M:79–105,148–153 |
| C08／Q 结果图片与错误标志 | 官方 v1.2.0 中 isError 仅映射 is_error，不改变内容转换。vision 的 `[image,"middle",image]` 保持三块原顺序和图片值；纯图结果在图片前补 `(see attached image)`；无图片时将文本以单换行拼接并清洗 surrogate。非 vision 先执行 C03。 | 官方 AM:1330–1335、137–182；TM:34–55,73–75 |
| C09／Q 缓存 | retention＝显式值，否则 env=long 时 long，否则 short；none 不注入，long 且支持才 ttl=1h。给顶层每个 system text、允许缓存的工具列表最后有效工具加标记；native placeholder 在初始工具之后，不抢其缓存位。conversation 只检查当前最后一条：user/system 的指定类型末块加标记，字符串包成单 text 数组；最后是 assistant 不向前找。此操作发生在 effort marker 插入前；后续 tool_addition 定义转换不传 tool cacheControl。decode 忽略标记，但保留字符串→数组的形态改变。 | AM:69–92,1197–1212,1219–1242,1255–1265,1395,1528–1552,1658；M:68–113 |
| C10／Q OAuth/工具变化/betas | OAuth key 为 includes(sk-ant-oat)，前插 system 文本 `You are Claude Code, Anthropic's official CLI for Claude.`；固定表工具名做大小写不敏感 lookup（表见 AM:101–119），不匹配则不改；作用于 tools、历史 tool_use、native tool_removal，不改 forced tool_choice.name。native 条件＝mid-system && mid-tool && 初始工具非空；后续同次同名 addition 抑制 removal；顶层加保留名 placeholder，decoder 按名过滤。betas：显式 header 后写覆盖，null→[]，字符串 split逗号/trim/去空/Set；未配置则按次序拼接并去重：OAuth→`claude-code-20250219`、`oauth-2025-04-20`；currentTools非空且!eager→`fine-grained-tool-streaming-2025-05-14`；model.reasoning且thinkingEnabled===true且(interleavedThinking??true)且!forceAdaptive→`interleaved-thinking-2025-05-14`；allowedFallbackModels非空→`server-side-fallback-2026-07-01`；managed→`mid-conversation-output-config-2026-07-01`、`thinking-binding-controls-2026-08-01`；native→`inline-tools-2026-09-15`。 | AM:101–131,190–208,1011–1012,1113–1154,1194–1203,1219–1232,1261,1309–1314,1384–1397,1488,1579–1583；D:127–131 |
| C11／Q schema/strict | 默认非 strict：只保留根 type=object、properties??{}、required??[]，nested 原样。strict：深拷贝 schema；每个 object 的所有 property 变 required，原可选且不允许 null 的 property 包为 anyOf[原schema,{type:null}]；additionalProperties=false；递归 properties/items/允许的 anyOf，最后根强制上述 legacy 三字段。拒绝 boolean、根非 object、tuple items、非数组/空 anyOf、含 object/array 的 anyOf、带 properties 却非 type=object、未知 required 名、非 string[] required、非法 properties/additionalProperties；公共不支持键集合为 $ref/$defs/definitions/allOf/oneOf/patternProperties/dependentSchemas/dependencies/unevaluatedProperties/propertyNames/contains/prefixItems/not/if/then/else。AM 还拒绝 minimum/maximum/exclusiveMinimum/exclusiveMaximum/multipleOf/maxItems/uniqueItems/minContains/maxContains/minProperties/maxProperties，minItems 仅0/1，format 仅 date-time/time/date/duration/email/hostname/uri/ipv4/ipv6/uuid。JSON-schema require 不支持就本地抛错；prefer 退非 strict；grammar 配置不走 grammar 编码。服务端400 invalid_request_error 且命中三个固定 strict-limit 文本时，只对 prefer 降级重建重试并加 diagnostic；已经开始的流不走此降级。 | CS:15–32,38–143,225–248；AM:664–687,1588–1618,1631–1658 |
| C12／Q token 上限 | 原生 stream：max_tokens=options.maxTokens??model.maxTokens。simple：`base=clamp(options.maxTokens??model.maxTokens)`；contextWindow<=0 时 clamp(x)=max(1,x)，否则 min(x,max(1,contextWindow-estimateContextTokens(context).tokens-4096))。仅非 adaptive 且请求 reasoning 时走下述预算分支：budget 默认 minimal1024/low2048/medium8192/high16384，custom 覆盖；xhigh/max 在预算表折为 high。`adjustedMax=min(base+budget,model.maxTokens)`（base 已由 buildBaseOptions 定义，不会走 helper 的 undefined 分支）；当 adjustedMax<=budget，budget=min(budget,max(0,adjustedMax-1024))；最终 max=clamp(adjustedMax)，thinkingBudget=min(budget,max(0,max-1024))。wire budget 用 `thinkingBudgetTokens \|\| 1024`，因此计算为0也发送1024。 | AM:970–1008,1213,1291–1294；SO:15–21,42–46,68–107 |
| C13／Q thinking/温度 | managed：总是 adaptive，display=显式??summarized，binding=drop_block，顶层 effort=high；满足历史门控的 assistant 前插历史 effort，最后插 active=options.effort??high。非 managed 且 model.reasoning：thinkingEnabled 真时 adaptive（forceAdaptive）或 enabled（预算）；显式 false 且 off map!==null 发 disabled；否则省略。simple adaptive level 优先字符串 model map，minimal/low→low，medium→medium，其他→high。temperature 仅显式 && !thinkingEnabled && !managed && supportsTemperature。decode 最后 marker 优于顶层 effort；enabled/disabled 再覆盖为 budget/off；否则 thinking 存在且没 effort 才 high。 | AM:941–1008,1245–1252,1271–1299,1499–1505,1559–1576；D:46–65 |
| C14／Q options/占位 | metadata 只投影字符串 user_id；toolChoice具名对象保留JSON类型（src/model/request.rs:26），auto/any/none解包装；session 头优先级 affinity→session-id；独立 info 再回退 user_id，实际路由传 decoder 的 session_signal，options.sessionId仍仅表示已收到的session头；所有 history 身份与元数据按§2的占位重建。header/default/provider/options 合并、auth 与 session 门控见§1/§2；fallback 仅投影 model 列表；onPayload 返回值覆盖请求但 stream 强制 true。 | AM:293–369,624–656,1025–1108,1302–1319；D:70–105；M:161–176；`src/mounts/protocol.rs:66–75`；`src/server.rs:100–119` |
| C15／R 内容与身份 | 文本保留；普通 thinking 缺签名→空串，redacted 文本固定；参数 object JSON 分片解析；textSignature/thoughtSignature/namespace 不编码。身份=目标 api/provider/model；源 model 进入 wire，并仅在与目标不同才成为 responseModel；responseId 缺省 msg_mock；时间与 managed effort 由 pi 盖章。 | E:8–50；AM:581–598,698–768,771–847；ES:97–129 |
| C16／R stop/error | stop→end_turn→stop；length→max_tokens→length；toolUse→tool_use→toolUse；error→refusal→error；pending/aborted/deferred 经 mock refusal 降级为 error。errorMessage 空/缺失→`The model refused to complete the request`。额外 wire pause_turn/stop_sequence→stop，sensitive→error+Provider stopped with: sensitive，未知 stop_reason 抛错；rawStopReason 保留 wire 原因。error SSE 则 errorMessage=原 data 字符串；signal 已 aborted 时最终 stopReason=aborted。 | E:98–115；AM:542–544,851–857,894–929,1663–1688 |
| C17／R usage/费率 | 四项计数直传；cacheWrite1h 缺省0；reasoning 仅在 delta 报告时设。total=input+output+cacheRead+cacheWrite。费率选择：允许的同 provider fallback.cost 存在才换模型，否则目标费率；按 input+cacheRead+cacheWrite 选择严格超过 threshold 且最高 threshold 的 tier。cost.input/output/cacheRead=对应rate×计数/1e6；cacheWrite=(cacheWriteRate×(cacheWrite-cacheWrite1h)+inputRate×2×cacheWrite1h)/1e6；total cost 为四项和。 | E:118–133；AM:704–721,861–890；`models.ts:1206–1225` |
| C18／R 帧/修复 | SSE CR/LF/CRLF 分行，空行 flush，注释跳过，data 多行用单换行连接，EOF flush，释放 reader。只接受六个事件名；error 直接抛原 data；其他名字跳过；按 JSON 中 type 分派。先 JSON.parse，失败才修复字符串中裸控制字符/非法反斜杠转义再 parse；tool JSON 再尝试 partial-json、修复后 partial-json，最后{}。已见 start 但没 stop 才报 incomplete；无 stop reason 另报错。收到 message_stop 不立刻跳出循环，后续识别事件仍可消费。 | AM:391–569,696–899；JP:3–124 |
| C19／Q/R 观察点 | strict=require不满足、孤立tool_result、assistant image无正常canonical值，属于输入契约拒绝非T；HTTP400/500是下游观察，已收内容后error SSE/未知stop/缺终态属于流内失败，保留部分内容，不笼统T。 | CS:225–248；M:87–90；E:48–50；AM:542–544,898–929；src/mounts/routing.rs:116–123 |

### 与既有文档、canonical 和实际路由对账

以下“旧稿”指本次覆盖前的同名文档，保留其旧节号/命题以便审阅；裁决均依据上述客户端源码，不把不一致隐去。

| 既有命题／测试位置 | 裁决与证据 | 处理状态 |
|---|---|---|
| 旧稿§b T6：“user 无 image 数组折为字符串” | **旧稿错**。AM:1408–1436 保持数组；CA:35–38 此处正确。真正调用 convertContentBlocks 的是 toolResult，不是 user（AM:1343）。 | 本稿纠正；实测探针确认两段 user text 仍是两块。 |
| 旧稿§b T8：“末条 user/system”暗含向前找 | **旧稿不精确**。AM:1530 只取最后一条；assistant 收尾不回溯。CA:89–97 也会在 assistant 处停止，但会越过其自造 toolResults 项，不能当通用逐行复刻。 | 本稿固定为 C09；未更改 canonical。 |
| 旧稿§c：“流必须含完整 message_start…message_stop” | **旧稿错**。AM:566 只检查 sawStart&&!sawEnd，AM:898 另查 pending。仅 message_delta(end_turn)+message_stop 可成功，探针已验证。 | 不再宣称 start 必然要求。正常 encoder 仍总发完整序列。 |
| 旧稿§a 工具 input_schema“原样 JSON” | **就原 Tool.parameters 而言旧稿错**；就 wire→decode 而言 M:12–15 原样是对的。客户端非 strict 已投影根级三字段（AM:1639–1650）。CA:195–199 与 `tests/canonical-reply-projections.test.mjs:12–25` 的默认非 strict 断言正确，但不覆盖 strict compat。 | 本稿明确两段边界，不能把根 metadata 丢失归咎 decoder。 |
| CA:136–139 错误图片结果：先收所有文字、末尾补一份 note | **canonical 错、源码对**。AM:1333–1343 每图原位替换；双图夹文字时实际 `note\nmiddle\nnote`，CA 得 `middle\nnote`。 | 已运行源代码 payload 探针确认；文档修正，不改 tests。 |
| CA:154–161 有图片结果直接映原数组 | **纯图片场景 canonical 错**。AM:174–180 前插 `(see attached image)`；CA 不补。 | 源 payload 探针确认；待另项修测试。 |
| CA:33,37,46,55,58,131,178 不做 surrogate 清洗 | **canonical 非全集 oracle**。AM 的各文本发送路径用 sanitizeSurrogates；`utils/sanitize-unicode.ts:20–24` 删除未配对代理项。Rust 不能表示未配对 surrogate 不等于 JS 客户端不能接收此输入。 | 探针确认 `x\ud800y`→`xy`；旧稿“语料避开即恒真”的表述撤销。 |
| CA:149,158 toolName 缺配对时用空串 | **canonical 错**。实际 decoder M:87–90 返回错误，不是成功空名。 | 不再把此输入列为可往返；仅记录，不改实现/测试。 |
| CA:20 固定 collapse=false；CA:192 固定 maxTokens=64 | **限定测试域时正确**；不能推广到 mid-system/native-tools/strict/OAuth/managed effort/其他 options。`tests/models-shared.mjs:24–26` 的 harness 正好默认64，不能拿此常数定义协议。 | 本稿按源码分支完整记录；超出测试域均不宣称 fixture 已覆盖。 |
| 旧稿§b T12 把 providerThinkingLevel 一概说成 wire 不存在 | **旧稿错**。AM:1499–1505,1563–1576 在 managed 模式携带历史 marker；D:46–64 只取最后值，不给历史助手回填。 | 记为 wire 已携带但 decoder 信息归属缺口，不标“协议不可携带”。 |
| 旧稿§d：metadata.user_id 可作为实际请求 sessionSignal | **已修复端到端转发**。D计算info，protocol保留session_signal，server传给脚本，不伪造options.sessionId。 | 实际客户端metadata-only与显式头优先的回归见tests/protocol-regressions.test.mjs。 |
| ML:139–149 从 got 复制 responseId/errorMessage | **作为独立验收 oracle 不合格**。正确期望应由 E:9、E:103–113 和 AM:1674–1677 独立推出；复制 actual 会掩盖错误。ML:130–132 根据 source.model 预测 responseModel 是正确的（AM:702–703）。 | 本稿给出独立规则；未修改测试。 |
| ML:46–54 reply ignores 包含 totalTokens/cost/rawStopReason 等 | **“矩阵通过＝这些字段正确”不成立**。被忽略字段没有被该比较验证；AM:719–721,851–854,887–890 仍规定其确定行为。 | 以 C16/C17 为契约，需专门断言补覆盖。 |
| 旧稿 L8：未列出的 block“会跳过或报错” | **需逐类限定**。AM:722–768 仅处理 text/thinking/redacted/tool_use；fallback 首块可跳过、已有输出后抛错；其他不识别 block_start 不产生块。不能无依据声称 compaction/server_tool_use 都会抛错。 | 本稿按分支描述；厂商额外块语义未验证。 |

### 追加 oracle 差异登记（定义冻结复审）

| 报告ID / 测试 | 当前差异 / 正确规则 / 后续归属 |
|---|---|
| C24 / ML:130–149 | fill未清理text/tool签名，但E:19–46没有发射，实际是L；按§3独立投影，不可全局删除所有协议签名；W-06候选。 |
| C25 / ML:130–149 | unsupported三终态未按E:111–113映射refusal/error；error缺/空文案需依AM:851–857,1674–1677默认，不从got复制；W-06候选。 |
| C27 / ML:130–149 | redacted源thinking必须固定[Reasoning redacted]，保留opaque data签名，不是保留任意原文字（E:24–27；AM:746–755）；W-06候选。 |

## 5. 不可逆声明与 transport 边界

### Options 槽位镜像补充（本轮裁决）

- 原生具名toolChoice对象按JSON值/类型E，auto/any/none包装解回原字符串（AM:284,1309–1314；src/api/anthropic_messages/decode.rs:84–87）。
- strict wire true与schema终值不唯一表示prefer/require；原策略不可逆，schema照读，不发明strict槽（AM:1633–1657；CS:225–251）。grammar配置在该convert中不产生custom工具，走function/legacy schema；samplingParams不在buildParams读取范围（AM:1157–1323），与types.ts:225–232的adapter应用约束一致。完整证据见../slots-mirror-pi.md。


本页所有encoder补发/decoder补读及transport实现建议仅为 **W-07候选**，当前映射不变；实验oracle/覆盖建议为W-06候选。新的签名降级或模型扩容仍须另批，本轮只统一定义。

### 不可逆不是一种故障

- **客户端已丢失**：Q 中文本块拼接、system section 名和补丁历史、非 strict schema 根键、所有历史时间/usage/responseId 等元数据、内容签名与工具 namespace，没有足够 wire 信息恢复；两种原输入可得到同一 wire（C02/C06–C11；AM:137–183,1378–1522,1639–1650）。canonical 只定义等价类，不恢复这些差别。
- **客户端确定降级**：非 vision 图片、跨模型思考、unsigned thinking 和 cross-model ID 规范化均按 C03–C08；“确定性”不等于单射，ID 规范化无碰撞保护（TM:12–56,95–145；AM:1326–1345,1458–1482）。
- **wire 有而 mock 未建模**：历史 effort 的逐条归属、thinking.display/binding、betas/fallbacks 等已发字段。不得叫 wire 天生无法表达（AM:1215,1271–1295,1317–1319,1563–1576；D:46–65；V:8–26）。这些属于表中声明的高级字段投影范围；metadata-only session 不再在此清单中，现已由info转发到脚本。
- **回复侧独立损失**：R 丢源 metadata/签名字段；重算 total、注入目标身份/费率/时间；redacted 文字固定；unsupported stop 降级。四项 usage、可选 reasoning/1h计数、responseId 与普通签名并非普遍不可逆（E:8–66,98–133；AM:581–598,698–890）。

### 失败阶段与观察点（仅解析前 transport 失败为 T）

Q/R组装的输入拒绝（strict require、孤立结果、assistant image）没有合法正常wire结果，必须明记拒绝，不归D/L/P/T，也不新增第六类。外部HTTP调用者可观察400/500，但不能用其观察点覆盖原组装输入拒绝；同样流内错误已有partial content时不是T。

| 阶段 | 阻断、可观测结果与证据 |
|---|---|
| pi 本地预检/组装 | 无 key/允许认证头且无 federation 时抛 No API key；require strict 不能满足时为发送前输入契约拒绝（非T）；缺认证是环境前置失败，不能据此推断内容结果。stream 内 catch 转 error，streamSimple 入口认证可同步抛（AM:325–326,607–613,920–929,966–968；CS:225–248）。 |
| HTTP 路由/解码 | 未知路径404、非POST405、未挂载协议404、body/role/block不合法或找不到 tool_use 为decode输入契约拒绝、对下游返回400，不归canonical T（`src/mounts/routing.rs:24–59,78–80`；D:25–54；M:59,87–90,123–125,158）。V:8–11 要求 model/messages/max_tokens，**不读取也不校验 stream:true**。 |
| KeyID | 非 mount 且路由取到的 KeyID 为空时401；decoder 连头也没有时可更早400；mount 会注入空认证头使 decode 继续，但原 KeyID 仍空（`src/mounts/routing.rs:65–80`；`src/server.rs:100–113`；D:28–36）。pi 接受 cf-aig-authorization 并不保证 mock 路由接受它。 |
| 脚本执行/回复编码 | registry 错误发带原 status/code/message 的 HTTP JSON；不支持的 Image 回复是encoder输入契约拒绝，先 encode Err 再对下游 HTTP500，不归组装T，不会先发半截 SSE（`src/mounts/routing.rs:116–123`；`src/mounts/transport.rs:23–33`；E:48–50）。 |
| 请求取消/网络/HTTP错误 | options.signal/timeout/retry 控制 SDK 请求；内容之前失败属于 T，不能推断内容结果。重试可能使同一语义请求发多次（AM:639–661）。SDK 对非2xx错误的具体 message 格式未验证，不以 error SSE 规则替代。 |

**无 response body** 在内容解析前抛错，属于 transport 阻断（AM:534–535）。**已收到内容后的流内失败不标 T**：无 stop reason（AM:898–899）、已见 start 缺 stop（AM:566–567）、未知 stop reason（AM:1685–1687）、中途 fallback（AM:723–725）、error SSE（AM:542–544）都会走 catch，保留已收内容并清理 index/partialJson，返回 error/aborted 与 errorMessage（AM:920–929）。这些错误可能在已收到部分内容后发生，不能一概声称“内容完全未知”；即使尚未产出可见text，只要已进入事件/内容解析链，error SSE或非法事件仍是流内失败；仅HTTP/网络等在内容解析前阻断才为T，而不把错误类型整体固定成T。signal abort 最终覆盖为 aborted；普通 refusal 仍是 error，而非 transport 不通（AM:894–902,926–928）。

**未验证边界**：SDK 认证交换、默认头和最终 query 拼写；真实 Anthropic 服务是否接受各 compat 扩展；任意 onPayload 改写；额外厂商 block 的完整语义。本稿没有调用真实厂商，也没有把这些写成已验证事实（AM:349–369,648–656,722–768,1015–1108）。

## 6. 覆盖与 fixture 索引

### 覆盖账

| 领域 | 已核对范围与证据 | fixture／缺口 |
|---|---|---|
| 类型全集 | 四种 Message；text/thinking/image/toolCall；system sections/tools；ToolResult details/usage/nestedCalls；Assistant 全部身份/可选元数据（TY:414–469,541–639,739–758）；§2/§3 逐项映射 | Rust 不建模的字段仍在表中记客户端丢弃，未假装存在于 Rust。 |
| 转换函数 | 逐函数阅读 resolveCacheRetention/getCacheControl、convertContentBlocks、compat/auth/federation/client、betas/buildParams、normalizeToolCallId、convertToolResult/convertMessages、effort insertion、convertTools/mapStopReason（AM:69–369,941–1688）；同时读 TR/TM/TX/SO/CS | 未凭旧稿结论填表；C01–C14 汇总。 |
| 流解析函数 | flushSseEvent/decodeSseLine/nextLineBreakIndex/consumeLine/iterateSseMessages/iterateAnthropicEvents，以及 stream 每个 start/delta/stop/message_delta/catch 分支（AM:391–929）；JP 全部 JSON 修复与部分解析（JP:3–124） | C15–C18；不把 mock 一次 delta 的编码习惯推广为 parser 限制。 |
| mock decoder/encoder | D:25–143；M:8–178；V:8–107；E:8–134；实际路由/脚本 session 传递 | metadata session路由缺口已修复并经真实客户端回归；历史源码行号仅作定位导览。 |
| canonical | CA:19–200 全函数；ML:46–54,79–100,130–151 的回复投影 | 默认域部分正确；图片/Unicode/缺配对与 actual-copy 缺口详见§4裁决表。 |

### fixture 文件与断言位置

上游 fixture 路径以下相对 `<pi-mono>/packages/ai/test`；只作为源码核对后的索引，不把“文件存在”当成本次执行通过。

| fixture | 对应分支／证据位置 | 本次状态 |
|---|---|---|
| `src/api/anthropic_messages/decode_tests.rs:17–82` | full conversation：system/tools、user、signed thinking、text/toolCall/toolResult、默认身份/零usage | `cargo test anthropic_messages` 已通过。 |
| `src/api/anthropic_messages/decode_tests.rs:84–122` | effort markers；孤立 tool_result 明确拒绝 | 同上。 |
| `src/api/anthropic_messages/encode_tests.rs:52–141` | text SSE、thinking/signature/redacted/toolCall、refusal、独立 error SSE | 同上；独立 encode_error 的测试不证明实际路由用 error SSE。 |
| `tests/canonical-reply-projections.test.mjs:12–25,72–85` | 默认 Anthropic legacy schema 投影；十协议非零 cache corpus 存在 | 本次 Node 测试通过；不证明全部 reply usage 均已真实解析。 |
| `tests/canonical-ten.test.mjs:17–28` | 十协议 streamer/model/canonical 注册 | 本次 Node 测试通过；不是 Anthropic 所有 canonical 规则的专项断言。 |
| `anthropic-sse-parsing.test.ts:113–357` | provider event 顺序、model relabel/fallback 费率、中途 fallback、onPayload 强制 stream、beta、input transformations | 源码已核对 AM:648–915；本次未执行上游测试。 |
| `anthropic-sse-parsing.test.ts:358–700` | JSON修复、start自带内容、refusal/sensitive、delta无usage、未知事件 | 源码已核对 AM:391–569,729–890,1663–1688；本次未执行上游测试。 |
| `anthropic-empty-thinking-signature-compat.test.ts:82–133` | 默认空签名降 text、有签名空 thinking、allowEmptySignature、跨模型 | 源码已核对 TM:95–116/AM:1458–1482；未执行上游测试。 |
| `anthropic-mid-conversation-effort.test.ts:92–195` | 历史 marker、默认high、跨provider/legacy不造marker、非managed顶层effort/betas | 源码已核对 AM:1271–1299,1499–1505,1563–1576；未执行上游测试。 |
| 历史 fork 内存 Node 探针 | 曾验证旧 fork 的错误图片转文本等行为 | 只属于旧 fork；不作为当前官方 C08 的通过证据。当前回归见 `tests/anthropic-official-reference.test.mjs`，固定断言官方 wire、Rust 解码及独立 canonical。 |

### 本次验证与范围

- `cargo test anthropic_messages`：7 passed，0 failed（3 decode＋4 encode）。
- `node --test tests/canonical-reply-projections.test.mjs tests/canonical-ten.test.mjs`：12 passed，0 failed。
- 内存源码探针：上述5组行为断言通过；暴露的 canonical 偏差作为**现有缺口**记录，未静默修改 tests。
- 仅重写此文档；未修改只读 pi-mono、Rust、tests 或 Google 文档。按本次权威输出路径限制，Google 的完整重写不属于本文件交付，不以 Anthropic 文档冒充 Google 规格。
- 工作目录没有 Git 仓库元数据，`git status --short` 报 not a git repository；本次未执行 add/commit，无法提供 Git diff/index 证明。引用/六节结构检查结果见本次验收报告；不把引用范围存在检查当作内容正确性的替代。
