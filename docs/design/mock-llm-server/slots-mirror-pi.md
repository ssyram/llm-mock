# Options 槽位镜像 pi：owner 裁决实施结果

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 1. 权威、边界与结论

冻结定义为 `irreversibility-atlas.md`＋`api/`。行为权威仅为只读 `<pi-mono>/packages/ai/src`；下文 TS 路径均相对该根，Rust/测试路径相对本仓库。默认 payload、合法 pi 输入是比较域；任意 `onPayload` 替换后的请求需另行核对。

本轮已实施两类补读：**对象 toolChoice 保留 JSON 类型**；**OpenAI grammar/custom 工具经统一 decoder 恢复已选变体**。strict 原 `prefer/require`、samplingParams 原 map/来源在 vendor wire 不唯一可恢复，不发明新槽位。pi-messages 的 constrainedSampling 已完整读取，无需新增。此边界经 supervisor 明确批准；cacheRetention、动态工具与 transport 失败不扩入实施范围。

E＝JSON值及类型精确往返，D＝明确的确定性变换/当前实现投影，L＝上游未携带原区别。wire有值但mock未建模不能冒充L。

## 2. 统一类型与 pi-messages payload 逐项证据

| 项 | 锁定 pi 源码证据 | pi 实际槽位/发送行为 | 我们的镜像决定与状态 |
|---|---|---|---|
| strict | `types.ts:738–754`；`api/constrained-sampling.ts:225–251` | 槽在 `Tool.constrainedSampling`，不是独立 strict boolean option；json_schema.strict 是 prefer/require。支持且 schema 可转换时两策略均可得 true；require 在不支持时抛错，prefer 可退 undefined。 | pi-messages 原配置完整保留（E）；其他 wire bool/null 不反推 prefer/require，不添加独立 strict 槽。schema终值照读；wire strict 未建模仍记 D finding。**无新增 strict 模型字段。** |
| grammar/custom tools | `types.ts:728–754`；`api/constrained-sampling.ts:253–284` | GrammarVariants 只有 openai_lark/openai_regex。支持 grammar 时优先非空 lark，否则 regex；wire syntax 为 lark/regex。原 schema 必须有恰一个 required string 属性，但该属性名不进入工具 wire。 | 统一 `src/api/grammar_tool.rs:12–31` 映回枚举；只存已选变体，parameters={}；不伪造原schema/inputProperty/未选variants。**已实施。** |
| 对象 toolChoice | `types.ts:132,369–371`；`api/pi-messages.ts:33–38,384` | Simple 的 ToolChoice 只有 auto/none；provider-specific PiMessagesOptions 另允许 required 与 `{type:function,function:{name}}`。不能因 Simple 类型窄就断言 pi 无对象槽。 | `src/model/request.rs:26` 改为 Option<Value>；pi-messages 原样读对象，JSON值/类型 E。**已实施。** |
| samplingParams | `types.ts:133–134,225–232,851–854`；`api/simple-options.ts:24–33` | 任意键 map；model→有效thinking-level→request 逐键后者覆盖。仅指定 OpenAI-compatible adapters 使用；不是所有继承 StreamOptions 的 adapter 都消费它。 | 不恢复来源；已建模 wire 字段读最终覆盖值，未知根字段不臆测塞回 samplingParams。**仅报告、定义已同步。** |
| pi-messages context | `api/pi-messages.ts:375–377,400` | body直接 `{model: model.id, context, options}`，context由 JSON.stringify 序列化，工具 constrainedSampling 不做 strict/grammar转换。 | `src/model/tool.rs:5–13` 已有 constrained_sampling JSON槽；`src/api/pi_messages/decode.rs:19–27` 保留context。prefer/require、false、全部variants已测，无重复建槽。 |
| pi-messages options | `api/pi-messages.ts:378–385` | 白名单恰为 temperature/maxTokens/reasoning/cacheRetention/sessionId/toolChoice；**没有 samplingParams，也没有独立 strict/grammar options**。 | toolChoice直接赋回 JSON（`src/api/pi_messages/decode.rs:26`）；samplingParams同样不读。cacheRetention有wire但未建模是范围外finding，不称pi丢弃。 |
| payload 改写边界 | `api/pi-messages.ts:387–390,400` | onPayload返回非undefined可整包替换；最后JSON.stringify。 | 不把hook人为塞入字段当成pi原生槽位。 |

## 3. 各 convert/options 分支逐项核验

