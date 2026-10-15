# Mistral Conversations：组装对照协议

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 1. 概览

唯一客户端权威根：`<pi-mono>/packages/ai/src`（pi-ai @1.2.0，只读）。MI=`api/mistral-conversations.ts`，TM=`api/transform-messages.ts`，TR=`utils/transcript.ts`，TX=`utils/text.ts`，CS=`api/constrained-sampling.ts`，SO=`api/simple-options.ts`，ES=`utils/event-stream.ts`；以下别名均为 file:line。`src/**`、`tests/**` 相对 mock-with-pi。

本页取代旧 `bedrock-mistral.md` 的 Mistral 部分，Bedrock 唯一权威为 `bedrock.md`。Q＝unified→pi convert→wire→mock decode；R＝unified→mock encode→wire→pi parser。E＝精确 JSON 值；D＝明确的确定性投影；L＝当前映射不发源信息；P＝pi 身份/时钟/费率注入；T＝内容解析前 transport 阻断。wire已发未读是D实现缺口，不是L；输入契约拒绝不产生正常 canonical 值，不标T，不增加第六类。默认无 onPayload 替换；该 hook 可改整个payload，改写后不能套默认公式（MI:347–348）。

| 项目 | 真实组装与证据 |
|---|---|
| 路径 | baseUrl pathname 末尾补 `/` 后相对追加 `v1/chat/completions`，保留原prefix；POST JSON，Accept:text/event-stream（MI:298–318）。 |
| 认证/KeyID | 默认 Authorization:Bearer apiKey；model.headers 后 options.headers 覆盖，null删除；mock以实际Bearer值为KeyID，不验证厂商token（MI:355–384；src/api/mistral_conversations/decode.rs:39–54）。 |
| session | retention非none且sessionId truthy时发 prompt_cache_key 和自动x-affinity；显式x-affinity覆盖抑制自动头。mock body key优先于header；body/头终值可能不同（MI:355–384,527–552；src/api/mistral_conversations/decode.rs:14–35）。 |
| wire | stream:true，model/messages/tools；camelCase经JSON序列化映射为max_tokens/tool_choice/reasoning_effort/prompt_mode/prompt_cache_key及tool_calls/tool_call_id（MI:386–430,527–552）。 |
| 回复 | SSE data行可多行合并，忽略空data，[DONE]结束，其余JSON必须含choices数组；不是顶层reasoning_content格式（MI:510–525,644–704）。 |
| 当前路由 | chat路径先选择Completions，再按mount配置、x-affinity或body特征条件选择Mistral；不是所有普通chat无条件归Mistral，也不是“路由待接”（src/mounts/protocol.rs:116–118；src/mounts/routing.rs:40–46；src/mounts/selection.rs:7–51）。W-08裁决W06-F2：canonicalQ以路由已选择Mistral为前置条件；retention=none且无其他特征时，锁定MI:298–318,355–384,527–552的请求与OCC可重合，调用方须通过专用mount的prefer=mistral-conversations（CLI --prefer）显式声明，不能靠保留缓存信号或猜model来识别。历史失败与补验证见../w08-match.md。 |

## 2. 请求方向字段映射表

先collapse system并去leading system，再TM图片降级/跨模型处理/删除error-aborted历史/补孤儿结果，最后Mistral发射（MI:279–281,530–539,810；TM:12–57,95–145,167–232）。schema/name/description和call arguments不能因文本净化规则而被任意改写。

