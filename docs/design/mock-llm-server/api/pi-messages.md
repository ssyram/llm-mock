# pi-messages：组装对照协议

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 1. 概览

权威只读源码根 `P=<pi-mono>/packages/ai/src`。下文 `PM=api/pi-messages.ts`、`TY=types.ts`、`TR=utils/transcript.ts`、`ES=utils/event-stream.ts` 相对 P；`D/E/W=src/api/pi_messages/{decode,encode,vendor}.rs`，其他 `src/`、`tests/` 相对本仓库。不要将旧文行号直接套到当前PM：本轮读取的文件为444行，实际payload位置是PM:375–385。

Q：unified → pi payload → wire → mock decode；R：unified AssistantMessage → mock encode → wire → pi converter。五终态与 `../irreversibility-atlas.md:A` 对账：**精确往返 E**（一般JSON对象按值；sections依声明同时保留顺序，不要求任意JSON字节相同）、**确定性变换 D**（给出规则，可能多对一）、**丢弃 L**（当前wire映射不携带）、**pi 注入 P**（客户端身份/时钟盖章）、**transport 阻断 T**（消息解析前失败）。**wire携带但mock未读属于D（mock投影到缺省/None，另记实现缺口），不是L；encoder输入拒绝也不是T**。五分类用于合法可组装字段；没有合法编码结果时明确记输入契约拒绝，不伪造第六终态。

| 项 | 实际组装与证据 |
|---|---|
| 请求wire/路径 | POST `{model.baseUrl去尾斜杠}/messages`，debug加`?debug=1`；body `JSON.stringify({model:model.id,context,options:{…}})`（PM:369–400）。Content-Type application/json，Accept text/event-stream；无vendor消息转换。 |
| 认证/KeyID | options.apiKey必填（PM:365–368）；默认Authorization Bearer key，随后展开options.headers可覆盖（PM:394–399）。D:35–49只接受精确`Bearer `前缀及非空后缀，后缀为RequestInfo.key_id；api=pi-messages。**不从body、x-api-key或session推断KeyID**。 |
| session | body.options.sessionId（PM:383）；D:25,47同时作为DecodedOptions.session_id与RequestInfo.session_signal，无session header回退。 |
| 回复wire | `data: <单行JSON>\n\n`；start→按contentIndex每块start/delta/end→恰一个done/error（E:6–59,83–86）。无[DONE]终止语义（PM:313–320,414–425）。 |
| 转换边界 | provider接收TranscriptContext；public Context简写由normalizeContext转首System（TY:760–783；TR:10–34）。provider本身直接传context（PM:375–385），不resolveTranscript、不transformMessages、不删error历史或补工具结果。 |
| hook范围 | onPayload返回非undefined则替换整个payload（PM:387–390）；以下canonical仅适用于未任意重写的默认payload。 |

## 2. 请求方向字段映射表

