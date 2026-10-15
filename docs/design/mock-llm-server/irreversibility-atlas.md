# 十协议组装过程可逆性图谱

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## A. 统一框架与字段流转

### 证据边界与口径

本文唯一 TS 权威根为 `<pi-mono>/packages/ai/src`；下文 `api/*.ts`、`utils/*.ts`、`types.ts` 均相对此根，`src/**`、`tests/**`、`docs/**` 均相对 mock-with-pi。冻结轮为纯分析；W-07已按批准范围补读/补发并同步本图谱，实施与复跑证据见w07-implementation.md。W-08按演进后定义更新oracle并终跑，见w08-match.md；发现Codex HTTP路由未调用endTurn wrapper（W08-F4），A04.08/F5的E是批准契约；owner裁决后已在统一Api::encode出口接入wrapper，HTTP复跑见f4-p1-resolution.md；transport-unblock本轮以系统zstd CLI与axum ws解阻，离线ADC亦已验证，当前结论见transport-unblock.md。W-07不改tests/原快照，W-08新增结果另行记账；TS仍只读。输入实际为 `api/` 下 **8 份权威规格覆盖 10 协议，另有 1 份退役存根**：openai-completions.md、openai-responses.md、anthropic-messages.md、google-generative-ai.md、bedrock.md、mistral.md、family-variants.md（Azure/Codex/Vertex三协议）、pi-messages.md；bedrock-mistral.md仅迁移存根。八份权威页均为编号1–6、含第4节规则汇编。

请求方向 Q：`Unified context → pi convert → wire → mock decode → UnifiedRequest`。回复方向 R：`Unified AssistantMessage → mock encode → wire → pi parser → AssistantMessage`。不能把 Q 的历史元数据丢失推广到 R，也不能把 mock 模型缺字段说成 wire 无字段。

五种终态：**精确往返 E**（JSON 值语义，非键序/分片字节相等）；**确定性变换 D**（必须给出映射规则，允许多对一，不能声称原输入可逆）；**丢弃 L**（当前映射 wire 不携带原信息）；**pi 注入 P**（身份、时间、费率等由客户端上下文盖章）；**transport 阻断 T**（内容解析前失败，不知道内容结果）。分类对象是“字段+方向+前置条件”，不是协议整体。

信息论判据：固定模型/选项，若两个不同输入映到相同 wire，服务端无法恢复区别；canonical 可以定义商空间，却不能恢复被删的区别。反之 wire 有字段、mock decode 不读，是实现缺口，不是信息论不可逆。锁定类型全集见 `types.ts:541–635`；共同跨模型转换见 `api/transform-messages.ts:95–145`，错误历史删除见 `:195–203`，孤儿结果补入见 `:167–185,231–232`。

文献basename（如final-ledger.md）均在`docs/design/mock-llm-server/`；本文原分析按A→B→C→D增量落盘；定义修订依据definition-freeze.md的D/G裁决，复审状态见该报告第7节。

### 引用缩写与共有规则

`OCC`=`api/openai-completions.ts`；`OR`=`api/openai-responses.ts`；`SH`=`api/openai-responses-shared.ts`；`AZ`=`api/azure-openai-responses.ts`；`CX`=`api/openai-codex-responses.ts`；`AM`=`api/anthropic-messages.ts`；`GG`=`api/google-generative-ai.ts`；`GS`=`api/google-shared.ts`；`GV`=`api/google-vertex.ts`；`BR`=`api/bedrock-converse-stream.ts`；`MI`=`api/mistral-conversations.ts`；`PM`=`api/pi-messages.ts`；`TM`=`api/transform-messages.ts`；`TR`=`utils/transcript.ts`；`TX`=`utils/text.ts`；`ES`=`utils/event-stream.ts`。表内短引用均是 file:line，不是抽象规格依据。

共有 **G1**：除 PM 外，默认不支持中途 system 时，按顺序重放 content（`\n\n`）、sections patch（null 删除）、tools remove/add（同名覆盖），形成当前快照；section 名、原消息归属、工具变更历史不能从快照还原（`TR:58–119; TX:6–39`）。支持 native mid-convo 的 compat 不套折叠规则，按 `SH:184–227; AM:1378–1399` 的显式更新路径分析。

共有 **G2**：除 PM 外，TM 先按目标是否支持图像降级图片为占位文本；同模型条件为 api+provider+model 全等；跨模型 thinking 非空转 text、redacted 整块删、textSignature/thoughtSignature 剥离；error/aborted 历史助手整条删；孤儿调用补 `No result provided`，system 延后到结果之后（`TM:12–56,95–145,167–232`）。这些是确定规则 D，但其被删除的原信息另列 B 中 L 对象，不能因有规则宣称信息无损。

共有 **G3**：vendor 请求历史的 usage/stopReason/responseId/responseModel/errorMessage/rawStopReason/endTurn/durationMs/诊断记录等，不在一般消息内容发射路径；mock 只能用默认值。例外为 AM managed effort 标记（`AM:1500–1507,1563–1577`）、Responses reasoning item 内部信息（`SH:265–267`）、PM 整个 context（`PM:375–400`）。回复身份 api/provider/model 来自请求配置，不由响应覆盖（`OR:137–152; GG:68–84; GV:80–92; BR:137–153; PM:181–193`）；OCC/AM/MI 对应初始化及流消费见各表。

共有 **G4**：R 的 durationMs 由事件流本地单调时钟测量，不能用服务端 latency 冒充（`ES:97–129`）；除 PM 外 cost 由模型目录计算（`OCC:1557–1559; SH:577–582; AM:720–721,885–890; GG:242–250; GV:250–258; BR:720; MI:627–628`）。同样是“pi 注入”，不是 encoder 漏发可逆字段。

共有 **G5 / Q-COMPOSE**（owner 裁决演进）：固定目标 M/O，Q=D∘V，X=Q(C)，B 仅补 Rust/TS 内容块判别标签；复合转换核验 `Q(B(X)) ≡ K(B(X))`，不宣称 `Q(B(X)) ≡ X`。后者作为 rawIdempotent/rawDiffs 原样留证。请求历史身份不在 wire，默认身份可使第二轮 TM:95–145 进入跨模型分支：thinking→text、签名删除及 ID 再规范化；OCC:1267–1270,1298–1308、AM:1400–1448、GS:232–268 先过滤再净化可令 surrogate-only 已发空块在二轮消失。故单轮 canonical 不是全域幂等投影，禁止用重标身份/删字段补成幂等。Q 无值则不适用该等式；OR:277–291 把未截断 session 放入请求头，非 ByteString 值在 SDK/Headers 边界拒绝，记 expected-rejection/domain finding，保留原分母而不计通过。统一 oracle 与 24 例闭环见 f4-p1-resolution.md、tests/property-request-projection.mjs:4–15、property-request-domain.mjs:1–17。

表内每行只取一个主终态；条件差异拆行。`D/L` 不作为第六类：聚合后的值用 D，丢掉的边界/原始值另列 L。T 行只说真实执行阻断，表内其余行是 transport 可达时的源码条件结论。

### 1. `openai-completions`

| 条目 | unified 字段/方向 | convert / encode（源证据） | wire 是否携带 | decode / parser 重建 | 终态 |
|---|---|---|---|---|---|
| A01.01 | Q system.content/sections/toolsRemoved | G1；developer/system 角色按模型选择（OCC:1193–1255） | 仅文本及工具快照 | System 文本；无 sections（src/api/openai_completions/decode.rs:21–72） | D |
| A01.02 | Q user.text/image | 字符串含空串直发；数组过滤长度0文本；data URL（OCC:1260–1292） | 有；非视觉图片按 G2 替换 | 字符串或有序 text/image（src/api/openai_completions/decode.rs:75–101） | D |
| A01.03 | Q assistant.text/block order | trim 空块删；所有 text join("")，thinking/工具分列（OCC:1298–1405） | 有聚合值，无原交错 | thinking→text→tools（src/api/openai_completions/decode.rs:103–156） | D |
| A01.04 | Q thinking/签名 | 首个合法 details 优先，存在 details 则不发可见 reasoning；否则仅认可3字段名发 join("\n")；thinking-only 无 content/tool_calls 整条跳过（OCC:1298–1347,1383–1405） | 条件存在 | details JSON + thinking=""，或字段名签名；任意 opaque 不保证有 carrier（src/api/openai_completions/decode.rs:103–127） | D |
| A01.05 | Q toolCall.id/name/arguments | 跨模型 ID：分隔符转 _、≤40 或 prefix_hash；JSON args（OCC:1202–1225,1359–1381） | 有规范后值 | 工具对象，不能恢复原ID（src/api/openai_completions/decode.rs:133–155） | D |
| A01.06 | Q toolResult.content/images | 文本 join("\n")；空用占位符；图片汇入后随 user（OCC:1406–1467） | 有文本和图，原归属丢失 | tool text + 独立 user（src/api/openai_completions/decode.rs:75–101,177–187） | D |
| A01.07 | Q toolResult.isError/toolName | name 仅 compat 要求才发；isError 不发（OCC:1406–1424） | 默认无 | false / ""（src/api/openai_completions/decode.rs:177–187） | L |
| A01.08 | Q options/tools | max token字段、temperature、reasoning compat；strict schema（OCC:819–1008,1482–1515） | 有终值；session可能截64码点 | 按字段回读；strict标志不等于原constrainedSampling（src/api/openai_completions/decode.rs:21–72; api/openai-prompt-cache.ts:1–7） | D |
| A01.09 | R text/thinking boundaries | encoder逐块delta；parser只建一个text/一个thinking slot（src/api/openai_completions/encode.rs:18–31; OCC:480–505,600–680） | 有文本增量，无独立块ID | 所有同类型累积，空文本不建slot | D |
| A01.10 | R thinkingSignature | 3字段名/合法details保留原载体；外域签名先统一投影为text（src/api/encode_thinking.rs:18–42,47–82）；合法details仍由pi过滤合并（OCC:123–152,261–273,669–680） | 有效details/字段选择，或降级text | 可见thinking不从details派生；原外域签名丢弃，空白/redacted删除 | D |
| A01.11 | R toolCall.id/name/arguments（不同ID/index域） | index后按id找slot（OCC:499–555; src/api/openai_completions/encode.rs:33–42） | 有 | 不同工具ID时id/name/JSON args精确；独立签名/namespace不发 | E |
| A01.11-D | R 重复toolCall.id | 新index未命中时仍按id命中旧slot（OCC:499–555） | 有重复id/index增量 | 合并至旧slot，不能逐源块保留 | D |
| A01.12 | R textSignature/thoughtSignature/namespace/redacted | encoder无发射路径（src/api/openai_completions/encode.rs:18–45） | 无 | 不存在；textSignature并非当前encoder报错 | L |
| A01.13 | R usage.input/output/read/write/reasoning | prompt=input+read+write；parser减read/write、负值截0（OCC:1530–1555; src/api/openai_completions/encode.rs:88–99） | 有 | 有效非负域精确；缺reasoning→0 | D |
| A01.14 | R usage.cacheWrite1h | usage parser 无1h槽（OCC:1530–1555） | 当前映射无 | 不存在 | L |
| A01.15 | R usage.totalTokens | parser按input+output+read+write重算（OCC:1556） | encoder不发原total | 派生总数 | D |
| A01.16 | R responseId/responseModel | 读chunk.id/model；model等于请求值不记录差异（OCC:519–523; src/api/openai_completions/encode.rs:9–15） | 有 | id保留；相同model→无responseModel | D |
| A01.17 | R stopReason/errorMessage | stop/length/tool_calls；error仅识别固定前缀，否则error（OCC:1566–1590; src/api/openai_completions/encode.rs:58–73） | 有finish_reason，无任意error文案 | Provider finish_reason: X；pending/aborted/deferred本encoder拒绝 | D |
| A01.18 | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | G3；本表Q的消息发射分支只发内容，AM effort例外已单列 | 除明确例外无原记录 | 默认usage0/stop/None；原值不可恢复（各表Q decoder位置；types.ts:565–635） | L |
| A01.19 | Q 历史timestamp/durationMs | 本表Q convert分支不发时间；TM合成timestamp也不发 | 无原时间 | timestamp=0、duration=None（各表Q decoder位置） | L |
| A01.20 | R api/provider/model 身份 | 由目标Model初始化，响应不覆盖这些身份；G3（OCC:310–328） | 不以服务端源身份传回 | 当前请求身份，不是历史源身份 | P |
| A01.21 | R timestamp/durationMs | 请求初始化Date.now；事件流本地计时（OCC:310–328; ES:97–129） | 无服务端原时间载体 | 客户端时间/持续时长 | P |
| A01.22 | R usage.cost | G4各协议calculateCost路径；PM例外不适用 | 无原成本 | 目标模型费率计算值 | P |
| A01.23 | R rawStopReason | parser读native原因（OCC:582–584） | 有native stop/status，不保证源rawStopReason自由值 | finish_reason原值；与统一stopReason分开比较 | D |
| A01.24 | R thinkingLevel/providerThinkingLevel | 初始化及内容/终态读取不赋这些字段（OCC:313–329） | 无独立原值 | None；PM的providerThinkingLevel有独立事件字段，例外见A10 | L |
| A01.25 | Q 历史assistant.api/provider/model来源 | G2匹配来源影响降级，但vendor只携带目标请求model；各表Q完整发射分支源引用 | 无独立历史身份字段 | mock填固定api/provider/目标model或空串；不能还原原身份 | L |
| A01.26 | Q 未单列的textSignature/tool thoughtSignature/namespace | 目标发射只含本表已列支持字段（OCC:1260–1292,1325–1385,1406–1467） | 未列支持的独立签名/namespace无；工具结果textSignature亦不发 | 对应optional为None；thinking原生签名规则仍按本表，不全局删除 | L |

### 2. `openai-responses`