| unified字段 | convert / wire | 当前mock重建 | 终态 / 源码 |
|---|---|---|---|
| model | body.model | request.model | E；MI:532；src/api/mistral_conversations/decode.rs:8–13 |
| system content/sections/tools | 折叠content/sections与工具增删快照，文本非空才发system；tools顶层独立发 | 文本System；有tools而首消息非System时合成空文本承载System；schema/name/description/order保留 | D：历史折叠；E：wire工具快照（不含未读strict）；MI:777–824；TR:58–119；src/api/mistral_conversations/decode_messages.rs:113–128；W-07已实施 |
| user string/text/image | 字符串含空串净化；数组text/image_url data URL保序；非视觉图片先TM占位，零块跳过 | 单text折串；图文保序，图片只支持合法data URL，非data URL拒绝 | D；MI:812–839；TM:12–57；src/api/mistral_conversations/decode_messages.rs:24–35；src/api/mistral_conversations/decode_content.rs:16–41 |
| assistant text/thinking | TM先将跨模型非空且非redacted thinking转text；MI先trim判空，再sanitize后逐块发content text/thinking数组；不trim实际非空原文 | content chunk逐块保序，不合并相邻text/thinking；thinking无签名 | E仅限块类型未被跨模型转换、未过滤、未净化且消息边界不合并的文本域；thinking→text及清洗/过滤为D；TM:95–117；MI:840–858；src/api/mistral_conversations/decode_messages.rs:50–83 |
| toolCall id / result id | sameModel（api/provider/model全等）保持原ID；仅cross-model经9字符normalizer，结果同步 | 同模型原ID；跨模型规范后ID，不能保证恢复原ID | 同模型ID E；跨模型ID D；MI:238–267；TM:95–98,129–151；§4 G29 |
| toolCall name/arguments/位置 | arguments JSON.stringify(block.arguments或{})，工具独立tool_calls；content与calls原交错不发 | content后追加calls，JSON object参数 | name/有效object args E；位置D；MI:860–874；src/api/mistral_conversations/decode_messages.rs:85–88 |
| toolResult text/images/isError/name | text净化后join再trim；error加[tool error]前缀；可发视觉图片 | 按wire顺序恢复text及data URL图片（image_url字符串，兼容已有url对象）；isError=false，不从前缀猜布尔；ID/name读取 | D：文本聚合/前缀与isError丢失；E：有效视觉图片及wire图文顺序；MI:875–920；src/api/mistral_conversations/decode_messages.rs:94–109；decode_content.rs:16–40；W-07已实施 |
| tools parameters/constrainedSampling | strict算法后schema终值，strict默认false，可按配置覆盖 | schema保留，原constrainedSampling和strict标记不重建 | D schema/已发strict投影；原配置L；MI:777–805；CS:56–143,225–248 |
| options max/temperature/toolChoice/reasoning/session | 显式值及Simple预算，effort优先prompt_mode，对象toolChoice保留JSON值及类型（src/model/request.rs:26）；body key优先x-affinity | options终值 | D（显式合法数值可E）；MI:350–430,527–552；src/api/mistral_conversations/decode.rs:14–35 |
| text/thinking/tool签名、redacted、namespace | chunks/工具不发独立签名等 | None | L；MI:840–874 |
| 历史assistant身份及usage/cost/stop/responseId/responseModel/levels/error/rawStop/endTurn/diagnostics/deferred；消息timestamp、toolResult duration/details/usage/nestedCalls | 仅用于转换条件，不发原记录 | assistant api/provider固定本协议，model取请求；usage0/stop/timestamp0，其余None | 原信息L，mock默认D；MI:812–920；src/api/mistral_conversations/decode_messages.rs:50–110 |

## 3. 回复方向字段映射表

当前encoder逐块发delta，再finish、usage与[DONE]；text/thinking用delta.content，工具index递增（src/api/mistral_conversations/encode.rs:6–42）。不能把Q逐chunk保序规则推广成R相邻块不合并。

| unified字段 | encode / parser重建 | 终态与证据 |
|---|---|---|
| text/thinking/边界 | content string或thinking chunk；先sanitize再跳空，相邻同型无分隔合并，类型交错保留；不读顶层reasoning_content | D；MI:644–704 |
| toolCall id/name/arguments | 按index或callId找slot，缺id或字符串null可derive；name只在建块时取首段，后续只累积arguments并增量解析JSON | 当前encoder单帧完整name、合法非空ID及有效object args域可E，不对所有R套Q normalizer；一般wire D，不拼接后续name；MI:710–749；src/api/mistral_conversations/encode.rs:18–20 |
| textSignature/thinkingSignature/tool thoughtSignature/redacted/namespace | encoder不发、parser不恢复 | L；MI:644–745；src/api/mistral_conversations/encode.rs:12–20 |
| usage input/output/read/total | wire prompt=input+read，cached_tokens=read；parser clamp缓存，input=prompt-read，total truthy否则计数和 | D（有效域原值）；MI:555–573,616–628；src/api/mistral_conversations/encode.rs:36–37 |
| usage write/1h/reasoning | 不发源字段；write重建0，其余缺失 | 源L，派生常数0是D；MI:616–628 |
| responseId | encoder缺省mock-mistral；parser首truthy id | 有值E，缺值D；MI:609–614；src/api/mistral_conversations/encode.rs:9 |
| stop/error | toolUse→tool_calls，length→length，error→error固定server error文案，aborted→abort→error，deferred→stop；pending拒绝 | D；MI:936–951；src/api/mistral_conversations/encode.rs:6–9,28–36；不因当前策略发明deferred协议语义 |
| rawStopReason | 源值不发，重建choice.finish_reason | D；MI:633–636；src/api/mistral_conversations/encode.rs:28–35 |
| responseModel/endTurn/levels；成功errorMessage | encoder无对应发射；parser不读model成responseModel | L；MI:609–745；src/api/mistral_conversations/encode.rs:6–42 |
| api/provider/model、timestamp/durationMs、cost | 目标身份/本地Date.now及计时；模型费率算成本 | P；MI:218–235,627–628；ES:97–129 |
| image / pending | encoder返回错误，无正常wire | 输入契约拒绝，非T；src/api/mistral_conversations/encode.rs:6–7,21–24 |
| MockError | HTTP JSON错误形态与SSE成功流区分；SSE自身要求choices数组 | HTTP状态/错误包装不是源errorMessage E；src/api/mistral_conversations/encode.rs:41–43；MI:510–525 |