| unified 字段 | convert 处理 + file:line | wire 字段 | decode 重建 | 终态 |
|---|---|---|---|---|
| 当前model.id | PM:375–377直接赋值 | model | D:19–21 request.model，D:45 info.model | E |
| context.messages顺序/四种role | PM:377直接context；TY:639联合system/user/assistant/toolResult | context.messages[] | W:7–11直接TranscriptContext；src/model/message.rs:1–12按role判别 | E；不合并消息、不填补缺结果 |
| system.content 字符串/块与textSignature | PM:377不渲染；TY:541–555 | 对应content字段 | SystemContent string/Vec<TextContent>（src/model/message.rs:15–20,32–40） | E；不拼接sections、不移除空块 |
| system.sections | PM:377直接JSON对象，null删除标记仍在wire（TY:546–548） | sections name→string/null | src/model/message.rs 的 IndexMap<String,Option<String>>；serde_json 启用 preserve_order | E：字段值、null与顺序全链保留；不能按无序对象比较取代顺序断言 |
| system.toolsAdded/toolsRemoved | TY:549–555；PM:377原值 | 工具声明/引用数组 | src/model/message.rs:36–39；src/model/tool.rs:5–18 | E（name/description/parameters/constrainedSampling/移除名）；不resolve当前工具集，保留中途更新 |
| system/user/assistant/toolResult.timestamp；assistant/toolResult.durationMs | PM:377直接context；TY:556,562,588–595,633–635 | 对应timestamp/durationMs | 四类timestamp均必填，duration为Option（src/model/message.rs:40,54,83–85,97–99） | E；**没有归零/Date.now替换** |
| user.content字符串/text/image | TY:559–563,414–434；PM:377直接JSON | 原content形态，text/textSignature，image.data/mimeType | src/model/message.rs:23–28,43–55；src/model/content.rs:12–35 | E：图片base64/mime不改、不按model.input降级；块顺序/空数组保留 |
| assistant.text/thinking/toolCall | TY:414–444,565–567；PM:377原值 | type与text/textSignature；thinking/thinkingSignature/redacted；tool id/name/arguments/thoughtSignature/namespace | src/model/content.rs:12–47与src/model/message.rs:61–63；不解析opaque签名、不规范化工具ID | E（包括redacted=false、空串、namespace与任意JSON参数值） |
| assistant.api/provider/model/responseModel/responseId/providerThinkingLevel/thinkingLevel | TY:568–575；PM:377原值 | 同名历史身份/元数据 | src/model/message.rs:64–74 | E；不按当前model retag历史身份 |
| assistant.usage/input/output/cacheRead/cacheWrite/cacheWrite1h/reasoning/totalTokens/cost | TY:446–466,580；PM:377原值 | usage及cost所有字段 | src/model/usage.rs:15–40；src/model/message.rs:75 | E；不重算、不要求historical stopReason成功 |
| assistant.stopReason/errorMessage/rawStopReason/endTurn | TY:469,581–587；PM:377原值 | 同名字段，含pending/deferred枚举 | src/model/message.rs:76–82；src/model/usage.rs:3–13 | E（请求历史可携带这些枚举，**不等于回复encoder支持**） |
| assistant.diagnostics/deferred | TY:576–579；PM:377实际会JSON.stringify可枚举值 | wire实际携带（如可JSON序列化） | src/model/message.rs 与 record_fields.rs 保留 JSON record 字段 | E：可序列化记录值保留；非JSON对象、函数与symbol不在JSON值域 |
| toolResult.toolCallId/toolName/content/isError | TY:620–633；PM:377原值 | text/image数组、id/name/isError | src/model/message.rs:92–99 | E；不查匹配call、不丢错误标记、不重排图片 |
| toolResult.details/usage/nestedCalls | TY:623–627；PM:377直接序列化JSON值 | 对应可枚举字段可携带 | ToolResultMessage.record 通过 RecordFields 读写，不以受限Usage再次过滤 | E：含details=null、完整usage及nestedCalls；role仅由Message标签编码一次 |
| tools name/description/parameters/constrainedSampling | TY:750–757、system.toolsAdded；PM:377直接context | 原声明字段 | src/model/tool.rs:5–11保留；不做strict schema或grammar转换 | E；输入schema中的键序非等价条件 |
| options.temperature/maxTokens/reasoning/sessionId | PM:378–385只列这几项与下列选项 | options同名字段 | D:22–30分别temperature/max_tokens/reasoning/session_id | E；reasoning不映射budget；受Rust数值类型合法域约束 |
| options.toolChoice | PM:384原值，类型string或function对象（PM:35） | toolChoice | src/api/pi_messages/decode.rs:26直接赋回JSON值 | 字符串/对象E（JSON类型保留）；null→None |
| options.cacheRetention / env.PI_CACHE_RETENTION | PM:347–352显式truthy值优先，否则env仅long→long，其余undefined；PM:382写body | cacheRetention若已解析则存在 | WireOptions.cache_retention → DecodedOptions.cache_retention | E：保留实际解析后发送的retention；不从未发送的运行时配置猜测 |
| apiKey/headers/fetch/signal/debug/env/hooks/retry/transport/metadata/samplingParams/thinkingBudgets等运行时选项 | PM:375–400白名单body仅六项；signal/fetch/headers在fetch参数，debug在query，env仅参与cacheRetention | 不进入body.options；实际URL/headers除外 | D仅按实际header和body；不恢复运行时对象 | 未发送值L；KeyID按实际头E；debug非DecodedOptions字段 |