缩写：OCC=`api/openai-completions.ts`，OR=`api/openai-responses.ts`，SH=`api/openai-responses-shared.ts`，AZ=`api/azure-openai-responses.ts`，CX=`api/openai-codex-responses.ts`，AM=`api/anthropic-messages.ts`，GG=`api/google-generative-ai.ts`，GV=`api/google-vertex.ts`，GS=`api/google-shared.ts`，BR=`api/bedrock-converse-stream.ts`，MI=`api/mistral-conversations.ts`，PM=`api/pi-messages.ts`，CS=`api/constrained-sampling.ts`，SO=`api/simple-options.ts`。这些均为上述只读权威根下的实际文件。

| API | strict | grammar/custom tools | 对象 toolChoice | samplingParams |
|---|---|---|---|---|
| openai-completions | OCC:1505–1514：resolver；支持时 strict??false；schema按strict转换，否则无strict字段。 | OCC:1487–1502：支持时 custom.format.grammar.{syntax,definition}；否则回function schema；CS:259–260不支持grammar时返回undefined。 | OCC:155采用SDK union；:869–871直接赋tool_choice，无对象字符串化。 | OCC:1003–1007、SO:24–33：合并后末写Object.assign，可覆盖具名字段；不带来源map。 |
| openai-responses | SH:361–362默认strict=false、支持默认true；:381–394 constrainedStrict优先，支持时发strict。 | SH:366–378：flat format.{type:grammar,syntax,definition}；非OCC的nested结构。OR:352–355调用。 | OR:121采用SDK union；:359–361原值赋tool_choice。 | OR:383–386：合并后末写根级，无来源。 |
| azure-openai-responses | AZ:193–195,214–218传supportsStrictMode默认true；工具strict默认来自SH:361的false，**不是默认true**。 | AZ:214–218复用SH grammar分支，可由compat启用。 | AZ:28采用SDK union；:220–222原值赋tool_choice。 | AZ:242–245：合并后末写根级，无来源。 |
| openai-codex-responses | CX:549,575–580传default strict:null；SH:381–394仍可由constrainedStrict=true覆盖；不能宣称所有工具始终null。 | CX:538–549,575–580复用SH，compat支持时发custom。 | CX:84仅auto/none/required；:563默认auto；**没有原生对象选择槽**。共享Rust parser可读对象不等于pi会发。 | CX:528–600完整builder没有读取samplingParams；不携带该map。 |
| anthropic-messages | AM:1633–1657：prefer可被fallback禁用；strict真发strict:true并保扩展schema；非strict仅根type/properties/required。 | 同AM:1633–1657只调用JSON-schema resolver；grammar配置得undefined，走普通function/legacy schema，不发custom/variant。 | AM:284有{type:tool,name}；:1309–1314字符串包装type，对象原值赋回。 | AM:1157–1323 builder无samplingParams消费；types.ts:225–232明确不应用。 |
| google-generative-ai | GG:386–399、GS:389–396,423–435：Gemini>=3支持严格工具；strict转换schema，非none/any时可强制VALIDATED；没有独立strict布尔字段。 | GS:380–400只发functionDeclarations，grammar不生成custom/variant。 | GG:48只auto/none/any；:387–399→GS:409–435映射mode，**无对象槽**。 | GG:379–431构造generationConfig/config/params不消费map；忽略。 |
| google-vertex | GV:480–492、GS:389–396,423–435同Google严格schema/mode规则。 | GV:489复用GS:380–400；没有custom/variant槽。 | GV:52仅auto/none/any；:480–492仅映射mode，**无对象槽**。 | GV:462–520完整builder不消费map；忽略。 |
| bedrock-converse-stream | BR:1157–1164：strict真才发toolSpec.strict:true，schema为最终值。 | BR:1148–1182仅JSON-schema resolver和toolSpec，没有custom/variant槽。 | BR:82有{type:tool,name}；:1153–1154无tools/none则整个toolConfig不发；:1168–1182对象→{tool:{name}}。 | BR:263–280 payload无map读取，忽略；厂商扩展additionalModelRequestFields不是samplingParams来源标记。 |
| mistral-conversations | MI:777–789：resolver支持true，function.strict=strict??false；schema经转换/stripSymbolKeys。 | 同MI:777–789只function，没有custom/variant槽。 | MI:38支持嵌套function对象；:543调用:923–934，原生对象保留；:386–430序列化为tool_choice。 | MI:527–550 builder、:386–430 serializer均无map读取，忽略。 |
| pi-messages | PM:377直接context，保原constrainedSampling；options无strict字段。 | PM:377保原schema及全部variants，不做custom转换。 | PM:35,384原样传provider对象；:400 JSON.stringify。 | PM:378–385白名单未列；不发，不读取。 |