## 4. canonical form

**O18 / R 统一签名投影（owner裁决，现行）**：Mistral不承载thinkingSignature：有签名thinking先转无签名text，空白/redacted删除，之后按既有清洗/相邻同型合并规则；无签名thinking仍发thinking chunks。原签名L，块类型投影D。 统一实现：`src/api/encode_thinking.rs:18–90`；跨源明文规则依据`api/transform-messages.ts:95–116`、`api/openai-responses-shared.ts:179,264–289`、`api/anthropic-messages.ts:1168,1443–1483`、`api/google-generative-ai.ts:374`→`api/google-shared.ts:200,234–266`。这只判目标签名支持域，不做基于reply身份的TM全量转换；历史summary-item降级草案被text规则取代。完整证据/18案复跑见`../o18-resolution.md`与图谱B2。

固定模型/options且convert、decode/encode、parser均成功时定义canonicalQ/R。P的本地时钟不从actual复制成expected；输入拒绝无正常canonical值。以下是G27–G36完整汇编及D14补充，不用其他协议页或测试函数代替。

| 缺列ID / 方向 | 精确canonical规则 | 源码依据 |
|---|---|---|
| G27 / Q system/tools | content按顺序双换行折叠，sections同名覆盖/null删除；工具remove→add得到快照，schema经strict clone（各object全required/additionalProperties=false，原可选非nullable包anyOf加null，递归properties/items/标量anyOf；CS不支持域require抛、prefer退原schema）。tools顶层独立发；W-07起有非空tools时挂已有首System，否则插入content=""的leading System；tools为空不合成。wire工具schema/name/description/order精确保留，原工具增删历史及strict意图仍不可逆。 | MI:777–810；TR:58–119；CS:15–143,225–248；src/api/mistral_conversations/decode_messages.rs:113–128；decode_gap_tests.rs:49–95 |
| G28 / Q user | 非视觉图片先TM固定占位；字符串空串仍发并净化，零块user跳过；数组text净化、视觉图data URL保序，单text decode折串，不逆推原数组形态。 | TM:12–57；MI:812–839；src/api/mistral_conversations/decode_messages.rs:24–35 |
| G29 / Q call | sameModel（api/provider/model全等）保持原ID；仅cross-model normalize；clean=去非alnum，attempt0且clean长9保留；否则seed=clean或原id，碰撞时seed加冒号attempt，shortHash去非alnum后截9；idMap/reverseMap保证该normalizer会话内映射与碰撞重试。toolResult同步；content后追加calls，原text/tool交错丢失，不把9字符算法无条件套同模型。 | MI:238–267,840–874；TM:129–151 |
| G30 / Q result | text逐块sanitize再单换行join，整体trim；isError加[tool error]前缀，无输出用(no tool output)，仅图的文本占位按视觉路径；W-07起逐块恢复wire text与image_url data URL图片，保持wire图文顺序；图片data/MIME精确保留；单字符串结果仍一个text块。非法非data URL/缺base64分隔符拒绝；isError=false，不从前缀猜布尔。 | MI:875–920；src/api/mistral_conversations/decode_messages.rs:94–109；decode_content.rs:16–40；decode_gap_tests.rs:6–46,97–103 |
| G31 / Q options | 原生max/temperature非undefined才发；Simple以request max或model.max为cap，contextWindow<=0取max(1,cap)，否则min(cap,max(1,contextWindow-estimateContextTokens-4096))；reasoning先clampThinkingLevel，off转undefined；reasoning模型有thinkingLevelMap时effort=level映射或high，off取map.off；无map且启用reasoning才prompt_mode=reasoning。wire snake_case；对象toolChoice decoder直接保留JSON值及类型（src/api/mistral_conversations/decode.rs:22），effort优先prompt_mode。缓存只判断cacheRetention!==none且sessionId truthy；未指定retention及short/long均走启用分支，无env long/default short解析；Simple直接透传retention。启用时发body key，自动头仍受显式x-affinity覆盖抑制，mock body key优先x-affinity。 | MI:187–215,350–430,527–552；SO:18–53；src/api/mistral_conversations/decode.rs:14–35 |
| D14 / Q 文本域 | TM先将跨模型非空且非redacted thinking转text，此块类型变换为D；sameModel由api/provider/model全等判定。MI再对assistant text/thinking先trim判空、再删除孤立surrogate；原非空块可能净化成已发送空串。剩余chunks逐块保序，不合并；E仅限块类型未被跨模型转换、未过滤/净化且消息边界未合并的文本与块域，清洗/过滤为D。其他字段不得套文本清洗。 | TM:95–117；MI:844–858；utils/sanitize-unicode.ts:21–24；src/api/mistral_conversations/decode_messages.rs:50–83 |
| G32 / R content | 先施加本节O18投影，再sanitize，再跳过清洗后空串；相邻同型无分隔合并、交错类型保留；读取delta.content的text/thinking chunks，不读顶层reasoning_content。Q保序不等于R原块边界E。 | MI:644–704 |
| G33 / R call | 按tool_calls index或callId找slot，缺ID或字符串null用deriveMistralToolCallId(toolcall:索引,0)；name只取建块首段，后续同slot的name不拼接、不覆盖，只有arguments逐段累积并解析JSON。一般wire同index的name=get_、weather只保留get_，不是get_weather。当前encoder每工具单帧完整name、合法非空ID及有效object args域可E，不套Q跨模型ID规则，也不外推为一般流式name可往返。 | MI:710–749；src/api/mistral_conversations/encode.rs:18–20 |
| G34 / R usage | cached拼写优先：promptTokensDetails.cachedTokens→prompt_tokens_details.cached_tokens→promptTokenDetails.cachedTokens→prompt_token_details.cached_tokens→numCachedTokens→num_cached_tokens→0；非number/非有限→0，负值及超prompt clamp到[0,prompt]。input=max(0,prompt-read)，output=completion，write0；total取truthy wire否则input+output+read+write，cost按目标模型重算。源write/1h/reasoning不发，不删可逆read。 | MI:555–573,616–628；src/api/mistral_conversations/encode.rs:36–37 |
| G35 / R ID/stop | 首truthy responseId，缺省mock-mistral；stop→stop，length/model_length→length，tool_calls→toolUse；error→error+Provider stopped with: error (server error)；源aborted经abort→error+Provider stopped with: abort，deferred经stop→stop，pending编码拒绝。任意源errorMessage不往返；未来更改拒绝策略须另批。 | MI:609–614,936–951；src/api/mistral_conversations/encode.rs:6–9,28–36 |
| G36 / R rawStop | rawStopReason=wire choice.finish_reason；源raw不参与encoder，须与统一stop分别预测，不从actual复制期望。 | MI:633–636；src/api/mistral_conversations/encode.rs:28–35 |