合法TS AssistantMessage不含image（TY:567）；统一Rust模型较宽并不改变TS协议类型。JSON之外的undefined/function/symbol不在E定义内；PM:400使用JSON.stringify本身不能保存这些值。无options接受默认空options，显式options=null不是默认空对象（W:10–21）；可选字段null归Option None。model/context.messages及必填timestamp缺失或类型不符会反序列化失败（D:16–18；W:7–11；src/model/message.rs:40,54,83,97）。

## 3. 回复方向字段映射表

| AssistantMessage 字段 | encode事件/字段 + file:line | pi-ai解析重建 + file:line | 终态 |
|---|---|---|---|
| 响应起始/块顺序 | E:6–59发start，原contentIndex从0逐块 | PM:218–244按contentIndex赋块，不合并相邻text/thinking | E（顺序/边界），空content仍有start与终帧 |
| text/textSignature | E:11–21 text_start、text_delta完整串（含空串）、text_end完整content/contentSignature | PM:220–231 delta累加，end完整内容覆盖并赋签名 | E；无需模拟分词；签名不要求某vendor格式 |
| thinking/thinkingSignature/redacted | E:23–34同形thinking事件，end含contentSignature/redacted（Some(false)也发） | PM:232–244恢复，包括false | E |
| toolCall.id/name/arguments | E:36–51 start{id,toolName}，delta=arguments JSON字符串，end=完整toolCall | PM:245–269逐delta累加parseStreamingJson；end Object.assign完整对象 | E：end为权威，JSON空白/键序不比较 |
| toolCall.thoughtSignature/namespace/type | W:24–29嵌套含`type:'toolCall'`；E:48–51终块保留完整ToolCall | PM:261–269直接合并 | E；不能仅序列化无type的Rust内部struct |
| usage全量与cost | E:64–75两种终帧均携usage，含input/output/cacheRead/cacheWrite/cacheWrite1h/reasoning/totalTokens/cost | PM:195–217直接event.usage赋值 | E；**客户端不calculateCost、不重算totalTokens** |
| stopReason=stop/length/toolUse | E:64–69 done.reason原值 | PM:195–205原样reason，不按是否有toolCall改写 | E（无toolCall的toolUse仍保持） |
| stopReason=error/aborted / errorMessage | E:70–75 error.reason、errorMessage、usage，之前内容帧仍存在 | PM:206–217原值，收到终帧立即return（PM:414–420） | E：这是合法流内error/aborted，不要求本地signal触发 |
| errorMessage（成功终态） | E:64–69 Done没有该槽位 | PM:195–205不赋 | L |
| responseId/providerThinkingLevel | E:67–68,74–75终帧；None省略（W:80–96） | PM:199–214分别赋；providerThinkingLevel仅非undefined时赋 | E（可选值） |
| api/provider/model/timestamp | E:6–80没有事件字段 | PM:180–190从请求model配置初始化api/provider/model，timestamp=Date.now | 原值L；新值P；不是mock可覆盖的身份 |
| durationMs | E:6–80不发 | ES:115–129终态计时：stream尚未done、无已有duration且message.timestamp不早于stream创建时，写max(0,round(performance.now-start)) | 原值L；本地计时P，有条件而非无条件覆盖 |
| responseModel/thinkingLevel/rawStopReason/endTurn | E:62–80事件没有槽位；PM:180–273无赋值 | 未恢复 | L（仅回复方向；请求历史可以E） |
| diagnostics/rewrite | PM:77,86事件可有rewrite；当前事件encoder不从record字段生成rewrite；请求record保留与回复事件映射分开 | PM:169–177,204,216将rewrite写pi_messages_rewrite诊断 | 当前encoder不产出；wire可表达，不称协议不可表达；客户端时间诊断P |
| image / stopReason=pending,deferred | E:53–55拒绝image；E:77–79拒绝这两种终态 | 无合法编码结果 | encoder输入契约拒绝，**不是T，不强行造done/error** |