**共同信息边界**：vendor strict=true 无法区分原 prefer 与 require；最终 schema 不能还原 strict化前的可选意图。grammar 只有选中的语言字符串和syntax，不能还原原参数名。samplingParams的最终根键可能本来来自命名option、model默认或request map；这些来源在wire已合并。未知top_p等已发值在mock仍被投影忽略，是已知保留边界，不宣称pi没发。

## 4. 镜像实施状态与统一出口

| 改动 | 当前实现 | 状态 |
|---|---|---|
| 统一对象槽 | `src/model/request.rs:26` 的 DecodedOptions.tool_choice=Option<Value>，同时覆盖UnifiedRequest与RequestInfo；无平行字段或JSON字符串兼容分支。 | 完成 |
| 原值读取 | `src/api/pi_messages/decode.rs:26`；`src/api/openai_completions/decode.rs:37`；`src/api/openai_responses/decode.rs:111`；`src/api/mistral_conversations/decode.rs:22`。 | 字符串/对象JSON值及类型E |
| 原生选择解包装 | `src/api/anthropic_messages/decode.rs:84–87`将auto/any/none解回字符串，具名对象保留；`src/api/bedrock_converse_stream/decode.rs:12–26`恢复auto/any字符串或{type:tool,name}。 | 已发合法原生选择E；Bedrock none不发仍L |
| Google模式兼容 | `src/api/google_generative_ai/decode.rs:197–202`仍mode小写字符串，仅适配统一JSON字段类型；Vertex复用。 | 行为不扩大 |
| 共用grammar规则 | `src/api/grammar_tool.rs:12–31`映射syntax；`src/api/openai_completions/tools.rs:9–28`与`src/api/openai_responses/decode.rs:144–155`调用。Responses vendor读取flat format。 | 完成；未知syntax拒绝，不增造变体 |
| 家族reunification | Azure/Codex继续委托Responses decoder：`src/api/azure_openai_responses/decode.rs:14–21`、`src/api/openai_codex_responses/decode.rs:17–20`。不逐家族补fixture。 | grammar补读自然覆盖家族；Codex对象发送域不扩大 |
| strict/samplingParams | 不新增模型字段；pi-messages constrainedSampling沿用既有Tool JSON槽。 | 仅报告/定义同步，已完成 |
| canonical同步 | `tests/canonical-request-options.mjs:18`不再将对象字符串化，按新E定义克隆JSON；无失败用例删除、ignore增加或transport补丁。 | 完成 |
| 测试职责/行数 | Responses旧tests拆出encode_tests；Completions options测试拆出decode_options_tests；用例原样保留，仅对象槽断言随定义变更。 | 本轮涉及源文件均≤200非空非注释行 |

定义同步位置：`irreversibility-atlas.md` 的 A10.07、新增 A10.07-E/SLOT-CHOICE/SLOT-GRAMMAR/SLOT-STRICT/SLOT-SAMPLING；`api/pi-messages.md`、`api/openai-completions.md`、`api/openai-responses.md`、`api/family-variants.md`、`api/anthropic-messages.md`、`api/bedrock.md`、`api/mistral.md` 的请求表与第4/5节。Google无新增行为，其权威分支证据集中列在本报告，不增造对象槽。

## 5. 单测、真实链路与矩阵账本

### 新增/更新测试

- `src/api/slots_mirror_pi_tests.rs:13–41`：lark/regex分别映回openai_lark/openai_regex，OCC/Responses/Azure/Codex共用结果；parameters保持{}，不伪造schema。
- `src/api/slots_mirror_pi_tests.rs:45–56`：对象toolChoice在UnifiedRequest序列化/反序列化往返，RequestInfo.options相等，字符串选择不变。
- `src/api/slots_mirror_pi_tests.rs:60–76`：pi-messages保留prefer/require、false及全部grammar variants；options不新增samplingParams。
- `src/api/slots_mirror_pi_tests.rs:79–96`：未知grammar syntax拒绝；Anthropic/Mistral具名对象保留；缺省choice不序列化。
- `src/api/pi_messages/decode_tests.rs:67–83`：function对象不变JSON字符串，明确检查类型及反序列化往返；原缺省/null测试保留。
- `src/api/openai_completions/decode_options_tests.rs:5–20`、`src/api/openai_responses/tests.rs`：原具名对象用例改为读取JSON对象，Responses不再误拒绝合法对象。Bedrock指定工具断言同步为原生对象；Google/Codex字符串断言仅适配Option<Value>。

### 执行命令与结果