### tests显式差异（当前未修）

| 报告ID / 测试 | 与源码规则的差异及归属 |
|---|---|
| C18 / tests/canonical-mistral.mjs（历史行号49–60） | W-06旧投影在W-07读图/合成工具System后造成两项vision与tools-only新红；W-08已按G27/G30更新oracle，三案真实SDK全绿，不删图片/tools输入。D14的已发空块二次删除亦按W06-F3修复，原surrogate-order及新增空thinking保序回归通过。详见../w08-match.md。 |
| C19 / tests/canonical-mistral.mjs:25–55；tests/canonical-reply-additional.mjs:16–20 | Q/R均未完整sanitize；依D14/G32分别建模先trim后sanitize与先sanitize后跳空，W-06候选。Rust不能表示坏代理不否定JS输入域。 |
| C20 / tests/canonical-reply-additional.mjs:23 | 仅处理error，aborted/deferred未按G35投影；W-06候选，不静默批准新的stop策略。 |
| C22 / tests/matrix-lib.mjs:46–54,85–89 | 全局ignore total/cost/rawStop/ID不证明这些字段等价；G33–G36要独立预测/断言，不从got复制。W-06候选。 |
| C26 / 历史已修部分 | Mistral Q content chunk保序、R thinking chunk与cacheRead已修，不能翻案；历史31/0已扩为当前快照63/0，不声称本轮重跑（../final-ledger.md:123–130,151；../definition-freeze.md第7节）。 |