| 条目 | unified 字段/方向 | convert / encode（源证据） | wire 是否携带 | decode / parser 重建 | 终态 |
|---|---|---|---|---|---|
| A02.01 | Q system/sections/tool history | G1；系统/developer文本发input（SH:213–227） | 文本/当前tools存在 | sections和原消息边界不重建（src/api/openai_responses/decode.rs:26–45,118–159） | D |
| A02.02 | Q user.text/image/empty | 每字符串转input_text，含空串；数组空则跳过（SH:229–253） | 有text/data URI | user Blocks保序（src/api/openai_responses/decode.rs:26–45） | D |
| A02.03 | Q thinking/thinkingSignature | 有签名直接JSON.parse并原样发item；无签名不发；不会从block.thinking合成历史item（SH:263–268） | 只有签名item内信息 | thinking=summary或content；签名=原item JSON（src/api/openai_responses/decode.rs:57–63） | D |
| A02.04 | Q assistant.text/textSignature | 每块独立message；解析v1 id/phase，过长id哈希，缺省msg_pi索引（SH:269–289） | 有text/id/phase | textSignature v1；连续助手items合一消息（src/api/openai_responses/decode.rs:47–55,118–142） | D |
| A02.05 | Q toolCall.id/namespace/args | call\|item拆分；跨源规范化；item ID按模型/前缀门控；namespace仅同模型（SH:154–177,290–327） | 条件有item ID/ns，args JSON | 按wire还原（src/api/openai_responses/decode.rs:65–86） | D |
| A02.06 | Q toolResult.content/id/name | call_id+output；无图join("\n")/空占位；有图保留（SH:81–106,332–347） | 无独立name，但配对call有name | 从call表恢复fullID/name，图文保留（src/api/openai_responses/decode.rs:89–108,178–190） | D |
| A02.07 | Q toolResult.isError | convert不发送（SH:332–347） | 无 | 固定false（src/api/openai_responses/decode.rs:98–103） | L |
| A02.08 | Q tools/schema/options/session | strict schema；truthy max且支持才max(16,n)，0省略；显式effort或truthy summary回退medium，仅显式经map；sampling末写（SH:360–395; OR:330–386） | schema/strict/options终值；默认头原session优先body截64（OR:277–291） | mock未读strict为实现投影；schema/options终值回读（src/api/openai_responses/decode.rs:144–159） | D |
| A02.09 | R text/thinking/empty blocks | added独立slot；done定稿；空thinking保留（SH:464–484,683–710） | 有item与output_index | text=done内容；thinking=summary\|\|content\|\|delta | D |
| A02.10 | R thinkingSignature（reasoning JSON域） | done必须reasoning；签名=JSON.stringify(item)（SH:688–693） | 有完整item | 同域JSON值可往返；任意opaque原串不等于JSON | D |
| A02.11 | R opaque signature（owner裁决） | 统一出口将目标不支持签名的thinking转text；空白/redacted删除（src/api/encode_thinking.rs:47–90；TM:99–116） | output_text，无原签名 | 确定性降级；18案已复跑18绿，非无损thinking块往返；见B2及o18-resolution.md | D |
| A02.12 | R toolCall.id/namespace/args | 无itemID时合成fc_hash；done读namespace与JSON args（src/api/openai_responses/encode.rs:52–67; SH:485–503,710–727） | 有 | id=call_id+竖线+item.id；namespace/args精确 | D |
| A02.13 | R usage.input/output/read/write/reasoning/total | input_tokens=input+read+write，parser减后max(0)；total取wire（SH:560–575） | 有 | 有效计数域原值；缺reasoning为0 | D |
| A02.14 | R usage.cacheWrite1h/responseModel/tool thoughtSignature/redacted | parser无对应赋值（SH:464–524,552–597,683–744） | 本encoder未携带这些独立语义 | 不存在；reasoning item的encrypted_content不等于redacted布尔 | L |
| A02.15 | R responseId | created/terminal.id（SH:557–559,601–602） | 有 | 原id或encoder缺省resp_mock（src/api/openai_responses/encode.rs:11–13） | D |
| A02.16 | R stopReason/errorMessage | completed/incomplete/failed；tool存在将stop升toolUse；failed前缀server_error（SH:584–595,743–760; src/api/openai_responses/encode.rs:101–112） | 有status/error | ToolUse无tool→stop；pending/aborted/deferred当前拒绝；failed不处理成功usage | D |
| A02.17 | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | G3；本表Q的消息发射分支只发内容，AM effort例外已单列 | 除明确例外无原记录 | 默认usage0/stop/None；原值不可恢复（各表Q decoder位置；types.ts:565–635） | L |
| A02.18 | Q 历史timestamp/durationMs | 本表Q convert分支不发时间；TM合成timestamp也不发 | 无原时间 | timestamp=0、duration=None（各表Q decoder位置） | L |
| A02.19 | R api/provider/model 身份 | 由目标Model初始化，响应不覆盖这些身份；G3（OR:137–152） | 不以服务端源身份传回 | 当前请求身份，不是历史源身份 | P |
| A02.20 | R timestamp/durationMs | 请求初始化Date.now；事件流本地计时（OR:137–152; ES:97–129） | 无服务端原时间载体 | 客户端时间/持续时长 | P |
| A02.21 | R usage.cost | G4各协议calculateCost路径；PM例外不适用 | 无原成本 | 目标模型费率计算值 | P |
| A02.22 | R rawStopReason | parser读native原因（SH:584–595,747–755） | 有native stop/status，不保证源rawStopReason自由值 | status或status.incomplete_details.reason；与统一stopReason分开比较 | D |
| A02.23 | R thinkingLevel/providerThinkingLevel | 初始化及内容/终态读取不赋这些字段（OR:137–152; SH:552–597） | 无独立原值 | None；PM的providerThinkingLevel有独立事件字段，例外见A10 | L |
| A02.24 | Q 历史assistant.api/provider/model来源 | G2匹配来源影响降级，但vendor只携带目标请求model；各表Q完整发射分支源引用 | 无独立历史身份字段 | mock填固定api/provider/目标model或空串；不能还原原身份 | L |

### 3. `azure-openai-responses`

| 条目 | unified 字段/方向 | convert / encode（源证据） | wire 是否携带 | decode / parser 重建 | 终态 |
|---|---|---|---|---|---|
| A03.01 | Q model | deployment映射后入body（AZ:155–170,199; api/azure-openai-config.ts:27–35） | deployment名有，原逻辑model未单列 | request.model=deployment；原modelId未必可逆 | D |
| A03.02 | Q system/user/text/thinking/toolCall/toolResult | 完整采用Responses表各Q字段规则（AZ:187–196; SH:145–350） | 同根的条件存在性 | 同根decode并retag（src/api/azure_openai_responses/decode.rs:1–60） | D |
| A03.03 | Q tools/maxTokens/temperature/reasoning | supportsStrictMode缺省true、工具strict缺省false；max≥16；effort map（AZ:193–238；SH:361–362） | 有终值 | 共享根schema/options投影（src/api/azure_openai_responses/decode.rs:1–60） | D |
| A03.04 | Q sessionId | 无专用session亲和header，body clamp(sessionId)（AZ:155–170,198–204） | 仅64码点cache key | 只回读截断值；不是原长ID | D |
| A03.05 | R content/signatures/ids/usage/stop | 使用共享processResponsesStream（AZ:97–100; SH:464–760） | 与根相同 | 包括空块、JSON签名、cache read/write、total等全部根R规则 | D |
| A03.06 | R opaque signature | Azure复用Responses，先统一投影text/删除（src/api/azure_openai_responses/mod.rs:6；src/api/encode_thinking.rs:47–90） | output_text，无原签名 | 9案已复跑9绿；原签名I17损失不变 | D |
| A03.07 | R cacheWrite1h/responseModel/块独立redacted或thoughtSignature | 共享parser无读取（SH:464–524,560–575,683–744） | 当前映射无 | 不存在 | L |
| A03.08 | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | G3；本表Q的消息发射分支只发内容，AM effort例外已单列 | 除明确例外无原记录 | 默认usage0/stop/None；原值不可恢复（各表Q decoder位置；types.ts:565–635） | L |
| A03.09 | Q 历史timestamp/durationMs | 本表Q convert分支不发时间；TM合成timestamp也不发 | 无原时间 | timestamp=0、duration=None（各表Q decoder位置） | L |
| A03.10 | R api/provider/model 身份 | 由目标Model初始化，响应不覆盖这些身份；G3（AZ:47–63） | 不以服务端源身份传回 | 当前请求身份，不是历史源身份 | P |
| A03.11 | R timestamp/durationMs | 请求初始化Date.now；事件流本地计时（AZ:47–63; ES:97–129） | 无服务端原时间载体 | 客户端时间/持续时长 | P |
| A03.12 | R usage.cost | G4各协议calculateCost路径；PM例外不适用 | 无原成本 | 目标模型费率计算值 | P |
| A03.13 | R rawStopReason | parser读native原因（AZ:97–100; SH:584–595,747–755） | 有native stop/status，不保证源rawStopReason自由值 | 同Responses status派生；与统一stopReason分开比较 | D |
| A03.14 | R thinkingLevel/providerThinkingLevel | 初始化及内容/终态读取不赋这些字段（AZ:47–63,97–100） | 无独立原值 | None；PM的providerThinkingLevel有独立事件字段，例外见A10 | L |
| A03.15 | Q 历史assistant.api/provider/model来源 | G2匹配来源影响降级，但vendor只携带目标请求model；各表Q完整发射分支源引用 | 无独立历史身份字段 | mock填固定api/provider/目标model或空串；不能还原原身份 | L |
| A03.16 | Q system/sections/tool history | G1；系统/developer文本发input（SH:213–227） | 文本/当前tools存在 | sections和原消息边界不重建（src/api/openai_responses/decode.rs:26–45,118–159） | D |
| A03.17 | Q user.text/image/empty | 每字符串转input_text，含空串；数组空则跳过（SH:229–253） | 有text/data URI | user Blocks保序（src/api/openai_responses/decode.rs:26–45） | D |
| A03.18 | Q thinking/thinkingSignature | 有签名直接JSON.parse并原样发item；无签名不发；不会从block.thinking合成历史item（SH:263–268） | 只有签名item内信息 | thinking=summary或content；签名=原item JSON（src/api/openai_responses/decode.rs:57–63） | D |
| A03.19 | Q assistant.text/textSignature | 每块独立message；解析v1 id/phase，过长id哈希，缺省msg_pi索引（SH:269–289） | 有text/id/phase | textSignature v1；连续助手items合一消息（src/api/openai_responses/decode.rs:47–55,118–142） | D |
| A03.20 | Q toolCall.id/namespace/args | call\|item拆分；跨源规范化；item ID按模型/前缀门控；namespace仅同模型（SH:154–177,290–327） | 条件有item ID/ns，args JSON | 按wire还原（src/api/openai_responses/decode.rs:65–86） | D |
| A03.21 | Q toolResult.content/id/name | call_id+output；无图join("\n")/空占位；有图保留（SH:81–106,332–347） | 无独立name，但配对call有name | 从call表恢复fullID/name，图文保留（src/api/openai_responses/decode.rs:89–108,178–190） | D |
| A03.22 | Q toolResult.isError | convert不发送（SH:332–347） | 无 | 固定false（src/api/openai_responses/decode.rs:98–103） | L |
| A03.23 | R text/thinking/empty blocks | added独立slot；done定稿；空thinking保留（SH:464–484,683–710） | 有item与output_index | text=done内容；thinking=summary\|\|content\|\|delta | D |
| A03.24 | R thinkingSignature（reasoning JSON域） | done必须reasoning；签名=JSON.stringify(item)（SH:688–693） | 有完整item | 同域JSON值可往返；任意opaque原串不等于JSON | D |
| A03.25 | R toolCall.id/namespace/args | 无itemID时合成fc_hash；done读namespace与JSON args（src/api/openai_responses/encode.rs:52–67; SH:485–503,710–727） | 有 | id=call_id+竖线+item.id；namespace/args精确 | D |
| A03.26 | R usage.input/output/read/write/reasoning/total | input_tokens=input+read+write，parser减后max(0)；total取wire（SH:560–575） | 有 | 有效计数域原值；缺reasoning为0 | D |
| A03.27 | R responseId | created/terminal.id（SH:557–559,601–602） | 有 | 原id或encoder缺省resp_mock（src/api/openai_responses/encode.rs:11–13） | D |
| A03.28 | R stopReason/errorMessage | completed/incomplete/failed；tool存在将stop升toolUse；failed前缀server_error（SH:584–595,743–760; src/api/openai_responses/encode.rs:101–112） | 有status/error | ToolUse无tool→stop；pending/aborted/deferred当前拒绝；failed不处理成功usage | D |

### 4. `openai-codex-responses`

| 条目 | unified 字段/方向 | convert / encode（源证据） | wire 是否携带 | decode / parser 重建 | 终态 |
|---|---|---|---|---|---|
| A04.01 | Q/R 实际执行链（系统zstd可用、合法Unicode JSON） | CX:208–231,377–385发压缩HTTP；src/mounts/request_body.rs:1–60以which zstd与进程管道解压后交decode | 解压后JSON可达；上限2 MiB | 本轮Codex SSE 88/90绿；剩余ByteString与lone-surrogate见transport-unblock.md，不再将整协议记T | D |
| A04.01-T | Q zstd CLI缺失或解压体超限 | 不增加zstd crate；系统探查/解压失败返回协议JSON 400与官网安装指引 | 未进入消息decoder | 可选系统依赖条件边界；缺失/损坏/超限均有HTTP回归 | T |
| A04.02 | Q model/system/instructions | SH不发首system，改顶层instructions；空则默认英文提示（CX:543–558） | model/instructions有 | 首System填入默认或原文本（src/api/openai_codex_responses/decode.rs:17–64） | D |
| A04.03 | Q user/assistant/thinking/toolCall/toolResult/tools | SH共享convert，supportsStrictMode缺省true但wire strict=null（CX:538–580; SH:145–395） | 同Responses，待解压后可达 | 根decode+api/provider retag（src/api/openai_codex_responses/decode.rs:17–64） | D |
| A04.04 | Q maxTokens | buildRequestBody不发送该字段（CX:528–598） | 无 | None；不能套根max≥16 | L |
| A04.05 | Q toolChoice/session/temperature/effort | tool_choice默认auto；retention门控；session先截64码点（CX:276–284,562–598,1676–1679） | 默认session-id、x-client-request-id、body均为同一截64值；显式header覆盖另论 | 根decoder头优先再body，不能恢复长session原后缀 | D |
| A04.06 | Q WS previous_response_id/input | 相同前缀时只发剩余input（CX:1439–1477） | 当前帧增量；本连接保存前次input与output items | src/mounts/codex_continuation.rs恢复完整input；未知ID返回previous_response_not_found；auto连接复用+增量有真实SDK回归 | D |
| A04.07 | R text/thinking/signatures/tools/usage | SH解析器（CX:744–789; SH:464–760） | 逻辑与Responses相同 | 合法内容已由SSE/WS矩阵验证；failed为Codex专有分支，不套根error前缀/rawStopReason | D |
| A04.08 | R Codex源endTurn（completed/incomplete） | CX:775–783读布尔response.end_turn；W-07 Codex wrapper补发（src/api/openai_codex_responses/encode.rs:1–7；src/api/openai_responses/encode.rs:94–121） | Some(true/false)同布尔；None省略 | true/false/None保持；由L转E，仅Codex；本轮真实SDK SSE/WS的stop/length/toolUse终帧用例已通过 | E |
| A04.08-L | R Codex error源endTurn | CX:766–772 failed先抛错；encoder不补end_turn（src/api/openai_responses/encode.rs:111–120） | 无正常endTurn读取 | error仍无正常往返；普通Responses/Azure亦不受补发影响 | L |
| A04.09 | R cacheWrite1h/responseModel/独立块redacted/thoughtSignature | 共享SH无独立读取（SH:464–524,560–575,683–744） | 当前映射无 | 不存在 | L |
| A04.10 | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | G3；本表Q的消息发射分支只发内容，AM effort例外已单列 | 除明确例外无原记录 | 默认usage0/stop/None；原值不可恢复（各表Q decoder位置；types.ts:565–635） | L |
| A04.11 | Q 历史timestamp/durationMs | 本表Q convert分支不发时间；TM合成timestamp也不发 | 无原时间 | timestamp=0、duration=None（各表Q decoder位置） | L |
| A04.12 | R api/provider/model 身份 | 由目标Model初始化，响应不覆盖这些身份；G3（CX:240–263） | 不以服务端源身份传回 | 当前请求身份，不是历史源身份 | P |
| A04.13 | R timestamp/durationMs | 请求初始化Date.now；事件流本地计时（CX:240–263; ES:97–129） | 无服务端原时间载体 | 客户端时间/持续时长 | P |
| A04.14 | R usage.cost | G4各协议calculateCost路径；PM例外不适用 | 无原成本 | 目标模型费率计算值 | P |
| A04.15 | R rawStopReason | parser读native原因（CX:775–783; SH:584–595,747–755） | 有native stop/status，不保证源rawStopReason自由值 | 成功/长度经Codex归一后的status派生；failed在CX:766–772先抛错，不设置rawStopReason | D |
| A04.16 | R thinkingLevel/providerThinkingLevel | 初始化及内容/终态读取不赋这些字段（CX:247–263; SH:552–597） | 无独立原值 | None；PM的providerThinkingLevel有独立事件字段，例外见A10 | L |
| A04.17 | Q 历史assistant.api/provider/model来源 | G2匹配来源影响降级，但vendor只携带目标请求model；各表Q完整发射分支源引用 | 无独立历史身份字段 | mock填固定api/provider/目标model或空串；不能还原原身份 | L |
| A04.18 | Q user.text/image/empty | 每字符串转input_text，含空串；数组空则跳过（SH:229–253） | 有text/data URI | user Blocks保序（src/api/openai_responses/decode.rs:26–45） | D |
| A04.19 | Q thinking/thinkingSignature | 有签名直接JSON.parse并原样发item；无签名不发；不会从block.thinking合成历史item（SH:263–268） | 只有签名item内信息 | thinking=summary或content；签名=原item JSON（src/api/openai_responses/decode.rs:57–63） | D |
| A04.20 | Q assistant.text/textSignature | 每块独立message；解析v1 id/phase，过长id哈希，缺省msg_pi索引（SH:269–289） | 有text/id/phase | textSignature v1；连续助手items合一消息（src/api/openai_responses/decode.rs:47–55,118–142） | D |
| A04.21 | Q toolCall.id/namespace/args | call\|item拆分；跨源规范化；item ID按模型/前缀门控；namespace仅同模型（SH:154–177,290–327） | 条件有item ID/ns，args JSON | 按wire还原（src/api/openai_responses/decode.rs:65–86） | D |
| A04.22 | Q toolResult.content/id/name | call_id+output；无图join("\n")/空占位；有图保留（SH:81–106,332–347） | 无独立name，但配对call有name | 从call表恢复fullID/name，图文保留（src/api/openai_responses/decode.rs:89–108,178–190） | D |
| A04.23 | Q toolResult.isError | convert不发送（SH:332–347） | 无 | 固定false（src/api/openai_responses/decode.rs:98–103） | L |
| A04.24 | R text/thinking/empty blocks | added独立slot；done定稿；空thinking保留（SH:464–484,683–710） | 有item与output_index | text=done内容；thinking=summary\|\|content\|\|delta | D |
| A04.25 | R thinkingSignature（reasoning JSON域） | done必须reasoning；签名=JSON.stringify(item)（SH:688–693） | 有完整item | 同域JSON值可往返；任意opaque原串不等于JSON | D |
| A04.26 | R toolCall.id/namespace/args | 无itemID时合成fc_hash；done读namespace与JSON args（src/api/openai_responses/encode.rs:52–67; SH:485–503,710–727） | 有 | id=call_id+竖线+item.id；namespace/args精确 | D |
| A04.27 | R usage.input/output/read/write/reasoning/total | input_tokens=input+read+write，parser减后max(0)；total取wire（SH:560–575） | 有 | 有效计数域原值；缺reasoning为0 | D |
| A04.28 | R responseId | created/terminal.id（SH:557–559,601–602） | 有 | 原id或encoder缺省resp_mock（src/api/openai_responses/encode.rs:11–13） | D |
| A04.29 | R stopReason/errorMessage（Codex事件先归一） | CX:766–772 failed先抛CodexApiError；message空则Codex response failed，encoder缺文案发unknown error；CX:486–493格式化 | 有status/error；无任意原rawStopReason | 无server_error前缀、无failed rawStopReason；failed不处理成功usage；其余ToolUse无tool→stop，unsupported终态拒绝 | D |