| 命令/检查 | 本轮结果 |
|---|---|
| `cargo test`（初轮） | 先发现新增测试误用Anthropic私有module；修正为公开re-export。下一轮发现Azure测试缺api-key；修正测试认证，不改生产认证行为。均为已修fixture finding，不删除测试。 |
| `cargo test -q`（最终） | **132 passed / 0 failed**；这是共享工作树的全量计数，不把其他并行线新增测试归功于本线。 |
| `cargo build -q` | 成功，exit 0。 |
| `cargo check --all-targets` | 成功，exit 0；短暂cargo缓存锁在1秒内解除，未到30秒阻塞重试阈值。 |
| `node --test tests/*.test.mjs` | 首轮86/0；后续复跑85/1，新增O18服务器启动报Address already in use。未改期待。 |
| 等待30秒后 `node --test --test-concurrency=1 tests/*.test.mjs` | **86 passed / 0 failed**；串行避免测试服务端口竞争。 |
| `node --input-type=module` targeted live probe | **12 passed / 0 failed**：OCC/Responses/Azure/pi-messages各2 grammar选择＋1 sampling覆盖，共12次真实pi convert→HTTP→Rust capture；独立断言choice对象类型、统一variant实际键、schema不可伪造；OpenAI兼容sampling temperature最终0.6/top_p=0.7，PM温度仍0.1且无samplingParams。 |
| canonical对象槽独立探针 | OCC/Responses/Azure/pi-messages/Mistral各断言JSON对象克隆而非字符串化，**5 passed / 0 failed**。 |
| 逐文件非空/非注释LOC检查 | 本线涉及23个Rust文件全部通过；共用grammar 28、集中回归90、OCC旧tests184/options19、Responses旧tests162/encode115、vendor183/decode190。 |
| 定义/报告一致性检查 | 五项atlas增量、七份API补充与报告账本均通过；首轮发现pi-messages补充未显式写出prefer/require，补齐措辞后复核通过。 |
| 十协议矩阵只读重跑 | **736 pass / 92 fail**，exit 1；详见下表，失败保留finding。 |
| `git status --short` / staged核对 | 本目录无Git元数据：not a git repository；无法验证index/no-staged-files。未执行git add/commit或破坏性Git操作。 |

矩阵采用既有`tests/duality.mjs`原cases与原oracle，内存中只把相对import解析为文件URL，并将save改为空函数；未改矩阵输入/期待/ignore，也未覆盖`tests/matrix-ten-results.json`。终端完整输出由工具保存在`/var/folders/1l/l_1h2vvn60q808n3fg_x3j880000gn/T/pi-bash-ba1cb3d0286d4038.log`（临时路径可能清理，本表为持久账本）。

| 协议 | pass | fail | finding |
|---|---:|---:|---|
| openai-completions | 81 | 0 | 无 |
| openai-responses | 77 | 1 | req/w06-unicode-session：ByteString字符55357>255，capture=0 |
| azure-openai-responses | 78 | 0 | 无 |
| openai-codex-responses | 0 | 90 | 请求/回复均capture=0；除unicode session为ByteString错误外，主要报Request body didn't contain valid UTF-8 / invalid utf-8 sequence of 1 bytes from index 1。未到本次decoder槽位，保留T/发送域finding，不修transport、不算通过。 |
| anthropic-messages | 91 | 0 | 无 |
| google-generative-ai | 80 | 0 | 无 |
| google-vertex | 80 | 0 | 无 |
| bedrock-converse-stream | 89 | 0 | 无 |
| mistral-conversations | 79 | 1 | req/w06-unicode-session：ByteString字符55357>255，capture=0 |
| pi-messages | 81 | 0 | 无 |
| **总计** | **736** | **92** | 无失败被隐藏或改期待 |

## 6. 残留风险与验收边界

1. vendor wire strict终值未单独建模；原prefer/require不可逆是另一件事。此轮按批准边界仅声明，不发明strict bool槽。
2. OpenAI兼容wire中的任意未知sampling键仍会被当前typed decoder忽略；原参数来源map不可逆不能用来声称这些终值不存在。此轮不按未知根键臆造归属。
3. grammar原参数schema/inputProperty不可恢复；decoded parameters={}不是原schema的可重发替代。非input属性的历史custom调用仍按既有input回退，不在本轮扩展。
4. pi-messages cacheRetention有wire槽而mock未读；动态工具未覆盖。均为范围外finding。
5. Codex及Unicode session矩阵仍红；Node测试并行端口竞争经30秒等待/串行重跑恢复，未修通用测试harness。
6. 无Git元数据，无法提供真实git diff/index证明；本线没有staging动作。锁定pi源码仅通过read/grep/nl读取，没有写入。
7. reviewer验收仍为必经gate；本报告不替代独立review。建议先看统一JSON槽、共用grammar decoder与集中回归，再核对本表的不可逆声明。