## 5. 不可逆声明与 transport 边界

### Options 槽位镜像补充（本轮裁决）

- 原生function toolChoice对象保留JSON值及类型（E），不再变JSON字符串（MI:38,543,923–934；src/api/mistral_conversations/decode.rs:22）。
- strict原prefer/require不可由最终bool/schema还原，不发明strict槽（MI:777–789；CS:225–251）。grammar配置在此只走function schema，不发custom；samplingParams不在builder/serializer读取范围（MI:386–430,527–552）。完整证据见../slots-mirror-pi.md。


L仅限当前锁定映射：system section名/patch及工具历史、跨模型被规范化前的原ID（同模型ID保持）、原text/tool交错、签名/redacted/namespace、历史身份/时间/usage与执行记录、R write/1h/reasoning/responseModel/endTurn、任意源error文案和源raw等区别不发或不被锁定parser读回。read、thinking可见文本在有效域有载体，不能一并删除（MI:555–573,644–745,777–920；TM:95–145）。

W-07已实现工具结果图片与tools-only补读：视觉text+image/纯图结果按wire恢复图片，不从错误前缀反推isError；tools-only/no-system合成承载System并保工具schema/name/description/order，text-only单字符串仍保留。wire图片及工具快照字段由D实现缺口转E；聚合文本、原工具变更历史、strict意图等原D/L保持不变。源码：src/api/mistral_conversations/decode_messages.rs:94–128、decode_content.rs:16–40；验证与W-08 oracle新红见../w07-implementation.md。

T限内容解析前HTTP/网络/读取失败；require schema转换失败、非法data URL、非object tool args及assistant image/pending编码拒绝是各自输入域拒绝，不叫T。流中choices坏JSON/非法finishReason可在已收到内容后发生，保留partial content的错误不等于transport内容全未知（MI:510–525,609–745,936–951；CS:225–248）。真实服务认证、坏网络、复杂document/audio/reference、strict response format、任意hooks及全部reasoning/options组合未在线验证。

## 6. 覆盖与 fixture 索引

| 位置 | 覆盖与诚实边界 |
|---|---|
| src/api/mistral_conversations/decode_messages.rs:50–128；decode_gap_tests.rs:6–103 | Q保序microfix；W-07工具结果图文恢复、tools-only合成System；新增3项单测涵盖混合/纯图/文本、错误前缀、工具schema/order与非法URL拒绝。 |
| src/api/mistral_conversations/encode.rs:6–42 | R thinking chunks、合法工具ID、非零cached read、stop/aborted/deferred/pending边界。 |
| tests/canonical-mistral.mjs；tests/canonical-reply-additional.mjs | 现有oracle不是全域规则，差异见§4；本轮不修改、不删除向量。 |
| tests/canonical-ten.test.mjs；tests/canonical-reply-projections.test.mjs | 现有12项纯canonical单测，执行证据统一记入../definition-freeze.md第7节；不把绿灯外推到图片/tools-only/Unicode。 |
| 上游test/mistral-http-transport.test.ts、mistral-raw-stop-reason.test.ts、mistral-reasoning-mode.test.ts、mistral-tool-schema.test.ts | fixture检索入口，均在pi-mono/packages/ai/test，只读索引；本轮未复制/运行上游测试。 |

当前矩阵身份为SHA256 `a4583609824bae6c9c884196fe8f636eea444101860a7e833525dea632b1443f`，Mistral63/0是已有快照，不是本轮执行结果。历史31/0仅为旧合并页当时分母；没有以新文档改写实验结果。