### 5. `anthropic-messages`

| 条目 | unified 字段/方向 | convert / encode（源证据） | wire 是否携带 | decode / parser 重建 | 终态 |
|---|---|---|---|---|---|
| A05.01 | Q system/sections/toolsRemoved | 默认G1；native模式有tool_addition/removal但section更新渲染成文本（AM:1164–1239,1378–1399） | 快照或原生工具事件；无section名结构 | System文本/tools；无法逆解渲染归属（src/api/anthropic_messages/messages.rs:20–55） | D |
| A05.02 | Q user.text/image/empty | trim空文本过滤；有图base64；cache_control可把字符串包装数组（AM:1400–1437,1527–1552） | 有剩余块 | 字符串或Blocks按wire形状（src/api/anthropic_messages/messages.rs:58–92） | D |
| A05.03 | Q assistant.text/thinking/redacted | 同模型有签名thinking保留；unsigned按allowEmptySignature转text/空签名；redacted只发data（AM:1440–1483; TM:102–116） | 有条件文本/签名/data | redacted可见文本固定[Reasoning redacted]（src/api/anthropic_messages/messages.rs:118–153） | D |
| A05.04 | Q/R toolCall.id/name/args | tool_use按块保序，args JSON，跨模型ID清洗；OAuth name改写（AM:1325–1328,1485–1491,754–768） | 有规范后值 | id/name/args；不支持工具thoughtSignature/namespace（src/api/anthropic_messages/messages.rs:154–167） | D |
| A05.05 | Q toolResult.content/isError/name | 连续结果分块合并；error图片变占位；is_error保留；name从配对调用（AM:1329–1345,1507–1522） | 有is_error/text/允许图片；无独立name | toolName配对回填，块文本join（src/api/anthropic_messages/messages.rs:93–115） | D |
| A05.06 | Q tool.parameters 非strict整体 | 投影type=object/properties/required（AM:1637–1650） | 三字段仍发，不能判整个schema L | legacy schema整体为确定投影（src/api/anthropic_messages/messages.rs:8–17） | D |
| A05.06-L | Q 非strict schema根级其他键 | AM:1637–1650仅拷三字段，nested properties原样 | 无被删根级键 | 原值不可恢复，严格限定I06域 | L |
| A05.07 | Q tools strict/effort/max/temperature/session | strict真保留扩展schema；effort可用历史标记；thinking门控temperature；max预算终值（AM:1243–1314,1493–1500,1563–1577,1637–1657） | 有终值/条件header或metadata | 读取终值；constrainedSampling原声明不可逆 | D |
| A05.08 | R text/thinking/signature/empty | start创建块；delta累积；空普通thinking签名默认空串（AM:729–754,771–815） | 有块start/stop和签名delta | 块边界/空text保留；普通thinking签名原值 | D |
| A05.09 | R redacted | redacted_thinking.data（AM:746–754） | 仅opaque data | thinking固定[Reasoning redacted]、redacted=true | D |
| A05.10 | R usage.input/output/read/write/1h/reasoning | start+delta独立计数，1h从嵌套读（AM:712–721,868–884） | 有 | 数值保留；total=input+output+read+write重算 | D |
| A05.11 | R responseId/responseModel | message_start.id/model（AM:699–710） | 有 | responseModel仅wire model≠请求model时设置，不可忽略 | D |
| A05.12 | R stopReason/errorMessage | end_turn/max_tokens/tool_use/refusal；refusal explanation保留（AM:851–858,1663–1687） | 有 | 四类终态，unsupported不得假称精确；任意rawStopReason不自动等于源值 | D |
| A05.13 | R textSignature/thoughtSignature/namespace/endTurn | 正常内容/终帧无相应读路径（AM:729–768,851–897） | 当前映射无 | 不存在 | L |
| A05.14 | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | G3；本表Q的消息发射分支只发内容，AM effort例外已单列 | 除明确例外无原记录 | 默认usage0/stop/None；原值不可恢复（各表Q decoder位置；types.ts:565–635） | L |
| A05.15 | Q 历史timestamp/durationMs | 本表Q convert分支不发时间；TM合成timestamp也不发 | 无原时间 | timestamp=0、duration=None（各表Q decoder位置） | L |
| A05.16 | R api/provider/model 身份 | 由目标Model初始化，响应不覆盖这些身份；G3（AM:580–599） | 不以服务端源身份传回 | 当前请求身份，不是历史源身份 | P |
| A05.17 | R timestamp/durationMs | 请求初始化Date.now；事件流本地计时（AM:580–599; ES:97–129） | 无服务端原时间载体 | 客户端时间/持续时长 | P |
| A05.18 | R usage.cost | G4各协议calculateCost路径；PM例外不适用 | 无原成本 | 目标模型费率计算值 | P |
| A05.19 | R rawStopReason | parser读native原因（AM:851–858） | 有native stop/status，不保证源rawStopReason自由值 | delta.stop_reason原值；与统一stopReason分开比较 | D |
| A05.20 | R providerThinkingLevel | managed compat从options.effort初始化（AM:580–599） | 不是从响应携带的原level | managed时effort或high，否则None | P |
| A05.21 | R thinkingLevel | 初始化/事件无赋值（AM:580–599; AM:699–897） | 无原值 | None；agent loop另行盖章不属于本parser | L |
| A05.22 | Q 历史assistant.api/provider/model来源 | G2匹配来源影响降级，但vendor只携带目标请求model；各表Q完整发射分支源引用 | 无独立历史身份字段 | mock填固定api/provider/目标model或空串；不能还原原身份 | L |
| A05.23 | Q 未单列的textSignature/tool thoughtSignature/namespace | 目标发射只含本表已列支持字段（AM:1400–1437,1440–1491,1329–1345） | 未列支持的独立签名/namespace无；工具结果textSignature亦不发 | 对应optional为None；thinking原生签名规则仍按本表，不全局删除 | L |

### 6. `google-generative-ai`

| 条目 | unified 字段/方向 | convert / encode（源证据） | wire 是否携带 | decode / parser 重建 | 终态 |
|---|---|---|---|---|---|
| A06.01 | Q system/sections/tools | G1；systemInstruction+functionDeclarations；parametersJsonSchema（GG:379–397; GS:359–400） | 文本/完整schema快照有 | 首System，schema完整；不存在所谓Vertex默认剥meta（src/api/google_generative_ai/decode.rs:35–64） | D |
| A06.02 | Q user.text/image/empty | 字符串空串也发text；数组零parts跳过（GS:203–226） | 有text/inlineData | 单text折为字符串，图文有序（src/api/google_generative_ai/decode.rs:70–106） | D |
| A06.03 | Q text/thinking/tool thoughtSignature | 同provider/model且合法base64才保留；空块有合法签名可保留（GS:146–159,228–281; TM:95–145） | 条件有thoughtSignature | 三个签名均实际保留（src/api/google_generative_ai/decode.rs:135–156）；旧canonical漏读不是wire损失 | D |
| A06.04 | Q toolCall.id | claude-/gpt-oss-/Gemini≥3发id，否则不发（GS:165–177,270–281） | 条件有 | 无id→name回填；同名调用原id不可区分（src/api/google_generative_ai/decode.rs:135–143） | D |
| A06.05 | Q toolResult.content/isError/id | output/error区分；text join("\n")；新模型嵌套图片、旧Gemini拆user（GS:285–338） | 有error与图片，id按模型条件 | isError读取error存在性；id缺省name；图像路由按wire恢复（src/api/google_generative_ai/decode.rs:160–188） | D |
| A06.06 | Q options/toolChoice/reasoning/maxTokens | effort→level/budget；strict工具自动VALIDATED；max终值（GG:379–418,431–460; GS:423–435） | 有映射后值 | 只能回读终值，不逆猜请求level | D |
| A06.07 | Q sessionId/redacted | GG buildParams无session；GS普通thinking不携带redacted标志（GG:369–420; GS:254–268） | 无 | None/不存在 | L |
| A06.08 | R text/thinking/签名/块边界 | 相邻同类型part合并，保留最后非空签名（GG:110–171; GS:141–143） | 有内容和签名，无原块边界事件 | 合并文本+最后签名；不是全局删签名 | D |
| A06.09 | R 工具name/args/thoughtSignature及唯一已发ID | functionCall+truthy thoughtSignature（GG:175–219） | 条件已发唯一ID | 唯一ID/name/args/非空签名保持；缺/重复ID另列 | E |
| A06.09-P | R 缺失/重复toolCall.id | GG:195–201 | 无合法唯一ID | name_Date.now_counter，本地时钟注入；不全局忽略ID | P |
| A06.10 | R usage.input/read/output/reasoning/total | prompt=input+read，candidates=max(0,output−reasoning)，thoughts=reasoning（src/api/google_generative_ai/encode.rs:90–105; GG:232–241） | 有 | 有效output≥reasoning域原值，否则output提升为reasoning；read不加进最终input | D |
| A06.11 | R usage.cacheWrite/cacheWrite1h | parser cacheWrite固定0且无1h读取（GG:232–241） | 当前协议子集无写缓存量 | 0/None | L |
| A06.12 | R responseId/stopReason/errorMessage | responseId首值；finishReason；stop+call升toolUse；无任意成功流errorMessage（GG:110,224–228,272–297; GS:441–472） | 有id/finish，无独立任意error文案 | 错误文案由finishReason派生；toolUse无call→stop | D |
| A06.13 | R responseModel/redacted/namespace | parts循环不赋这些字段（GG:110–219） | 当前映射无 | 不存在；不能从thoughtSignature推redacted | L |
| A06.14 | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | G3；本表Q的消息发射分支只发内容，AM effort例外已单列 | 除明确例外无原记录 | 默认usage0/stop/None；原值不可恢复（各表Q decoder位置；types.ts:565–635） | L |
| A06.15 | Q 历史timestamp/durationMs | 本表Q convert分支不发时间；TM合成timestamp也不发 | 无原时间 | timestamp=0、duration=None（各表Q decoder位置） | L |
| A06.16 | R api/provider/model 身份 | 由目标Model初始化，响应不覆盖这些身份；G3（GG:68–84） | 不以服务端源身份传回 | 当前请求身份，不是历史源身份 | P |
| A06.17 | R timestamp/durationMs | 请求初始化Date.now；事件流本地计时（GG:68–84; ES:97–129） | 无服务端原时间载体 | 客户端时间/持续时长 | P |
| A06.18 | R usage.cost | G4各协议calculateCost路径；PM例外不适用 | 无原成本 | 目标模型费率计算值 | P |
| A06.19 | R rawStopReason | parser读native原因（GG:224–228） | 有native stop/status，不保证源rawStopReason自由值 | candidate.finishReason原值；与统一stopReason分开比较 | D |
| A06.20 | R thinkingLevel/providerThinkingLevel | 初始化及内容/终态读取不赋这些字段（GG:68–84,110–250） | 无独立原值 | None；PM的providerThinkingLevel有独立事件字段，例外见A10 | L |
| A06.21 | Q 历史assistant.api/provider/model来源 | G2匹配来源影响降级，但vendor只携带目标请求model；各表Q完整发射分支源引用 | 无独立历史身份字段 | mock填固定api/provider/目标model或空串；不能还原原身份 | L |

### 7. `google-vertex`