HTTP级MockError另走E:89–90普通JSON `{"error":{"code":...,"message":...}}`，不是上述流内error事件。非2xx路径PM:404–410抛PiMessagesResponseError；PM:110–155提取error对象及文案，PM:323–344生成**新空content、零usage、当前model/Date.now**的本地error，非aborted时附failure diagnostic。因此HTTP错误与流内error不能使用同一个R往返断言。

## 4. canonical form 与 tests 对账

**O18 / R 统一签名投影（owner裁决，现行）**：pi-messages接入同一出口但使用Opaque域：原生contentSignature与redacted保留，不按reply来源元数据执行请求侧TM；本页既有R原生事件规则不变。 统一实现：`src/api/encode_thinking.rs:18–90`；跨源明文规则依据`api/transform-messages.ts:95–116`、`api/openai-responses-shared.ts:179,264–289`、`api/anthropic-messages.ts:1168,1443–1483`、`api/google-generative-ai.ts:374`→`api/google-shared.ts:200,234–266`。这只判目标签名支持域，不做基于reply身份的TM全量转换；历史summary-item降级草案被text规则取代。完整证据/18案复跑见`../o18-resolution.md`与图谱B2。

定义：默认payload的 `decode(convert(C))` 在统一JSON模型值域内等于下列投影；任意onPayload覆写、非法TS对象、JSON外值不在证明范围。`parse(encode(A))` 使用单独的R规则，不能拿历史Q规则替代。

| 规则 | 精确规则 + 源码 | tests/canonical-*.mjs 对账及裁决 |
|---|---|---|
| Q 上下文归一 | public Context简写→首System timestamp=0；已传入TranscriptContext时provider不重放/折叠（TR:10–34；PM:375–385） | canonical-pi-messages.mjs:12–14 normalizeContext正确；不应套用Responses/Google transformMessages |
| Q 四类消息原值 | 保留消息顺序、空块、error/aborted历史、孤儿toolCall、签名、所有统一字段、原timestamp/duration（PM:377；D:19–21） | canonical-pi-messages.mjs:14–37投影基本一致；canonical-ten.test.mjs:70–87有对应fixture，**这不是所有options/HTTP分支证明** |
| Q JSON与Option | undefined属性在JSON.stringify省略；有类型的Option缺省/null→None；Assistant/ToolResult的record JSON字段保留，包括details=null | canonical-pi-messages.mjs 对普通可选槽和record字段分别处理，不能用过滤null的pick删除record值 |
| Q sections顺序 | 有序JSON入口、IndexMap统一模型和脚本序列化均保留顺序与null | preservation_tests.rs及pi-request-preservation.test.mjs独立比较entries/渲染次序；harness仅在系统sections路径比较键序，不把所有业务对象都设为有序 |
| Q options白名单 | maxTokens/temperature/reasoning/sessionId/toolChoice/cacheRetention依实际payload恢复；cacheRetention取显式truthy值，或legacy环境long | PiMessagesContract实际生成六个目标槽的投影，不暗补fixture的64/d-s1；原生环境配置另有真实SDK回归 |
| Q 运行时记录字段 | PM直接发送的合法记录JSON穿过统一模型与真实脚本边界 | canonical按原值保留；Rust测试直接取原始JSON字段作期待，真实SDK测试检查wire/capture/script三处，不再将双方反序列化进同一受限类型冒充覆盖 |
| R 内容与终帧 | end内容覆盖delta；tool end完整赋值；五种合法终态原值；usage/cost不改；responseId/providerThinkingLevel可选原值（PM:195–269；E:6–80） | canonical-reply-additional.mjs:26–29只删除无事件元数据及成功errorMessage，符合此窄域；不删usage.cost/totalTokens是正确的 |
| R 身份/时间 | PM:180–190盖当前身份/timestamp；ES:126–129条件计时；responseModel/thinkingLevel/rawStopReason/endTurn不发（E:62–80） | tests/matrix-lib.mjs:79–99盖身份并删timestamp；fillPiMessages删duration。测试排除这些字段不能声称E，它们属于P/L |
| R 错误路径 | 流内error保留既有content/usage；HTTP失败/解析异常由PM:323–344创建新空结果，stopReason取本地signal | canonical reply仅适用成功产生事件的encoder路径；HTTP错误/流中断的content与usage不能沿用它 |