| 条目 | unified 字段/方向 | convert / encode（源证据） | wire 是否携带 | decode / parser 重建 | 终态 |
|---|---|---|---|---|---|
| A07.01 | Q/R 本地ADC（伪service-account + 非默认universe） | GV:95–109,357–397,429–459保持真正ADC分支；SDK JWTClient对非默认universe本地自签 | Bearer JWT + custom baseUrl，server取KeyID不验签 | 临时RSA/伪client_email/mock.invalid universe；本轮ADC 80/80绿，不需真云凭据 | D |
| A07.01-T | Q 默认Google universe ADC刷新/缺项目配置 | GV要求project/location；SDK默认cloud-platform scope走token刷新 | 凭证获取可能在HTTP前失败 | 默认云刷新链未mock；不把Express或本地自签等同所有ADC链均可离线 | T |
| A07.02 | Q model/system/user/assistant/toolResult/签名/schema | 同GS转换；tools用convertTools(...,false,strict)（GV:462–520; GS:191–400） | 与Google同构JSON，URI另有project/location | 根decoder复用，仅api retag（src/api/google_vertex/decode.rs:45–66）；Google全部Q条件规则适用 | D |
| A07.03 | Q options/session/redacted | 同Google level/budget/toolChoice；无session，redacted不发（GV:462–553; GS:254–268） | 部分字段终值有，session/redacted无 | 按GoogleQ规则；无字段不能回补 | D |
| A07.04 | R text/thinking/signatures/stop（工具ID另列） | GV:119–237,280–305独立循环 | 有parts/finishReason | 相邻同型合并、最后非空签名、native stop重映射；ID独立按A07.23条件，不聚合吞P | D |
| A07.05 | R usage.input/read/output/reasoning/total | input=prompt−cached/output=candidates+thoughts（GV:240–258） | 有 | 有效域原值；不把read再次加input | D |
| A07.06 | R usage.cacheWrite/1h/responseModel/redacted/namespace | write=0，无其他独立字段路径（GV:119–258） | 当前映射无 | 0/None | L |
| A07.07 | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | G3；本表Q的消息发射分支只发内容，AM effort例外已单列 | 除明确例外无原记录 | 默认usage0/stop/None；原值不可恢复（各表Q decoder位置；types.ts:565–635） | L |
| A07.08 | Q 历史timestamp/durationMs | 本表Q convert分支不发时间；TM合成timestamp也不发 | 无原时间 | timestamp=0、duration=None（各表Q decoder位置） | L |
| A07.09 | R api/provider/model 身份 | 由目标Model初始化，响应不覆盖这些身份；G3（GV:80–92） | 不以服务端源身份传回 | 当前请求身份，不是历史源身份 | P |
| A07.10 | R timestamp/durationMs | 请求初始化Date.now；事件流本地计时（GV:80–92; ES:97–129） | 无服务端原时间载体 | 客户端时间/持续时长 | P |
| A07.11 | R usage.cost | G4各协议calculateCost路径；PM例外不适用 | 无原成本 | 目标模型费率计算值 | P |
| A07.12 | R rawStopReason | parser读native原因（GV:232–237） | 有native stop/status，不保证源rawStopReason自由值 | candidate.finishReason原值；与统一stopReason分开比较 | D |
| A07.13 | R thinkingLevel/providerThinkingLevel | 初始化及内容/终态读取不赋这些字段（GV:80–92,119–258） | 无独立原值 | None；PM的providerThinkingLevel有独立事件字段，例外见A10 | L |
| A07.14 | Q 历史assistant.api/provider/model来源 | G2匹配来源影响降级，但vendor只携带目标请求model；各表Q完整发射分支源引用 | 无独立历史身份字段 | mock填固定api/provider/目标model或空串；不能还原原身份 | L |
| A07.15 | Q system/sections/tools | G1；systemInstruction+functionDeclarations；parametersJsonSchema（GG:379–397; GS:359–400） | 文本/完整schema快照有 | 首System，schema完整；不存在所谓Vertex默认剥meta（src/api/google_generative_ai/decode.rs:35–64） | D |
| A07.16 | Q user.text/image/empty | 字符串空串也发text；数组零parts跳过（GS:203–226） | 有text/inlineData | 单text折为字符串，图文有序（src/api/google_generative_ai/decode.rs:70–106） | D |
| A07.17 | Q text/thinking/tool thoughtSignature | 同provider/model且合法base64才保留；空块有合法签名可保留（GS:146–159,228–281; TM:95–145） | 条件有thoughtSignature | 三个签名均实际保留（src/api/google_generative_ai/decode.rs:135–156）；旧canonical漏读不是wire损失 | D |
| A07.18 | Q toolCall.id | claude-/gpt-oss-/Gemini≥3发id，否则不发（GS:165–177,270–281） | 条件有 | 无id→name回填；同名调用原id不可区分（src/api/google_generative_ai/decode.rs:135–143） | D |
| A07.19 | Q toolResult.content/isError/id | output/error区分；text join("\n")；新模型嵌套图片、旧Gemini拆user（GS:285–338） | 有error与图片，id按模型条件 | isError读取error存在性；id缺省name；图像路由按wire恢复（src/api/google_generative_ai/decode.rs:160–188） | D |
| A07.20 | Q options/toolChoice/reasoning/maxTokens | effort→level/budget；strict工具自动VALIDATED；max终值（GG:379–418,431–460; GS:423–435） | 有映射后值 | 只能回读终值，不逆猜请求level | D |
| A07.21 | Q sessionId/redacted | GG buildParams无session；GS普通thinking不携带redacted标志（GG:369–420; GS:254–268） | 无 | None/不存在 | L |
| A07.22 | R text/thinking/签名/块边界 | 相邻同类型part合并，保留最后非空签名（GG:110–171; GS:141–143） | 有内容和签名，无原块边界事件 | 合并文本+最后签名；不是全局删签名 | D |
| A07.23 | R 工具name/args/thoughtSignature及唯一已发ID | GV:184–227独立工具解析；条件发ID（src/api/google_generative_ai/encode.rs:63–73,101–117） | 条件已发唯一ID | 唯一ID/name/args/非空签名保持；缺/重复另列 | E |
| A07.23-P | R 缺失/重复toolCall.id | GV:204–210 | 无合法唯一ID | name_Date.now_counter，本地时钟注入；A07.04不得将其称D | P |
| A07.24 | R responseId/stopReason/errorMessage | responseId首值；finishReason；stop+call升toolUse；无任意成功流errorMessage（GG:110,224–228,272–297; GS:441–472） | 有id/finish，无独立任意error文案 | 错误文案由finishReason派生；toolUse无call→stop | D |
| A07.25 | R responseModel/redacted/namespace | parts循环不赋这些字段（GG:110–219） | 当前映射无 | 不存在；不能从thoughtSignature推redacted | L |

### 8. `bedrock-converse-stream`

| 条目 | unified 字段/方向 | convert / encode（源证据） | wire 是否携带 | decode / parser 重建 | 终态 |
|---|---|---|---|---|---|
| A08.01 | Q system/sections/tools | G1；buildSystemPrompt/toolSpec（BR:914–931,1148–1165） | 文本/schema快照 | System文本和tools，无section身份（src/api/bedrock_converse_stream/decode_messages.rs:7–45） | D |
| A08.02 | Q user.text/image/empty | trim空文本过滤；全空补<empty>；image.source.bytes（BR:936–982,987–1016） | 有text/image | image base64+MIME，单text折字符串（src/api/bedrock_converse_stream/decode_messages.rs:47–77） | D |
| A08.03 | Q assistant.text/thinking/signature/redacted | 空白删；Claude签名条件；redacted bytes回放（BR:1038–1076） | 条件有reasoningText.signature/redactedContent | Q redacted thinking为空串，opaque bytes保留；R占位不可套Q（src/api/bedrock_converse_stream/decode_assistant.rs:29–34） | D |
| A08.04 | Q toolCall.id/args | 跨模型id清洗；sanitizeBedrockDocument（BR:983–986,1032–1037,948–960） | 规范后ID和document | 工具对象，不能逆推被删空键（src/api/bedrock_converse_stream/decode_messages.rs:88–99） | D |
| A08.05 | Q toolResult.text/isError/id | 连续结果合并；toolUseId/status/content（BR:1089–1124） | 有 | id/status保留；toolName无独立字段→空（src/api/bedrock_converse_stream/decode_messages.rs:121–144） | D |
| A08.06 | Q toolResult.image（有效视觉域） | convertToolResultContent发送image（BR:962–973,1102,1114） | 有bytes/MIME及块顺序 | W-07已补图文逐块恢复，image复用user解码；字节及wire顺序E，jpg/base64表示仍D（src/api/bedrock_converse_stream/decode_messages.rs:113–139；decode_image.rs:4–15，同目录） | E |
| A08.07 | Q max/temperature/toolChoice/reasoning | inferenceConfig/toolConfig/additionalModelRequestFields；BR:1279–1355 | 模型/level映射后的终值 | 原level/预算到扩展的映射仍D，不从已发effort逆猜；W-07完整读取wire扩展见A08.07-E | D |
| A08.07-E | Q 已发reasoning扩展对象 | BR:1279–1332：thinking、output_config、anthropic_beta、reasoning_effort、reasoning | additionalModelRequestFields完整对象 | W-07起非空对象整体JSON序列化至options.reasoning；缺省/空对象None，按JSON值比较，不采用thinking-only双形态（src/api/bedrock_converse_stream/decode.rs:39–42） | E |
| A08.08 | R text/thinking/signature/redacted/toolCall | 按contentBlockIndex重建；redacted字节累积→base64（BR:582–690） | 有索引/签名/bytes/args | 普通签名保留，redacted文本固定占位 | D |
| A08.09 | R usage.input/output/read/write/1h/total | 独立字段和cacheDetails[ttl=1h]累加（BR:710–720） | 有 | read/write/1h可逆；wire.totalTokens=0触发input+output回退 | D |
| A08.10 | R usage.reasoning/responseId/responseModel | 初始化及事件无对应读取（BR:137–153,298–325,710–720） | 此锁定适配器无载体 | None；HTTP requestId不等于responseId | L |
| A08.11 | R stopReason/errorMessage | stop映射；error/aborted被encoder映guardrail_intervened（BR:1185–1198; src/api/bedrock_converse_stream/encode.rs:38–44） | 有stopReason，无任意errorMessage | error + Provider stopped with: guardrail_intervened；Deferred当前encoder落end_turn，非精确 | D |
| A08.12 | R textSignature/tool thoughtSignature/namespace | text/toolUse parser不赋这些（BR:582–632） | 当前映射无 | 不存在 | L |
| A08.13 | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | G3；本表Q的消息发射分支只发内容，AM effort例外已单列 | 除明确例外无原记录 | 默认usage0/stop/None；原值不可恢复（各表Q decoder位置；types.ts:565–635） | L |
| A08.14 | Q 历史timestamp/durationMs | 本表Q convert分支不发时间；TM合成timestamp也不发 | 无原时间 | timestamp=0、duration=None（各表Q decoder位置） | L |
| A08.15 | R api/provider/model 身份 | 由目标Model初始化，响应不覆盖这些身份；G3（BR:137–153） | 不以服务端源身份传回 | 当前请求身份，不是历史源身份 | P |
| A08.16 | R timestamp/durationMs | 请求初始化Date.now；事件流本地计时（BR:137–153; ES:97–129） | 无服务端原时间载体 | 客户端时间/持续时长 | P |
| A08.17 | R usage.cost | G4各协议calculateCost路径；PM例外不适用 | 无原成本 | 目标模型费率计算值 | P |
| A08.18 | R rawStopReason | parser读native原因（BR:310–313） | 有native stop/status，不保证源rawStopReason自由值 | messageStop.stopReason原值；与统一stopReason分开比较 | D |
| A08.19 | R thinkingLevel/providerThinkingLevel | 初始化及内容/终态读取不赋这些字段（BR:137–153,298–325） | 无独立原值 | None；PM的providerThinkingLevel有独立事件字段，例外见A10 | L |
| A08.20 | Q 历史assistant.api/provider/model来源 | G2匹配来源影响降级，但vendor只携带目标请求model；各表Q完整发射分支源引用 | 无独立历史身份字段 | mock填固定api/provider/目标model或空串；不能还原原身份 | L |
| A08.21 | Q 未单列的textSignature/tool thoughtSignature/namespace | 目标发射只含本表已列支持字段（BR:987–1016,1032–1076,1089–1124） | 未列支持的独立签名/namespace无；工具结果textSignature亦不发 | 对应optional为None；thinking原生签名规则仍按本表，不全局删除 | L |

### 9. `mistral-conversations`

| 条目 | unified 字段/方向 | convert / encode（源证据） | wire 是否携带 | decode / parser 重建 | 终态 |
|---|---|---|---|---|---|
| A09.01 | Q system/sections/tools | G1；tools parameters严格化终值（MI:777–807） | 文本/schema快照 | W-07起tools挂已有首System，否则合成空System；历史折叠仍D（src/api/mistral_conversations/decode_messages.rs:113–128） | D |
| A09.01-E | Q wire工具快照（不含未读strict） | MI:777–807 tools顶层独立发 | name/description/schema/order | tools-only/no-system亦恢复；tools空不合成，已发工具字段E（src/api/mistral_conversations/decode_messages.rs:113–128；decode_content.rs:74–97，同目录） | E |
| A09.02 | Q user.text/image | data URL及文本；非视觉经G2降级（MI:812–839） | 有剩余parts | 单text折串/图文保序（src/api/mistral_conversations/decode_messages.rs:24–35） | D |
| A09.03 | Q assistant.text/thinking正常域 | 逐块保序；只限块类型未被跨模型转换、无需过滤/净化的非trim空文本，且消息边界未合并（TM:95–117；MI:844–858） | 独立content chunks | 逐块不合并，文本及块类型满足前提时精确（src/api/mistral_conversations/decode_messages.rs:50–83） | E |
| A09.03-D | Q assistant跨模型thinking/空白/非法surrogate文本 | TM:95–117将跨模型非空且非redacted thinking转text；MI:844–858先trim判空再sanitize | 转换后块类型；被过滤块不发，其余发净化后的原文（可为空） | thinking→text及过滤/清洗均为D，不用“保序”冒充原块类型/原文全域E | D |
| A09.04 | Q toolCall.id/name/arguments/交错位置 | sameModel（api/provider/model全等）保持ID；仅cross-model调用9字符alnum normalizer：attempt0且clean长9保留，否则hash/碰撞重试，结果ID同步；工具独立于content（TM:95–98,129–151；MI:238–267,860–871） | 同模型原ID，跨模型规范后ID；name/JSON args有，无content/calls原交错 | ID：sameModel原值保持，cross-model不能保证恢复原ID；位置：content后追加calls，原交错丢失（src/api/mistral_conversations/decode_messages.rs:85–88） | D |
| A09.05 | Q toolResult.text/images/isError | text join后trim，错误前缀[tool error]；图片随content发（MI:875–920） | 有图文/错误前缀，无独立isError | W-07已读图文，isError仍false；文本聚合/前缀与原isError损失仍D（src/api/mistral_conversations/decode_messages.rs:94–109） | D |
| A09.05-E | Q toolResult视觉图片与wire顺序 | MI:883–896 imageUrl data URL经序列化为image_url字符串 | 有data/MIME及顺序 | W-07逐块恢复text/image；data URL字符串及已有url对象均支持，非data URL拒绝；不从错误前缀猜isError（src/api/mistral_conversations/decode_content.rs:16–40；decode_messages.rs:94–109，同目录） | E |
| A09.06 | Q/R textSignature/thinkingSignature/redacted/tool thoughtSignature/namespace | 请求chunks不发；回复parser不读（MI:840–871,644–745） | 当前子集无 | 不存在；thinking文本本身可表达 | L |
| A09.07 | Q options/session | max_tokens/temperature/tool_choice/reasoning_effort/prompt_mode/prompt_cache_key（MI:527–548,386–430） | 有终值 | effort优先；body cache key/header亲和按协议回读（src/api/mistral_conversations/decode.rs:8–54） | D |
| A09.08 | R text/thinking/empty | 有签名thinking因目标不承载签名先转text；空白/redacted删除（src/api/encode_thinking.rs:32–90）；无签名thinking仍走原chunks，parser空delta跳过、相邻同型合并（MI:644–704） | 有文本，无独立块边界 | 非空累积、交错类型切换；原签名丢弃，不读顶层reasoning_content | D |
| A09.09 | R toolCall.id/name/args | 按tool_calls index或callId找slot；缺id确定性derive；name仅建块时取首段，只有arguments逐段累积并解析（MI:710–749） | 有或可缺 | 一般wire不拼接后续name；当前encoder单帧完整name、合法非空ID及有效object args域可E（src/api/mistral_conversations/encode.rs:18–20） | D |
| A09.10 | R usage.input/output/read/total | cached多拼写，clamp到[0,prompt]；input=prompt−read（MI:555–573,616–628） | 有 | 有效域原值，total=0回退求和 | D |
| A09.11 | R usage.cacheWrite/1h/reasoning | write固定0、无1h/reasoning读取（MI:616–628） | 当前子集无 | 0/None | L |
| A09.12 | R responseId/stop/error | id首值；finish_reason map（MI:609–614,936–951） | 有id/reason | 缺id encoder mock-mistral；任意error文案→固定server error | D |
| A09.13 | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | G3；本表Q的消息发射分支只发内容，AM effort例外已单列 | 除明确例外无原记录 | 默认usage0/stop/None；原值不可恢复（各表Q decoder位置；types.ts:565–635） | L |
| A09.14 | Q 历史timestamp/durationMs | 本表Q convert分支不发时间；TM合成timestamp也不发 | 无原时间 | timestamp=0、duration=None（各表Q decoder位置） | L |
| A09.15 | R api/provider/model 身份 | 由目标Model初始化，响应不覆盖这些身份；G3（MI:218–235） | 不以服务端源身份传回 | 当前请求身份，不是历史源身份 | P |
| A09.16 | R timestamp/durationMs | 请求初始化Date.now；事件流本地计时（MI:218–235; ES:97–129） | 无服务端原时间载体 | 客户端时间/持续时长 | P |
| A09.17 | R usage.cost | G4各协议calculateCost路径；PM例外不适用 | 无原成本 | 目标模型费率计算值 | P |
| A09.18 | R rawStopReason | parser读native原因（MI:633–636） | 有native stop/status，不保证源rawStopReason自由值 | choice.finish_reason原值；与统一stopReason分开比较 | D |
| A09.19 | R thinkingLevel/providerThinkingLevel | 初始化及内容/终态读取不赋这些字段（MI:218–235,609–745） | 无独立原值 | None；PM的providerThinkingLevel有独立事件字段，例外见A10 | L |
| A09.20 | Q 历史assistant.api/provider/model来源 | G2匹配来源影响降级，但vendor只携带目标请求model；各表Q完整发射分支源引用 | 无独立历史身份字段 | mock填固定api/provider/目标model或空串；不能还原原身份 | L |
| A09.21 | Q 未单列的textSignature/tool thoughtSignature/namespace | 目标发射只含本表已列支持字段（MI:812–871,875–920） | 未列支持的独立签名/namespace无；工具结果textSignature亦不发 | 对应optional为None；thinking原生签名规则仍按本表，不全局删除 | L |
| A09.22 | R responseModel/endTurn | parser只读chunk.id/usage/choice内容与finish_reason（MI:609–745） | 当前适配器不读取chunk.model为responseModel，也无end_turn读取 | None；不能因encoder发model就宣称客户端保留 | L |

### 10. `pi-messages`

| 条目 | unified 字段/方向 | convert / encode（源证据） | wire 是否携带 | decode / parser 重建 | 终态 |
|---|---|---|---|---|---|
| A10.01 | Q model/context/messages/order | 直接JSON.stringify({model,context,options})，不走TM/TR（PM:375–400） | 全部统一字段原样有 | serde统一模型；不删错误历史/空块/孤儿（src/api/pi_messages/decode.rs:16–31; src/api/pi_messages/vendor.rs:6–11） | E |
| A10.02 | Q text/image/thinking/signatures/redacted/toolCall/namespace | 直接context JSON（PM:375–400; types.ts:414–444） | 有全部字段 | 统一内容struct原值（src/model/content.rs:3–47） | E |
| A10.03 | Q timestamp/durationMs/usage/cost/历史响应元数据 | 直接context JSON（PM:375–400; types.ts:565–635） | 有 | 已建模字段保留；不能强制归零（src/model/message.rs:57–99） | E |
| A10.04 | Q system.sections键值/工具增删 | 原始sections/toolsAdded/toolsRemoved JSON（PM:375–400; types.ts:541–556） | 有 | 键值包括null保留；工具原值 | E |
| A10.05 | Q sections插入顺序 | wire对象顺序仍可观测，TS声明有序（types.ts:546–551） | 有序列化次序 | Rust BTreeMap字母序，当前数据模型损失，不是wire损失（src/model/message.rs:35） | D |
| A10.06 | Q diagnostics/deferred/tool.details/usage/nestedCalls | 直接context包含这些TS记录（PM:375–400; types.ts:577–580,626–630） | 有 | Rust struct未建模而忽略，不得列入B无载体（src/model/message.rs:57–99） | D |
| A10.07 | Q options | max/temperature/session/reasoning直传；toolChoice可对象；cacheRetention也发（PM:375–380） | 全部有 | 对象toolChoice JSON值/类型原样保留（新增A10.07-E）；cacheRetention仍未建模（src/api/pi_messages/decode.rs:22–27; src/model/request.rs:18–28） | D |
| A10.08 | R content/text/thinking/signatures/redacted/toolCall/namespace/empty | start/delta/end，end覆盖最终值（PM:220–270） | 有对应终帧字段 | 块/空串/工具参数与签名原值 | E |
| A10.09 | R usage/cost/total/read/write/1h/reasoning | 终帧event.usage直赋（PM:195–217） | 有 | 完整原值，不套vendor重算 | E |
| A10.10 | R responseId/providerThinkingLevel | done/error可选字段（PM:195–217） | 有 | 原值 | E |
| A10.11 | R 五合法stopReason及error/aborted errorMessage | done=stop/length/toolUse；error=error/aborted（PM:195–217; src/api/pi_messages/encode.rs:64–79） | 五类终态原值有，错误帧errorMessage有 | 合法域精确；pending/deferred明确输入拒绝非D/T | E |
| A10.11-L | R 成功stop/length/toolUse的errorMessage | Done无该槽（src/api/pi_messages/encode.rs:64–69） | 无 | 成功源文案不重建 | L |
| A10.12 | R responseModel/thinkingLevel/rawStopReason/endTurn | 事件类型与consume无字段（PM:55–87,195–270） | 无 | None；与Q保留不同 | L |
| A10.13 | R api/provider/model 身份 | 由目标Model初始化，响应不覆盖这些身份；G3（PM:181–193） | 不以服务端源身份传回 | 当前请求身份，不是历史源身份 | P |
| A10.14 | R timestamp/durationMs | 请求初始化Date.now；事件流本地计时（PM:181–193; ES:97–129） | 无服务端原时间载体 | 客户端时间/持续时长 | P |

所有 L 均限定“锁定转换/解析子集”；不是对未来vendor扩展、任意onPayload、side channel的信息容量证明。D行暴露的具体缺陷/未采用规则在B/C列出；未采用投影不冒充当前正常值，不能用D给现状发PASS。上述表格不把unsupported输入拒绝硬塞为transport：本五分类用于合法可组装字段；O18编号行的D现为owner批准的text投影，**原始18案已复跑通过**；原signature仍丢失，不能声称E。历史拒绝快照保留在D1/D2，当前证据见o18-resolution.md。

## B. 不可逆对象全集与既有 finding 对账

### B1. 严格的“wire 不携带原信息”权威清单

这里的全集以 `types.ts:414–466,541–635` 的字段集合及 A 的条件分支为边界；不是无限JSON扩展的全集。**对象**是被消去的区别，而不是整个字段名：例如 read/write 中只有write消失，thinking中只有签名/边界消失。每项都给出非单射机制；同一对象可出现在多个协议，不重复计数为多个根因。

| ID | 被消去的信息对象 / 适用域 | wire 不携带的证明与边界 | A 对应 |
|---|---|---|---|
| I01 | Q vendor历史timestamp/durationMs | vendor内容发射不发送原时间；例如 `SH:219–350; AM:1400–1522; GS:203–338; MI:807–920; BR:987–1124`。不同时间同内容产生同wire。PM Q是反例，必须排除（`PM:375–400`）。 | 每vendor表末尾Q时间行 |
| I02 | Q vendor历史usage/cost/responseId/responseModel/stopReason/errorMessage/rawStopReason/endTurn/thinkingLevel | 一般发射仅内容；`SH:255–350; OCC:1293–1405; AM:1440–1500; GS:228–281`。error/aborted整条先删（`TM:201–203`）。AM native providerThinkingLevel标记有载体（`AM:1500–1507,1563–1577`），PM全部已建模元数据有载体，不包含在本项。 | G3、各表历史元数据行 |
| I03 | Q vendor诊断/deferred以及工具details/usage/nestedCalls/duration记录 | `types.ts:577–580,626–635` 定义记录字段；`SH:332–347; AM:1329–1345; GS:285–338; MI:875–920; BR:1089–1124` 都不发记录。PM直接JSON确有载体，Rust未建模属于N6，排除。 | G3 |
| I04 | Q section名/patch历史、system分布、工具增删历史 | `TR:58–95,108–119; TX:15–39` 只发重放结果/渲染文本；同终态不同patch历史同wire。PM/native tool changes分支保留工具事件，不能一概删除（`PM:375–400; AM:1378–1399; SH:184–227`）。 | G1，各表system |
| I05 | Q constrainedSampling原声明、strict化前schema的可空/required意图 | strict化增加required/additionalProperties等；原来已strict与客户端补strict可得同parameters（`api/constrained-sampling.ts:122–143,225–248`）。**wire strict标志存在**（`SH:381–394; AM:1652–1657`），mock丢strict不属于wire无信息；仅原意图的精确逆推列本项。 | 各表tools |
| I06 | Q AM非strict legacy schema根级非三字段信息 | `AM:1637–1650` 仅发送type/properties/required；改变$schema/$comment等根字段不改wire。strict=true分支扩展parameters，不属此域；nested properties没有被删除。 | A05.06 |
| I07 | Q/R 原块边界/交错/助手消息边界 | OCC Q text join及工具分列 `OCC:1298–1405`，R单slot `:480–505,611–680`；Responses Q连续items无源message边界 `SH:255–331; src/api/openai_responses/decode.rs:118–142`；Google/Mistral R相邻同型累积 `GG:114–171; MI:644–704`。AM/BR indexed块、PM块不能套这个声明。 | 各表内容边界 |
| I08 | Q过滤的空白块/空消息；R无事件slot的真空块 | `OCC:1266,1298–1301,1398–1403; AM:1401–1447,1502–1505; GS:243–268; MI:844–858; BR:939–945,1021–1026,1050`。不同空块个数→同wire。Responses R added建slot保留空thinking（`SH:464–475`）；PM保留空块（`PM:220–244`）；不得统一删空块。 | C-K1 |
| I09 | Q规范化前toolCall ID / 不发送的item ID / 无ID Google模型的call区别 | `OCC:1202–1225; SH:154–177,303–305; MI:238–267; GS:165–177,279`。sanitize/truncate/hash非单射，name回填不是原id。跨源映射有规则但不反推。 | 各表工具ID |
| I10 | Q被降级的非视觉图片与跨模型redacted内容 | `TM:12–56,104–105` 占位/删除使不同图片/不同redacted得到同wire。被移动到user的图片仍存在，不能算图片内容丢失。 | G2 |
| I11 | Q被剥离的跨模型签名/非合法Google base64签名 | `TM:119–134; GS:146–159,243–281`。目标text/thoughtSignature不带原值；原签名类别/真实性也不能从text推回。 | A06.03及G2 |
| I12 | Q OCC有details时的可见thinking、未识别opaque时的thinking与thinking-only助手 | `OCC:1304–1347,1383–1405`：有details抑制reasoning字段；非3字段名且非details不发thinking；没有content/tool_calls整消息删除。details文本不能擅自当可见thinking。 | A01.04，N3 |
| I13 | Q Responses仅delta积累而不在signature item summary/content中的thinking | `SH:263–268` 只回放item；改变block.thinking不改签名item的wire。R有delta fallback（`:688–693`）是另一方向，不救Q。 | A02.03 |
| I14 | Q toolResult的独立isError状态（OCC/Responses/Mistral） | `OCC:1406–1424; SH:332–347; MI:875–920`。MI可保留错误前缀文本，但与本来文本以[tool error]开头的正常结果不可区分；不能无依据反推布尔。AM/GS/BR有显式字段，排除。 | A01.07/A02.07/A09.05 |
| I15 | Q toolResult独立toolName（OCC默认/BR），或其独立于call的差异（AM/Responses） | `OCC:1421–1423; BR:1089–1124` 不发name；`AM:1339–1345; SH:332–347` 无独立name但call保留name，可配对恢复正常工具名，却恢复不了故意不同的result.toolName。Google/Mistral/PM发name，排除。 | 各表toolResult |
| I16 | Q工具图片原归属及text分块边界、占位来源 | `OCC:1406–1467` 多个结果图汇到后随user；`GS:285–338` 老Gemini拆user；`SH:81–106; AM:1330–1345; MI:875–920` join/占位可与真实同文本碰撞。**图片字节在wire上仍有的，不列“图片内容无载体”**。 | 各表工具内容 |
| I17 | R目标不读取/本映射不承载的签名、redacted、namespace；O18已采用有损text投影 | `OCC:480–505,611–680` 是字段名/details JSON；`SH:688–703` 是reasoning-item/v1签名；`MI:644–745` 无签名赋值；`AM:729–768; BR:582–690` 只支持各自块语义。Responses输出签名恒为JSON item，不能原样输出reasoning_content；**原串不能以同一parsed signature形状回读≠wire没有字符串容量≠thinking不可编码**。O18已采用丢原签名、明文转text的统一降级；不同外域签名可投影为相同text，因此原签名损失属于本I项。历史拒绝本身不是非单射证据。Google/PM支持对应签名，BR/AM支持opaque thinking签名，不能全协议删除。 | B-O18，A各签名 |
| I18 | R usage不可表达细分 | Google/Vertex/Mistral write=0（`GG:232–241; GV:240–249; MI:616–628`）；OCC/Responses/Google/Vertex/Mistral无1h拆分读取（`OCC:1530–1555; SH:560–575`）；BR/MI无reasoning读取（`BR:710–720; MI:616–628`）。read均有路径；AM/BR/PM的1h有路径，必须保留。 | 各表usage |
| I19 | R原cost、OCC/AM原totalTokens及零值回退区别 | vendor cost本地计算（G4）；OCC/AM total派生（`OCC:1556–1559; AM:717–721`）；BR/MI total=0与缺失走回退（`BR:719; MI:624–626`）。Responses/Google/Vertex非零total有wire，PM全部total/cost有wire，不能用全局ignore掩盖。 | G4/各表usage |
| I20 | R服务端源身份/原timestamp/duration与没有事件槽的元数据 | 目标身份/时间本地初始化+ES测量（G3/G4）；PM responseModel/thinkingLevel/rawStopReason/endTurn无事件槽（`PM:55–87,195–270`）；BR无responseId/responseModel（`BR:137–153,298–325`）。CX end_turn实际有读路径（`CX:775–783`），不是本项；AM/OCC responseModel实际有条件路径。 | 各表P与metadata |
| I21 | R原stop枚举、任意error文案/原rawStopReason的被折叠区别 | OCC只finish_reason前缀（`OCC:1582–1590; src/api/openai_completions/encode.rs:58–73`）；Responses toolUse无call→stop（`SH:594–595`）；Google同理（`GG:272–275`）；BR guardrail、MI固定error（`BR:1185–1198; MI:936–951`）。PM error/aborted明示可逆，不得把aborted一律删掉；native raw原因与统一stop的关系是有规则投影。 | 各表stop |
| I22 | Q Bedrock document空字符串键 | `BR:948–960` 递归删除key.length=0；差异只在空键的两个args有同wire。JSON非空键其余内容应保持。 | A08.04 |
| I23 | Q Codex maxTokens、Codex默认头/体及Azure仅body载体的长session后缀；被门控的temperature/effort等 | `CX:528–598` 无max_output_tokens；Azure session只body截64（`AZ:155–170,202; api/openai-prompt-cache.ts:1–7`）。Codex在建头/体前统一截64（`CX:276–284,1676–1679`）；OR原长session header可保存（`OR:277–284`），不要普遍截断。AM thinking门控温度（`AM:1243–1252`），原值在不发送域无载体。 | A03.04/A04.04 |
| I24 | 被sanitizeSurrogates删除的非法代理字符 | `utils/sanitize-unicode.ts:21–24` 删除未配对高/低代理项；`SH:226,233,240; GS:209–223; MI:855`调用。Rust String合法UTF-8不会有该对象；不是把合法Unicode也删掉。 | G2补充 |