与旧文/注释明确裁决：

- 历史模型注释称timestamp恒0、记录字段不会发给模型，均已纠正；pi-messages请求直接JSON序列化，不能沿用其他vendor历史消息的损失规则。
- 历史sections排序和记录字段/cacheRetention删除均为已修的模型缺口，不再属于当前Q投影；相应旧绿色对象比较不能追认这些语义已被保持。
- 旧文“可选字段null等同未提供”不能扩大到整个options对象：W:10的default仅在字段缺失时生效，options=null反序列化失败。字段级Option允许null。
- 旧文“尚无/messages路由、须父线程接线”已过时：当前src/server.rs:22–35有通用fallback；src/mounts/routing.rs:24–49协议选择，src/mounts/protocol.rs:116–128识别/messages。**以当前实现为准，不保留过时待接线结论**。
- 旧文cargo通过计数为历史记录，不冒充本轮执行；本轮结果列第6节。PM旧行号与当前payload位置偏移，本轮按实际文件重新引用。

## 5. 不可逆声明与 transport 边界

### Options 槽位镜像补充（本轮裁决）

- `toolChoice`字符串/function对象现在保留JSON值及类型（E），null→None；原生证据PM:35,384，实现src/model/request.rs:26、src/api/pi_messages/decode.rs:26。
- strict/grammar原配置位于context内的Tool.constrainedSampling（包括prefer/require、false及全部variants），PM:377直接发送，Rust工具模型已完整保留；不新增strict槽。samplingParams虽有StreamOptions类型槽，却不在PM:378–385的payload白名单，mock同样不读取。


Q中在统一模型可表达的JSON值域内近乎恒等，但不是完整TS对象或JSON字节无损：sections顺序和已发记录/cacheRetention现在保留；未声明的context扩展不由现有TranscriptContext类型自动承诺。R中身份/时间与无事件槽位的元数据确实不由当前encoder携带，成本却是E而非其他vendor的P。上述不可逆判断均分别以第2、3节源码为据。