### B2. O18：owner批准的确定性text降级（18案已绿）

**源码查证**：TM按api/provider/model三等判同源（`TM:95–98`）；跨源redacted删除、空白thinking删除、其余thinking变成仅type/text的纯文本（`TM:104–117`）。Responses先TM（`SH:179`），剩余签名thinking才JSON.parse回放（`SH:264–267`），text发output_text（`SH:282–289`）；Anthropic先TM（`AM:1168,1197–1205`），text发text（`AM:1443–1448`），本域opaque/redacted另保留（`AM:1450–1483`）；Google由`GG:374`调用`GS:191–200`，跨源text不带thought/signature（`GS:234–266`）。因此pi跨源明文thinking不是继续保留thinking块。

**当前规则**：全协议encode共用`src/api/encode_thinking.rs:32–90`。仅在源块有签名且目标不支持该签名域时，非redacted且trim非空→`Text{text:原thinking,textSignature:None}`，否则删除；不trim保留文本。不根据reply的api/provider/model做TM全量跨模型转换。无签名块维持各协议既有规则。Responses/Azure/Codex支持type=reasoning的JSON item；OCC支持三字段名或现有details门控；Mistral不承载任何thinking签名；AM/Google/Vertex/Bedrock/PM原生opaque保留。这些“支持”是锁定mock→pi解析支持域，不保证真实提供商接受或签名真实性。

**取代关系**：本轮owner明确采用上述text投影，取代原B2/K2/F1的“外域opaque→unsigned reasoning summary”未批准草案。旧草案只证明wire可构造，不等于pi跨源convert规则；不能将外域opaque塞入encrypted_content、伪造reasoning item，或把新item签名说成原签名。原本就无签名的Responses thinking仍可走原unsigned summary分支，与外域签名降级不是同一情形。

**签名损失**：原opaque字节、原提供商身份/真实性仍为I17的L；明文块类型thinking→text为D。Responses文本parser会生成v1 textSignature（`SH:701–703`），不是保留旧thinkingSignature。合法reasoning item仍按JSON值语义重放，最终signature为JSON.stringify(item)（`SH:688–693`）。

**复跑入账**：原始语料、案例主键及比较严格度不变；`tests/canonical-o18-replay.test.mjs:12–35`使用真实锁定Responses/Azure stream/parser，共18/18 PASS，逐案expected/actual见`tests/canonical-o18-results.json`。定义的text投影已落地，不再称“当前域拒绝”。D1/D2仍是原634案历史快照；不把本轮18项局部复跑冒充全矩阵重跑。执行、源码行号和剩余transport边界见`o18-resolution.md`。

### B3. T63、WS、Vertex ADC 的分层裁决

历史T63为SSE压缩先触发String extractor UTF-8拒绝；本轮改bytes→系统zstd解压→UTF-8/JSON/capture，详见transport-unblock.md。现828案中824绿、4红；原89个zstd blocker中88转绿、1暴露lone-surrogate JSON定义域finding。3个ByteString仍在客户端拒绝；不将其改计通过。

WS不是历史T63的成因，但确实可达：默认auto优先WS；CX:295–372规定开始前transport故障可SSE回退，开始后/非transport错误抛出。本轮axum ws实现升级、JSON response.create、共享decode/execute/encode与连接内续传；显式WS矩阵、auto缓存增量、未知ID和无凭据命名/专用挂载均已验证。cacheRetention=none时x-client-request-id为UUIDv7（CX:276–290），请求oracle独立校验其格式与时间窗，不回填actual。完整故障注入/重连竞态仍未穷举。

Vertex的普通key/ADC共享buildParams，但不能互相冒充覆盖。当前新增真正ADC矩阵80/80：marker强制ADC、project/location、GOOGLE_APPLICATION_CREDENTIALS临时伪service-account，非默认mock.invalid universe触发google-auth-library本地JWT签名，custom baseUrl命中现有Bearer KeyID路由、不验签。默认Google universe的用户刷新/服务账号换token仍依赖云；不是整个ADC永久边界。证据与精确条件见transport-unblock.md。

### B4. 既有 findings 全量收敛与新发现

| 既有finding集合 | 权威归属 / 当前裁决 | 源码核验 / 谁的说法有误 |
|---|---|---|
| final-ledger T63 / O18 / U0 / M0 | T→B3；O→B2/I17；U0/M0仍是本快照事实 | `CX:377–385; src/mounts/routing.rs:22; SH:688–693`；O18历史fail已由B2批准text降级并18/18复跑关闭；原快照不回写 |
| fix-rust原23案 R四案 | I17+B2；数量仅历史，现18 | `fix-rust.md:50–53`；“发请求前oracle抛”错，`tests/matrix-lib.mjs:62–73` |
| 原23案 A-S一案 | I06，仍声明不可逆的非strict域 | `AM:1637–1650`；不能推广strict域 |
| 原23案 A-M七案 | 可逆responseModel条件映射，不列I20的无载体 | `AM:699–710`；旧expected漏字段已修，`fix-rust.md:55–61,98` |
| 原23案 G四案 | input/read逆公式精确；write另属I18 | `GG:232–241; GV:240–249`；旧expected加read是oracle错误（`fix-rust.md:62–65`） |
| 原23案 M-Q一案 | wire有thinking、可修decoder；已microfix，当前不再fail | `MI:840–858; src/api/mistral_conversations/decode_messages.rs:50–83`；旧聚合oracle也错（`mistral-microfix.md:124–128`） |
| 原23案 M-T/M-U六案 | thinking chunk/read encoder缺口已修；write/signature I18/I17 | `MI:644–680,616–628; src/api/mistral_conversations/encode.rs:16,36`；不能把thinking/read视为不可逆 |
| fuzz Responses s50/107/195 | oracle漏delta fallback；不是空块移位 | `SH:464–475,688–693; fuzz.md:18–36`；真空thinking仍保留 |
| fuzz OCC s30/53/114/156/189 | oracle漏details最终覆盖/合并，已修reply oracle | `OCC:123–152,261–273,331–338,669–680; fuzz.md:85–97`；不从details造visible thinking |
| Bedrock旧transport30案、usage拼写/1h | AWS EventStream已实现；read/write/1h有字段；不是I18泛删对象 | `src/api/bedrock_converse_stream/encode.rs:45–73; BR:710–720; final-ledger.md:149–153` |
| script F2 status/code/message透传 | registry类型推断问题已修，与协议信息无载体无关 | `src/registry/mod.rs:179–182; fix-rust.md:9–15`；HTTP错误与正常SSE终止需区分 |
| family F1/F2/F3/F7 | Azure deployment在body、Codex无maxTokens/default instructions、Azure body-only session | `AZ:155–170,199–207; CX:554–564; api/azure-openai-config.ts:27–35`；F2=I23、F3=D/P默认、F7=I23 |
| family F4/F5/F6 | 扩展option未建模不是wire无；end_turn可读不是无槽；provider硬编码是mock填充 | `CX:560–564,775–783; src/model/request.rs:18–28; src/api/openai_codex_responses/decode.rs:57–63`；F5“AssistantMessage无endTurn”为历史错误，当前family-variants.md第3/5节已否定；冻结时字段存在但不发为L；W-07现按A04.08成功/长度域E、A04.08-L错误域L分条件 |
| family F8 base64 | JWT是认证载体处理，不是内容不可逆 | `CX:1628–1639; src/api/openai_codex_responses/decode.rs:71–109`；mock兼容两种字母表；本任务不推测所有真实JWT行为 |
| Google规格Vertex useParameters | 两适配器都传false，完整parametersJsonSchema | `GG:395–397; GV:489; GS:388–399`；旧Google页“Vertex路径剥meta”已在当前google-generative-ai.md第4节G16纠正；family-variants.md第2.4节schema行与第4节Q严格schema均同源码 |
| OCC规格回复textSignature“报错” | 当前encoder未检查textSignature，实际静默不发；I17 | `src/api/openai_completions/encode.rs:18–45`；旧OCC页textSignature报错finding已解决；当前openai-completions.md第3节textSignature行及第4节显式裁决已记静默不发，image确实报错 |
| PM时间/sections/记录字段/cacheRetention | 时间保留；顺序/字段建模限制不是wire无；回复另有本地时钟 | `PM:375–400,181–270; src/model/message.rs:35,57–99; src/api/pi_messages/vendor.rs:14–22`；request.rs“wire无timestamp”不能套PM |

新finding（未被81个fail暴露的也必须报告）：

| ID | 发现 / 定性 | 证据与影响；不修改现状 |
|---|---|---|
| N1 | Google/Vertex request canonical丢合法签名，oracle缺口 | `tests/canonical-gai.mjs:45–59,129–141`发送模拟保留但重建丢掉text/thinking签名，工具签名也未模拟；`GS:243–281`与`src/api/google_generative_ai/decode.rs:135–156`均有。已有PASS语料不能证明这条路径。 |
| N2 | Responses request canonical不是完整源映射，且吞异常 | `tests/canonical-ores.mjs:43,75–86,90–96,161`使用简化ID normalizer、吞JSON.parse、忽略source textSignature/phase与namespace；真实`SH:154–177,265–288,316–325`不同。Q malformed same-model签名真实会抛，不能canonical静默丢；tool output图片也在`:102–107`简化成文本。 |
| N3 | OCC request canonical details carrier错误 | `tests/canonical-occ.mjs:129–144,163–168`把每块signature串组成数组，不解析details对象；真实`OCC:1304–1319,1340–1347,1383–1385`只选首合法details且抑制可见reasoning。任意opaque时oracle造details但源码不会。既有reply canonical修复不修Q。 |
| N4 | 历史Bedrock工具图片漏读，W-07已修 | `BR:962–973`发image；现`src/api/bedrock_converse_stream/decode_messages.rs:113–139`恢复图文。W-06 oracle仍投掉图片，两项vision用例新红交W-08；不是协议损失。 |
| N5 | 历史Mistral工具图片/tools-only缺口，W-07已修 | `MI:777–810,875–920`已有wire载体；现`src/api/mistral_conversations/decode_messages.rs:94–128`读图并合成工具System，`decode_content.rs:16–40`处理data URL。W-06旧oracle仍丢图/不合成；两项vision及tools-only新红交W-08。 |
| N6 | PM统一模型损失，不应和I清单混为一谈 | diagnostics/deferred/tool记录/cacheRetention在wire；Rust缺字段（`PM:375–400; src/model/message.rs:57–99; src/api/pi_messages/vendor.rs:14–22`）。sections BTreeMap还改变有意义的顺序（`types.ts:546–551; src/model/message.rs:35`）。这不是“网络不带信息”。 |
| N7 | oracle证据不独立及全局ignore遮挡能力 | `tests/matrix-lib.mjs:46–54,79–99,143–149`从got复制部分responseId/errorMessage，并对所有vendor忽略total/cost/providerThinkingLevel/rawStopReason；但SH total、AM reasoning/rawStop、BR 1h等可观察字段须独立预测。不能用553 PASS证明被ignore的字段。 |
| N8 | Google R缺ID是pi注入，不是可逆id被验证 | `GG:195–201`缺/重复id造本地时间ID；`tests/matrix-lib.mjs:67–68`忽略content.id。模型mock-gemini不发id，当前PASS不覆盖有唯一ID的模型分支（`GS:165–177; tests/models-shared.mjs:17–18`）。 |
| N9 | unsupported stop被部分encoder静默折叠，属于策略/coverage缺口 | BR Deferred走end_turn（`src/api/bedrock_converse_stream/encode.rs:6–8,38–43`）；MI Deferred走stop/Aborted走abort→parser error（`src/api/mistral_conversations/encode.rs:28–34; MI:936–951`）。不应把当前默认分支描述为客户端不可能支持所有stop的统一定理。 |
| N10 | Codex endTurn缺口，W-07已补；本轮zstd/WS已解阻验证 | `CX:775–783`读boolean；`src/api/openai_codex_responses/encode.rs:1–7`专用wrapper补发。failed先抛错（CX:766–772），仍无正常往返。true/false/None单测及本轮真实SDK SSE/WS成功/长度/toolUse终帧通过；见transport-unblock.md。 |

上述N1/N2/N3已用只读Node内联断言实测canonical输出，并与锁定converter实际产物对比（OCC用onPayload抛出sentinel阻止联网）（本轮，见D验证）；N4/N5/N6/N9/N10为源路径静态证据，未声称已复跑新失败矩阵。81个旧fail都已有B2/B3解释，**解释不了的旧fail为0**；这不等于新finding为0。

## C. 从图谱推导的最小充分修复集（W-07状态见C2）

### C1. 应统一的 canonical 契约（8条）

这些规则是**建议的最小规则集**，不是已经改变的支持域，也不是本次批准实施。统一的是判定方法，不是强迫十协议有一样的wire结果。