| 边界 | 事实/证据 | 分类/限制 |
|---|---|---|
| Bearer失败 | PM:365–368缺apiKey客户端拒绝；D:35–40拒绝缺头/错误前缀/空key；options.headers可覆写（PM:394–399） | 客户端/认证拒绝不是消息丢失；KeyID只能据实际收到的头，不按最初apiKey猜测 |
| JSON/必填字段 | PM:400 stringify，D:16–18 serde反序列化 | 非JSON值、缺timestamp等为输入契约错误；不是可合法canonical归零的场景 |
| SSE读取 | PM:276–311流式TextDecoder、CRLF→LF、空行分帧，EOF解析余量；PM:313–320只取首个data:行JSON，空数据/[DONE]忽略 | mock E:83–86始终单行data可对齐；多data行拼接不是此parser行为，不据通用SSE标准猜实现 |
| 终止帧 | PM:414–425收到done/error即return，EOF无终帧抛错 | [DONE]不是done事件；缺terminal进入本地错误路径，**不是正常stop** |
| 回调/网络/JSON解析失败 | PM:414–425 hook/parse/fetch错误进catch，PM:323–344创建新空error结果 | 不能承诺先前已流出的partial内容保留在最终error对象；未做任意坏帧/fault injection的端到端穷举 |
| HTTP error | PM:110–155消息优先error.message、code后缀；截断诊断body上限8192；E:89–90不包含HTTP status | HTTP status由路由决定（src/mounts/routing.rs:115–122）；HTTP JSON非SSE，状态/headers不能只由body推断 |
| 路径与mount | PM:369直接base+/messages；src/mounts/protocol.rs:116–128及routing.rs:24–49选择协议 | 不把Anthropic /v1/messages与pi-messages无条件混用；实际mount/协议选择须看路由，单decoder fixture不证明所有baseUrl布局 |

没有已验证的pi-messages固有二进制transport阻断；这不等于所有网络/认证/代理配置已验证。历史冻结批次未跑真实HTTP；当前本地SDK/HTTP/脚本、分片/取消证据见上列测试及../duality-experiments.md。没有真实云端或任意坏帧穷举结论。

## 6. 覆盖与 fixture 索引

| fixture/文件 | 覆盖内容与证据 | 证据边界 |
|---|---|---|
| src/api/pi_messages/decode_tests.rs | 历史消息、timestamp、签名、额外TS字段、options、KeyID/session、无效输入 | Rust模块级，不是TS convert→HTTP端到端 |
| src/api/pi_messages/encode_tests.rs | 完整SSE帧、工具终块type、五种终态、usage/cost、空块、图片/非法终态拒绝、HTTP错误 | 合法encoder确定序列，不是任意分帧容错证明 |
| src/api/pi_messages/create_event_converter_tests.rs | 按PM converter契约回放text/thinking/tool，核对签名/最终参数 | Rust契约回放，不冒充真实TS parser执行 |
| tests/canonical-pi-messages.mjs、canonical-ten.test.mjs、pi-request-preservation.test.mjs、src/api/pi_messages/preservation_tests.rs | timestamp、error历史、孤儿调用、空块、sections顺序、完整记录字段及cacheRetention | 原生SDK→HTTP→capture→真实脚本有独立字段断言；不是所有任意扩展或非JSON值的证明 |
| tests/canonical-reply-additional.mjs:26–29；tests/matrix-lib.mjs:79–99 | 回复元数据投影，pi usage/cost/totalTokens保留 | 不能证明HTTP错误/terminal缺失路径 |
| <pi-mono>/packages/ai/test/pi-messages.test.ts | 上游请求/流fixture的补充索引 | 本轮未运行上游测试，不引用旧文测试计数作新证据 |

以下保留历史冻结批次，不作为本轮修复结果：当时仅改文档，未改源码/tests，未新增fixture。已逐函数阅读PM（payload、事件converter、SSE读取、HTTP错误、缓存配置、streamSimple）及D/E/W与统一模型。本轮验证：

- `cargo test --lib api::pi_messages::`：12 passed，0 failed，97 filtered out。
- `node --test tests/canonical-ten.test.mjs tests/canonical-reply-projections.test.mjs`：12 passed，0 failed；仅部分用例直接覆盖本协议。
- Node只读统计 `tests/matrix-ten-results.json`：pi-messages Q=30/30、R=37/37；这是已有快照，不是本轮重跑HTTP矩阵。
- Python文档静态检查：六节齐全、Markdown表列一致、本地引用路径存在、128个TS/Rust简写引用行号范围有效；通过。
- Git返回not a git repository，无可用index，未stage/commit。未运行新的HTTP矩阵/上游TS测试，仍需独立review gate。