| ID | 规则 | 最小必要约束 / 派生证据 |
|---|---|---|
| K1 | 空块策略表，而非全局strip-empty | 按方向、模型、signature、wire slot能力区分：Responses R/PM保空，Google Q签名空块保留，OCC R无文本无details不建slot，BR Q空user补<empty>，AM/MI过滤空白。用A/I08制定独立期待；`SH:464–475; PM:220–244; GS:243–268; OCC:487–497,611–680; BR:939–945`。 |
| K2 | 签名域策略：同域重放、外域text投影、redacted不伪造 | owner已批准并实施B2：外域明文转text、空白/redacted删；替代旧summary-item草案。AM/BR/Google/PM原生opaque保留，Responses合法reasoning JSON保留；无签名分支不变。统一出口src/api/encode_thinking.rs:32–90；请求侧依据TM:99–116、SH:179,264–267、AM:1168,1443–1483、GG:374→GS:200,234–266。18案复跑见o18-resolution.md。 |
| K3 | Q/R两条独立组装算法，非一个“近似统一形状” | OCC Q首details抑制visible、R同时可见delta+details；Responses Q只item文本、R有delta fallback；Mistral Q逐块保序、R相邻同型合并。`OCC:1304–1347,669–680; SH:263–268,688–693; MI:840–858,644–704`。修N1–N3源映射，而不是写迁就decoder的oracle。 |
| K4 | ID三种来源独立建模：wire原值 / 确定性normalize / pi本地注入 | 同域ID精确断言；跨域ID按各算法独立预测；Google缺/重复ID用来源规则验证格式/唯一性/配对，不全局忽略所有ID。`SH:154–177; MI:238–267; OCC:1202–1225; GG:195–201; tests/matrix-lib.mjs:67–68`。 |
| K5 | usage能力矩阵与合法计数域 | read总保留；write/1h/reasoning按I18；input逆公式不能错加read；total在SH/Google/PM支持域独立比较；cost只在PM原样比，vendor验证费率计算而非源cost。声明output≥reasoning等域条件，或显式比较饱和规则。`SH:560–575; GG:232–241; PM:195–217; src/api/google_generative_ai/encode.rs:90–105`。 |
| K6 | 身份/时钟/错误/终态的来源化比较 | 目标api/provider/model与本地时间是P，不是未实现；可观察responseModel/endTurn/id必须独立预测；按各raw_stop和错误wrapper规则比较，不从got复制任意expected。PM五种终态，其他不支持终态应声明拒绝或投影，不能走隐含default。`AM:699–710; CX:775–783; ES:97–129; tests/matrix-lib.mjs:79–99,143–149`。 |
| K7 | 投影损失清单与wire存在性分离 | I01–I24只声明没有原信息的域；N4/N5/N6/N10是wire有但mock丢，单列实现/模型限制。PM extras/cacheRetention/sections顺序必须标成模型层，不得变成protocol固有不可逆（`PM:375–400; src/model/message.rs:35,57–99; src/api/pi_messages/vendor.rs:14–22`）。 |
| K8 | 异常、capture与逐字段diff分别计账，独立oracle不调用decoder掩盖共同bug | SH请求JSON.parse抛错必须canonical同样暴露；拒绝/transport/oracle异常不是逐字段失败。从`tests/matrix-lib.mjs:62–73`的真实顺序定义结果阶段，不引用expected/actual=null作内容已检查。每个规则需反例/分支夹具；现1600 fuzz仅四协议限定形状（`docs/design/mock-llm-server/fuzz.md:3–10`），不是全十协议证明。 |

### C2. 派生 encoder / decoder 与模型变更清单（7条）

冻结时F1–F7均仅候选。W-07已批准并实施F2–F5及A08.07-E reasoning扩展读取；F1签名降级、F6模型能力、F7新stop仍未批准。定义以已同步的A表/对应规格为准；tests不改，新红如实交W-08，见w07-implementation.md。

| ID | 候选与当前实施状态 | 为什么必要 / 验收边界 |
|---|---|---|
| F1 | 全协议encoder共用K2签名降级出口，同步独立oracle | 已实施src/api/encode_thinking.rs:32–90与tests/canonical-encode-thinking.mjs:2–23；七根encoder接同一出口，Azure/Codex/Vertex复用根。O18原始18案全部绿，合法item/原生opaque保留、无签名不变；Codex wrapper有单测，本轮真实SDK压缩链已可达；CLI条件边界见transport-unblock.md。证据见o18-resolution.md。 |
| F2 | W-07已实施Bedrock工具结果image补读；oracle未改 | `BR:962–973`有载体；`src/api/bedrock_converse_stream/decode_messages.rs:113–139`与`decode_image.rs:4–15`复用user解码。混合/纯图/error/text-only/非法bytes单测通过；两项旧oracle新红交W-08。 |
| F3 | W-07已实施Mistral工具结果data URL补读；oracle未改 | `MI:875–920`先join/trim文本，再发图；`src/api/mistral_conversations/decode_messages.rs:94–109`保留wire块序，`decode_content.rs:16–40`兼容字符串及已有url对象。不猜isError，保留前缀；两项vision新红交W-08。 |
| F4 | W-07已实施Mistral tools-only/no-system合成System；oracle未改 | `MI:777–810`tools独立顶层；`src/api/mistral_conversations/decode_messages.rs:113–128`挂已有首System或插入空System，保name/description/schema/order；无tools不插入。旧W-06投影用例新红交W-08。 |
| F5 | W-07已实施Codex专用wrapper补completed/incomplete的response.end_turn | `CX:775–783`读布尔，failed在`:766–772`先抛错；`src/api/openai_codex_responses/encode.rs:1–7`调用共享终帧路径。true/false/None与普通Responses不发单测通过；error仍L；本轮T1/T2已实施，真实SDK成功终帧矩阵绿，CLI缺失条件边界保留。 |
| F6 | PM若目标是完整TS消息往返，应补统一模型字段与有序sections；否则明确限制并独立测试 | `types.ts:546–551,577–580,626–630; src/model/message.rs:35,57–99`。这是一项**模型契约选择**，不是小codec补丁：推荐现阶段保持显式模型投影、不要扩模型来使既有矩阵变绿；若要求完整TS再另案批准。当前统一模型字段往返不需要补诊断记录，但section顺序影响提示词，应至少有序表示或明示拒绝顺序等价。 |
| F7 | stop encoder边界统一显式策略，消除Deferred隐式成功 | `src/api/bedrock_converse_stream/encode.rs:38–43; src/api/mistral_conversations/encode.rs:28–34`的default静默变stop。在无明示协议语义时推荐显式拒绝pending/deferred，aborted各协议按K6允许或显式投影；不要未经批准给客户端注入新的deferred语义。补全部StopReason枚举测试。 |

N1–N3、N7–N8的修改是K3/K4/K5/K6/K8所要求的**canonical/harness未来工作**，不是额外encoder bug；避免把同一个根因在K与F重复数作两个生产修复。strict/constrainedSampling的原始意图I05无法恢复；可在未来decoder保留wire strict终值，但不得声称由strict唯一逆推原prefer/require意图（`api/constrained-sampling.ts:225–248`）。

### C3. 必须继续声明不可逆（不是“等修复后全部原样”）

I01–I24的已定义损失域全部保留声明（I17的O18关联已采用有损text降级；历史拒绝本身不是信息损失证明），重点是：源timestamps/成本/被过滤历史、被归一前ID/块边界/system patch时序、legacy非strict schema根字段、跨域opaque签名原身份/原真实性、不承载usage细分、独立isError被前缀折叠、任意错误文案/stop区别、被删除图片/非法surrogates/空document键。具体范围与例外严格取B1源引用，**不增加第二份不一致的名单**。K2只解决可见thinking与目标结构可编码，不解决原签名；T1只解决可达性，不恢复客户端发wire前的丢失。

不得继续“声明不可逆”的对象：Google/MI read缓存、AM responseModel、Google合法签名、BR/MI工具图片、Codex endTurn、PM在wire中的extras/cacheRetention/section顺序；这些已分别被源码证明存在（B4/N1/N4/N5/N6/N10）。全量schema在Google与Vertex当前false路径也存在（`GS:388–399; GV:489`）。

### C4. transport工作项与量级（3条）

原量级估计属于历史工程推导，不是工时承诺；本轮T1/T2已实施、T3已验证离线伪凭据可达，验收与剩余finding见transport-unblock.md。

| ID | 工作项/量级估计 | 实施位置与必须验证的边界 |
|---|---|---|
| T1 | 已实施：系统zstd CLI入站解压，无新增crate | bytes入口、which zstd、std::process管道、2 MiB decoded-size上限与协议400；缺CLI/损坏/超限/命名/专用端口及真实SSE已复验，原89个blocker转绿88。 |
| T2 | 已实施：axum ws feature及连接内续传 | response.create、共享协议编码、未知ID错误与上一轮input+output恢复；显式WS/auto缓存/命名与专用挂载已覆盖。任意历史response ID随机访问、断线后云端持久化不是本连接mock能力。 |
| T3 | 已验证：临时伪service-account + 非默认universe的离线ADC | tests/vertex-adc-fixture.mjs生成临时RSA文件、mock.invalid触发本地自签；80案真实适配器Q/R全绿，复用现有Bearer KeyID，不改内容schema、不改只读源码。默认Google universe token刷新仍不离线。 |

**C条数口径**：8条canonical规则 + 7条codec/模型建议 + 3条transport工作项 = **18条建议**；其中F6是模型能力条件项，T2/T3为扩展覆盖项。对历史81fail最小充分候选为 **K2+F1+T1**（K2/F1的owner版text降级已18/18通过；T1本轮已实施，92→4见transport-unblock.md），且需要真实复跑，不能把“候选充分”冒充已经修好；K1/K3–K8和F2–F7是十协议图谱揭示的规则/实现一致性修复范围。I01–I24是24类继续声明的损失对象，不计为24条“修法”。

## D. 矩阵交叉验证

**历史快照边界**：D1保留原分析索引与机制，并在18个O18条目附本轮D/PASS裁决；D2/D3的统计与“当前/本轮”仍指原分析轮。O18现行结论以B2及o18-resolution.md为准，不覆写历史JSON中的FAIL。

### D1. 原快照与逐案机制

本轮分析读取的JSON时间为 **2000-01-01 → 2000-01-01**，SHA256 `a4583609824bae6c9c884196fe8f636eea444101860a7e833525dea632b1443f`。634个唯一主键、553 PASS / 81 FAIL；下表按原result数组顺序定位（result序号1起，JSON行号为该项顶层api行）。这是当前输入快照，不混用 `final-ledger.md:127–144` 另一次运行的时间/哈希。

机制 **O**：`tests/canonical-ores.mjs:199–206` 在 `tests/matrix-lib.mjs:66,116` 的providerFill路径JSON.parse `reasoning_content` 抛错；Rust也拒绝（`src/api/openai_responses/encode.rs:18–23`），但JSON diff本身是oracle异常，不能把它伪称Rust抛错。对应 **B2/I17/K2/F1/A02.10–11/A03.06**。expected/actual=null不证明内容比较完成。

机制 **T**：`CX:377–385`压缩后String extractor（`src/mounts/routing.rs:22`）拒绝、capture=0。对应 **B3/T1/A04.01**。req29/reply34。

| fail序号 | result序号 / JSON file:line | API | 方向 | case（完整主键末段） | 原diff摘要 / 图谱解释 |
|---|---|---|---|---|---|
| 01 | 100 / `tests/matrix-ten-results.json:17307` | `openai-responses` | reply | `reply-corpus-kahuwo-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 02 | 105 / `tests/matrix-ten-results.json:17567` | `openai-responses` | reply | `reply-corpus-claude2-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 03 | 107 / `tests/matrix-ten-results.json:17642` | `openai-responses` | reply | `reply-corpus-b4-claude-reason-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 04 | 112 / `tests/matrix-ten-results.json:17937` | `openai-responses` | reply | `reply-corpus-b4-deepseek-mixed-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 05 | 113 / `tests/matrix-ten-results.json:17948` | `openai-responses` | reply | `reply-corpus-b4-deepseek-codegen-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 06 | 114 / `tests/matrix-ten-results.json:17959` | `openai-responses` | reply | `reply-corpus-b4-deepseek-longreason-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 07 | 120 / `tests/matrix-ten-results.json:18318` | `openai-responses` | reply | `reply-corpus-b4-kimi-reason-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 08 | 121 / `tests/matrix-ten-results.json:18329` | `openai-responses` | reply | `reply-corpus-b4-kimi-toolerr-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 09 | 125 / `tests/matrix-ten-results.json:18554` | `openai-responses` | reply | `reply-corpus-b4-glm53-mixed-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 10 | 163 / `tests/matrix-ten-results.json:27520` | `azure-openai-responses` | reply | `reply-corpus-kahuwo-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 11 | 168 / `tests/matrix-ten-results.json:27780` | `azure-openai-responses` | reply | `reply-corpus-claude2-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 12 | 170 / `tests/matrix-ten-results.json:27855` | `azure-openai-responses` | reply | `reply-corpus-b4-claude-reason-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 13 | 175 / `tests/matrix-ten-results.json:28150` | `azure-openai-responses` | reply | `reply-corpus-b4-deepseek-mixed-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 14 | 176 / `tests/matrix-ten-results.json:28161` | `azure-openai-responses` | reply | `reply-corpus-b4-deepseek-codegen-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 15 | 177 / `tests/matrix-ten-results.json:28172` | `azure-openai-responses` | reply | `reply-corpus-b4-deepseek-longreason-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 16 | 183 / `tests/matrix-ten-results.json:28531` | `azure-openai-responses` | reply | `reply-corpus-b4-kimi-reason-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 17 | 184 / `tests/matrix-ten-results.json:28542` | `azure-openai-responses` | reply | `reply-corpus-b4-kimi-toolerr-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 18 | 188 / `tests/matrix-ten-results.json:28767` | `azure-openai-responses` | reply | `reply-corpus-b4-glm53-mixed-2` | 历史O：reasoning_content非JSON；现D：外域签名明文→text，空白/redacted删；本案已复跑PASS（o18-resolution.md）；原签名I17仍L |
| 19 | 190 / `tests/matrix-ten-results.json:28840` | `openai-codex-responses` | req | `corpus-sys-user` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 20 | 191 / `tests/matrix-ten-results.json:28851` | `openai-codex-responses` | req | `corpus-orphan-toolcall` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 21 | 192 / `tests/matrix-ten-results.json:28862` | `openai-codex-responses` | req | `corpus-full-convo` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 22 | 193 / `tests/matrix-ten-results.json:28873` | `openai-codex-responses` | req | `corpus-claude-full` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 23 | 194 / `tests/matrix-ten-results.json:28884` | `openai-codex-responses` | req | `corpus-thinking` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 24 | 195 / `tests/matrix-ten-results.json:28895` | `openai-codex-responses` | req | `corpus-plain-multi-glm5` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 25 | 196 / `tests/matrix-ten-results.json:28906` | `openai-codex-responses` | req | `corpus-plain-multi-glm52` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 26 | 197 / `tests/matrix-ten-results.json:28917` | `openai-codex-responses` | req | `corpus-b4-claude-thinking` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 27 | 198 / `tests/matrix-ten-results.json:28928` | `openai-codex-responses` | req | `corpus-b4-claude-parallel-toolcall` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 28 | 199 / `tests/matrix-ten-results.json:28939` | `openai-codex-responses` | req | `corpus-b4-claude-tool-error` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 29 | 200 / `tests/matrix-ten-results.json:28950` | `openai-codex-responses` | req | `corpus-b4-mixed-zh-en` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 30 | 201 / `tests/matrix-ten-results.json:28961` | `openai-codex-responses` | req | `corpus-b4-codegen` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 31 | 202 / `tests/matrix-ten-results.json:28972` | `openai-codex-responses` | req | `corpus-b4-long-thinking` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 32 | 203 / `tests/matrix-ten-results.json:28983` | `openai-codex-responses` | req | `corpus-b4-glm52-codegen-mixed` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 33 | 204 / `tests/matrix-ten-results.json:28994` | `openai-codex-responses` | req | `corpus-b4-glm52-parallel-toolcall` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 34 | 205 / `tests/matrix-ten-results.json:29005` | `openai-codex-responses` | req | `corpus-b4-glm52-tool-error-zh` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 35 | 206 / `tests/matrix-ten-results.json:29016` | `openai-codex-responses` | req | `corpus-b4-kimi-reason` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 36 | 207 / `tests/matrix-ten-results.json:29027` | `openai-codex-responses` | req | `corpus-b4-kimi-thinking-tool-error` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 37 | 208 / `tests/matrix-ten-results.json:29038` | `openai-codex-responses` | req | `corpus-b4-glm53-parallel-toolcall` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 38 | 209 / `tests/matrix-ten-results.json:29049` | `openai-codex-responses` | req | `corpus-b4-glm53-mixed` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 39 | 210 / `tests/matrix-ten-results.json:29060` | `openai-codex-responses` | req | `syn-tools-declared` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 40 | 211 / `tests/matrix-ten-results.json:29071` | `openai-codex-responses` | req | `syn-multi-toolcall` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 41 | 212 / `tests/matrix-ten-results.json:29082` | `openai-codex-responses` | req | `syn-same-model-thinking` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 42 | 213 / `tests/matrix-ten-results.json:29093` | `openai-codex-responses` | req | `syn-assistant-multi-text` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 43 | 214 / `tests/matrix-ten-results.json:29104` | `openai-codex-responses` | req | `syn-error-assistant-dropped` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 44 | 215 / `tests/matrix-ten-results.json:29115` | `openai-codex-responses` | req | `syn-user-blocks` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 45 | 216 / `tests/matrix-ten-results.json:29126` | `openai-codex-responses` | req | `syn-user-image` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 46 | 217 / `tests/matrix-ten-results.json:29137` | `openai-codex-responses` | req | `syn-no-system` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 47 | 218 / `tests/matrix-ten-results.json:29148` | `openai-codex-responses` | req | `syn-schema-metadata` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 48 | 219 / `tests/matrix-ten-results.json:29159` | `openai-codex-responses` | reply | `reply-text-stop` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 49 | 220 / `tests/matrix-ten-results.json:29170` | `openai-codex-responses` | reply | `reply-thinking-text` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 50 | 221 / `tests/matrix-ten-results.json:29181` | `openai-codex-responses` | reply | `reply-single-toolcall` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 51 | 222 / `tests/matrix-ten-results.json:29192` | `openai-codex-responses` | reply | `reply-multi-toolcall` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 52 | 223 / `tests/matrix-ten-results.json:29203` | `openai-codex-responses` | reply | `reply-length` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 53 | 224 / `tests/matrix-ten-results.json:29214` | `openai-codex-responses` | reply | `reply-error-finish-reason` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 54 | 225 / `tests/matrix-ten-results.json:29225` | `openai-codex-responses` | reply | `reply-response-id` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 55 | 226 / `tests/matrix-ten-results.json:29236` | `openai-codex-responses` | reply | `reply-corpus-kahuwo-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 56 | 227 / `tests/matrix-ten-results.json:29247` | `openai-codex-responses` | reply | `reply-corpus-kahuwo-4` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 57 | 228 / `tests/matrix-ten-results.json:29258` | `openai-codex-responses` | reply | `reply-corpus-claude-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 58 | 229 / `tests/matrix-ten-results.json:29269` | `openai-codex-responses` | reply | `reply-corpus-claude-4` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 59 | 230 / `tests/matrix-ten-results.json:29280` | `openai-codex-responses` | reply | `reply-corpus-glm5-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 60 | 231 / `tests/matrix-ten-results.json:29291` | `openai-codex-responses` | reply | `reply-corpus-claude2-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 61 | 232 / `tests/matrix-ten-results.json:29302` | `openai-codex-responses` | reply | `reply-corpus-glm52-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 62 | 233 / `tests/matrix-ten-results.json:29313` | `openai-codex-responses` | reply | `reply-corpus-b4-claude-reason-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 63 | 234 / `tests/matrix-ten-results.json:29324` | `openai-codex-responses` | reply | `reply-corpus-b4-claude-multitool-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 64 | 235 / `tests/matrix-ten-results.json:29335` | `openai-codex-responses` | reply | `reply-corpus-b4-claude-multitool-5` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 65 | 236 / `tests/matrix-ten-results.json:29346` | `openai-codex-responses` | reply | `reply-corpus-b4-claude-toolerr-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 66 | 237 / `tests/matrix-ten-results.json:29357` | `openai-codex-responses` | reply | `reply-corpus-b4-claude-toolerr-4` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 67 | 238 / `tests/matrix-ten-results.json:29368` | `openai-codex-responses` | reply | `reply-corpus-b4-deepseek-mixed-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 68 | 239 / `tests/matrix-ten-results.json:29379` | `openai-codex-responses` | reply | `reply-corpus-b4-deepseek-codegen-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 69 | 240 / `tests/matrix-ten-results.json:29390` | `openai-codex-responses` | reply | `reply-corpus-b4-deepseek-longreason-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 70 | 241 / `tests/matrix-ten-results.json:29401` | `openai-codex-responses` | reply | `reply-corpus-b4-glm52-codegen-mixed-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 71 | 242 / `tests/matrix-ten-results.json:29412` | `openai-codex-responses` | reply | `reply-corpus-b4-glm52-multitool-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 72 | 243 / `tests/matrix-ten-results.json:29423` | `openai-codex-responses` | reply | `reply-corpus-b4-glm52-multitool-5` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 73 | 244 / `tests/matrix-ten-results.json:29434` | `openai-codex-responses` | reply | `reply-corpus-b4-glm52-toolerr-zh-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 74 | 245 / `tests/matrix-ten-results.json:29445` | `openai-codex-responses` | reply | `reply-corpus-b4-glm52-toolerr-zh-4` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 75 | 246 / `tests/matrix-ten-results.json:29456` | `openai-codex-responses` | reply | `reply-corpus-b4-kimi-reason-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 76 | 247 / `tests/matrix-ten-results.json:29467` | `openai-codex-responses` | reply | `reply-corpus-b4-kimi-toolerr-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 77 | 248 / `tests/matrix-ten-results.json:29478` | `openai-codex-responses` | reply | `reply-corpus-b4-kimi-toolerr-4` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 78 | 249 / `tests/matrix-ten-results.json:29489` | `openai-codex-responses` | reply | `reply-corpus-b4-glm53-multitool-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 79 | 250 / `tests/matrix-ten-results.json:29500` | `openai-codex-responses` | reply | `reply-corpus-b4-glm53-multitool-5` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 80 | 251 / `tests/matrix-ten-results.json:29511` | `openai-codex-responses` | reply | `reply-corpus-b4-glm53-mixed-2` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |
| 81 | 252 / `tests/matrix-ten-results.json:29522` | `openai-codex-responses` | reply | `reply-nonzero-cache-usage` | T：capture=0；invalid UTF-8 index1；B3/A04.01/T1 |

**闭合**：18 O + 63 T = 81；一一主键相等、无重复、无未解释fail、新增无法解释fail **0**。没有修改case、语料、comparison ignore或快照；也没有把声明/建议记为PASS。81项中usage专属fail=0、Mistral专属fail=0；被T遮蔽的Codex非零cache用例仍T，不改归usage或PASS。

### D2. 五分类统计与解释尺度

W-07当前A表含243行（冻结239行加4个显式条件子行），统计单位为“已编号的字段组/方向/条件行”，不是展开后的标量字段数，更不是634样本的胜负数；家族变体共享规则行按自身表计一次。L对象清单为I01–I24共24个信息损失对象族，和A行数是不同分母。T行还包含未覆盖的WS/ADC前置，不能据此把当前fail数量加成更多。

| 协议 | E精确 | D确定变换/明确策略缺口 | L丢弃 | P pi注入 | T阻断 | 行数 |
|---|---:|---:|---:|---:|---:|---:|
| `openai-completions` | 1 | 15 | 8 | 3 | 0 | 27 |
| `openai-responses` | 0 | 15 | 6 | 3 | 0 | 24 |
| `azure-openai-responses` | 0 | 19 | 6 | 3 | 0 | 28 |
| `openai-codex-responses` | 1 | 16 | 8 | 3 | 2 | 30 |
| `anthropic-messages` | 0 | 13 | 7 | 4 | 0 | 24 |
| `google-generative-ai` | 1 | 10 | 7 | 4 | 0 | 22 |
| `google-vertex` | 1 | 13 | 7 | 4 | 1 | 26 |
| `bedrock-converse-stream` | 2 | 10 | 7 | 3 | 0 | 22 |
| `mistral-conversations` | 3 | 11 | 8 | 3 | 0 | 25 |
| `pi-messages` | 8 | 3 | 2 | 2 | 0 | 15 |
| **合计** | 17 | 125 | 66 | 32 | 3 | **243** |

以81个失败为另一个分母：**E 0 / D待采用投影 18 / L单独归因 0 / P单独归因 0 / T 63**。其中18只是“确定性投影策略可修”的根因归类，不是现状已产生D终态；原opaque签名本身属于I17的L，整条reply仍FAIL。严格现状观察是18个本地/oracle域拒绝 + 63个transport拒绝；给定五分类没有单独“输入域拒绝”类别，本文保留这个区别，绝不把拒绝宣称已完成往返。

reconcile新翻转：**1个根定性、18个实例**（B2）；历史已纠正的AM responseModel、Google input/read、Mistral顺序、OCC details不计作本轮翻转；新finding **N1–N10共10个**。C建议 **18条（K8 + F7 + T3）**；24个I对象继续保留损失声明。

### D3. 原图谱分析轮验证（历史证据，非此次定义修订执行）

本任务不运行 `node tests/duality.mjs`，因为 `tests/duality.mjs:19–20,28–31,37`会覆写指定输入矩阵；不新增/修改测试。未重新运行cargo或历史1600 fuzz，旧PASS数字仅作为输入文献事实，不冒充本轮实测。

| 实际验证 | 本轮结果 | 独立意义 |
|---|---|---|
| Python解析matrix、唯一主键、fail机制分类、JSON行号对账 | PASS：634 / 553 / 81；O18/T63；81唯一fail | 可重复以JSON重新生成D1，不依赖旧ledger分类文字 |
| Node内联canonical反例（现有模块只读） | PASS：N1 Google签名丢失；N2 Responses原text ID/phase与namespace丢失；N3 OCC错误details字符串数组；unsigned reasoning合法形状 | 断言的是“缺口存在”，不是断言当前canonical正确；无持久测试文件 |
| Node内联converter对照（Google/Responses直接函数；OCC onPayload后立即throw，未联网） | **3/3 PASS**：源converter发Google签名、Responses id/phase/namespace、OCC details对象，现canonical与这些产物不一致 | 证明N1/N2/N3是实际converter差异，不只凭canonical注释 |
| Node内联直接调用锁定`processResponsesStream` | **4/4 PASS**：foreign-signature-projection / true-empty-thinking / delta-fallback / summary-priority；每案前后text未移位，thinking签名item JSON精确，input11/read13/write17/total46 | 真实TS parser证明建议的目标item形状可解码；没有声称改后的Rustencoder跑通 |
| Python图谱结构/引用边界/主键校验 | **PASS**：10张协议表、233个唯一A条目、I24/K8/F7/T3/N10；666处显式file:line范围合法、81个fail主键完全一致、JSON SHA256未变、表格列数正确 | 行号范围检查不替代引用语义审阅；源语义证据在A/B逐条给出 |
| 锁定源码整树SHA256复核 | **PASS**：243文件，`b5ff86777c0c1fd15280ab0cee1f4cbe7828922e9be717ce85fed9976af7bab0`，与`final-ledger.md:147`记录相同 | 逐路径排序 + NUL + 文件内容 + NUL累计；锁定源码未变 |
| 最终文档/矩阵一致性复核 | **PASS**：233字段行=E9/D127/L64/P30/T3；4节/10表；81个完整失败主键；矩阵SHA256未变 | 只改本文；不新增测试或覆写测试结果 |
| `git status --short` | exit128：not a git repository | 无Git元数据；没有stage/commit动作，不能声称读取Git index成功 |

历史读取输入范围：当时api七份规格全部（不作当前文件清点）、final-ledger/fuzz/fix-rust/mistral-microfix、matrix全部634记录、全部`tests/canonical-*.mjs`（包括三个.test文件）；锁定十协议converter/parser及共享TM/TR/类型、必要mock decode/encode/model和harness源路径。读源码而非只用规格引用，发现冲突在B4明确指出。只写本文，增量A→B→C→D落盘。

人工自检没有发现未解释的81项失败；**仍须独立reviewer gate，不由作者自批准**。静态新finding与工时估计需要未来专项验证；当前Codex内容全部被transport遮蔽，Vertex ADC/WS未验证，外域签名投影需要owner另案批准，PM完整TS模型能力需要选择。


## Options 槽位镜像：owner裁决增量

以下细分覆盖旧表中对象toolChoice与grammar未读描述，不改变原strict策略/原schema不可逆域I05。此节补充缩写：TY=`types.ts`，CS=`api/constrained-sampling.ts`；其余沿用§A。完整逐adapter证据、实施与矩阵finding见`slots-mirror-pi.md`。

| 增量ID / 方向 | 规则 / 权威 | 实施与分类 |
|---|---|---|
| A10.07-E / Q 对象toolChoice | PM:35,384原样发送function对象；TY:132,369–371的Simple类型仅auto/none，不能混为无对象槽 | src/model/request.rs:26为Option<Value>；src/api/pi_messages/decode.rs:26直接赋值；对象JSON值及类型E，null仍None；cacheRetention不属于本增量 |
| SLOT-CHOICE / Q 其他原生对象槽 | OCC:869–871、OR:359–361、AZ:220–222直接发；AM:1309–1314字符串包装/对象保留；BR:1177–1178对象转tool:{name}；MI:923–934保留具名function对象 | 共用DecodedOptions JSON槽；OCC/Responses/Azure/Mistral原值，AM具名对象原值，BR恢复{type:tool,name}，已发对象E。Codex CX:84仅字符串；Google/Vertex没有对象toolChoice类型，不扩发送域 |
| SLOT-GRAMMAR / Q 已选grammar | api/constrained-sampling.ts:253–284选openai_lark优先、再openai_regex；OCC:1487–1502、SH:366–378分别发nested/flat grammar | src/api/grammar_tool.rs:12–31为共用出口；OCC与Responses/Azure/Codex恢复已选variant，D（整体）/已选字符串E；原schema/inputProperty/未选变体L |
| SLOT-STRICT / Q 原声明 | TY:738–754原槽为constrainedSampling；wire bool/null不带prefer/require来源；CS:225–251两策略可得相同true | 不发明strict bool槽；schema按终值保留；已发strict未建模仍D实现投影，原策略I05不可逆；PM直接context为E例外 |
| SLOT-SAMPLING / Q 参数来源 | TY:225–232；api/simple-options.ts:24–33逐键合并；OCC:1003–1007/OR:383–386/AZ:242–245最后Object.assign | 终值按已建模wire字段读取；原map/各层来源不可逆，未知根字段不臆测；PM:378–385不发samplingParams，其余非OpenAI兼容adapter同样不使用该map |

校正A03.03的旧简写：Azure supportsStrictMode默认true不是工具strict默认true；实际shared convert的defaultStrict=false（SH:361–362；AZ:214–218）。Codex默认strict=null仅在无constrainedStrict覆盖时成立（CX:575–580；SH:381–394）。
