# 定义冻结前：图谱 × 规格 × canonical 三方交叉核验

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 1. 结论与计数

**当前修订状态：独立复审已驳回初轮冻结声明；F1–F5现已按锁定源码修正文档，待再次独立 reviewer gate，作者不自批准最终冻结。** D20/20、G37/37、R6/6为既有处置记录，不能用这些计数替代语义复审；本轮逐项修正与验证见 `freeze-verdict.md` 第7节，不再以初轮“剩余必修0”宣告可冻结。当前源码/测试不变，81个历史FAIL仍为O18/T63；没有批准签名降级、模型扩容或新stop策略。

### 1.0 冻结条件逐项勾销（本次实施）

- [x] 分类/条件与重建规则统一：D02–D08、D14–D16已改图谱和对应规格，源字段L与派生常数D分层，输入契约拒绝/流内失败不冒充T。
- [x] 八份权威规格均为编号1–6，三份重构页具备显式五分类与完整第4节；G01–G37已迁入/补齐并逐条带源码行号；D09–D14、D17–D20正文规则已纠错。
- [x] R01–R06旧finding/权威页/历史计数与快照身份已处理；C05–C11、C18–C20、C23–C25、C27–C29已在对应规格明确登记现存oracle差异，未把“已文档化”称为“测试已修”。
- [x] 明确剩余实现/实验的现状、目标域、验收与批准状态：第7.4节；encoder/decoder补发补读一律W-07候选，oracle/覆盖为W-06候选，不要求本次81→0。
- [x] 只改docs/**，受保护三棵源码/测试树摘要与开始相同；未改fixture、ignore、矩阵或任何生产代码。
- [ ] 独立 reviewer gate：初轮已被 `freeze-verdict.md` 驳回；F1–F5文档修正后仍须审阅者再次确认，不是作者可勾销的文档修订项，也不伪称已正式冻结。

### 初审基线与证据时点

**第1.1–6.1节及附录A/B保留初审快照。** 其中旧行号、建议未实施、仅写本文、233/E9/D127等均描述初审时点，不是当前现状或当前文件索引。当前结果与可直接定位的新版引用统一见第7节。这样保留原裁决来源，不用覆盖历史证据来制造“从未有冲突”。


**初审判定（历史）：不可冻结。** 不是因为必须先清掉 81 个实验 fail，而是定义本身尚有分类冲突、相互矛盾的映射和缺失的规则汇编；见 D01–D20、G01–G37。已明确契约下的 oracle/codec/transport 工作可候选归入 W-06/07，不能把尚未统一的定义也归档为“实验层问题”（五分类前提见 `irreversibility-atlas.md:9–13,29,314`；具体冲突位置见下表）。本报告不批准任何签名降级或模型扩容策略。

### 1.1 分母与一致项

| 维度 | 实际核验结果 | 可追溯依据 |
|---|---|---|
| 输入清点 | 8 份规格覆盖 10 协议；其中仅 5 份有编号 1–6 / 第 4 节，3 份仍为旧格式 | `api/openai-completions.md:3,105,172`；`api/anthropic-messages.md:3,136,207`；`api/bedrock.md:3,80,135`；`api/family-variants.md:3,114,164`；`api/pi-messages.md:3,66,106`；另三份见 D01 |
| 五分类主类对账 | 图谱 233 个编号行：**159 行未发现主类冲突、7 行需改判或拆条件、67 行对应旧规格未提供显式五分类，不能计作五分类一致** | 逐行映射见附录 A；图谱原分母 E9/D127/L64/P30/T3：`irreversibility-atlas.md:559–571` |
| “159”边界 | 这是主类对账，不是 159 行全部语义正确；例如 Bedrock 两行 D 一致但重建文字错误，单列 D07/D08；重复家族汇总行按原编号保留，不扩成标量字段计数 | `irreversibility-atlas.md:248,252,557`；`api/bedrock.md:34,45,90,100,123` |
| canonical 汇编 | 图谱 D127 行中，**90 行在对应规格第 4 节有规则索引；37 行未满足该条件**：旧三页 D36 无第 4 节，另 Codex endTurn D1 在第 4 节缺规则 | 逐行规则位置见附录 A；37 项的已有文字、缺口和应补规则见第 3 节。索引存在不代表规则无错，仍受 D01–D20 裁决约束 |
| 81 fail 解释 | **81/81 有对应项、0 未解释、0 新增未知机制**；O18＝Responses9+Azure9；T63＝Codex req29+reply34；未以 usage 或 Mistral 重分类 | `final-ledger.md:30–110`；`irreversibility-atlas.md:465–553`；附录 B 逐主键映射 |
| 已有裁决文档化 | AM legacy schema/responseModel、Google input/read、Mistral Q 保序、OCC R details 等既有裁决已写入文档；但不等于 request canonical 或全部字段已正确 | `final-ledger.md:151–153`；第 4 节 C01–C29 |

“67 行无显式五分类”＝Responses24 + Google21 + Mistral22。没有把从叙述推断出的类别冒充规格已声明的终态。其字段规则仍逐行核对，缺错全部记录，见附录 A 和 D09–D14。分类统计采用**字段组＋方向＋条件**，不是协议胜负数（`irreversibility-atlas.md:11,557`）。

### 1.2 证据与只读边界

所有 `api/*.md` 相对本文目录，`src/**`、`tests/**` 相对 mock-with-pi；TS 缩写根为 `<pi-mono>/packages/ai/src`：OCC=`api/openai-completions.ts`，OR=`api/openai-responses.ts`，CS=`api/constrained-sampling.ts`，SH=`api/openai-responses-shared.ts`，AM=`api/anthropic-messages.ts`，GG=`api/google-generative-ai.ts`，GS=`api/google-shared.ts`，GV=`api/google-vertex.ts`，BR=`api/bedrock-converse-stream.ts`，MI=`api/mistral-conversations.ts`，PM=`api/pi-messages.ts`，CX=`api/openai-codex-responses.ts`，TM=`api/transform-messages.ts`。缩写只替代文件名，后面的数字均为当前文件行号，不是章节号。

仅写本文，不修改图谱、规格、ledger、源码、测试或快照。已有矩阵结果是输入证据；本轮不运行会覆写结果的 `tests/duality.mjs`（其写入位置见 `tests/duality.mjs:19–20,28–31,37`；图谱也明确此边界 `:579`）。开始时树摘要记录如下；结束复核见第 6 节。

| 树（排序相对路径 + NUL + 内容 + NUL；docs 排除本文） | 文件数 | 开始 SHA256 |
|---|---:|---|
| docs/design/mock-llm-server | 24 | `08aabdbc63ba3f0889a7bee6a563047acce568b55544a5cf96339891c0465bfd` |
| tests | 37 | `531a832c80d466e8b88ee66c64a7b85b9fe0fc73d0ad3385720b76b9e493ac89` |
| src | 87 | `a36b52c0a90c5d4f79b1a768feccfbbc94ac72ee77eab8a18ab4d011b1357659` |
| 锁定 TS src | 243 | `b5ff86777c0c1fd15280ab0cee1f4cbe7828922e9be717ce85fed9976af7bab0` |

## 2. 定义冲突、缺口与源码裁决

处置列中的“改”均为**建议，未实施**。“冻结前”是定义必修；“W-06 候选”仅指已明确规则下的实验/oracle 工作，“W-07 候选”仅指实现/transport 工作。输入文档中未检出 `W-06`/`W-07` 工作项定义，因此不伪造其既获批准的范围；即使以后将实现任务纳入这两个阶段，下列定义矛盾仍须先消除。

| ID / 位置 | 图谱或一方说法 | 对方说法 | 源码裁决 | 建议处置 / 冻结影响 |
|---|---|---|---|---|
| D01 输入前提/统一格式 | 图谱称 7 份 Markdown：`irreversibility-atlas.md:7,592` | 实际多出独立 Bedrock 页；Responses 仍为 a–e（`api/openai-responses.md:19,63,99,138,149`），Google 仍为 0/a–e（`api/google-generative-ai.md:6,14,36,56,75,80`），Mistral 仍在旧合并页 B（`api/bedrock-mistral.md:51–93`），均无统一第 4 节/终态列 | 这是实际文件结构，不是源码决定的协议差异；Bedrock 专页已明确裁决旧合并页（`api/bedrock.md:113–123`） | **冻结前改图谱清点、改三份旧规格结构并建立唯一权威/旧页迁移声明**；不能声称“10份规格已统一” |
| D02 A01.11 / 工具 ID 条件 | `irreversibility-atlas.md:45` 对 R id/name/arguments 笼统 E | `api/openai-completions.md:89` 仅不同 index/id 域 E，重复 id 可合并 D | OCC:499–555 按 index 后 id 找 slot；Rust index 虽递增，重复 id 仍可命中旧 slot | **冻结前改图谱**，补不同 ID 前提、重复 ID D；不是改规格来删除其正确边界 |
| D03 A05.06 / schema 对象 | `irreversibility-atlas.md:167` 将整个非 strict parameters 行列 L | `api/anthropic-messages.md:78,154` 整体 D，根级被删键 L | AM:1637–1650 仍发送 type/properties/required，不能把整个 schema 判 L；图谱 I06 只针对被删根级信息反而正确（`:329`） | **冻结前改图谱**：整体 D，根级其他键 L；保留 I06 范围，不改实现 |
| D04 A04.08 / Codex endTurn | `irreversibility-atlas.md:135` 当前主类 D，称 encoder 缺口 | `api/family-variants.md:94` 当前 encode 不发→L，同时承认 wire 有 end_turn | CX:775–783 确有读取；`src/api/openai_responses/encode.rs:107–111` 不发；`src/model/message.rs:82` 已有字段。按双方 L=当前映射不发、D=已存在投影的定义，**当前源 endTurn 为 L；未来补发后才可能 E**，不能将“可修”充作当前 D | **冻结前改图谱主类、改规格第4节补现状规则/未来缺口**；补 encoder 是 W-07 候选，非本轮实施 |
| D05 A07.04/A07.23；另 A06.09 | Vertex 两行均 D（`irreversibility-atlas.md:219,238`）；Google 根同样 D（`:198`） | `api/family-variants.md:105,136` 唯一已发 ID E，缺/重复 ID P；Google 旧页 `:25` 描述生成但无分类 | GG:195–201 / GV:204–210 使用 name+Date.now()+counter，**不是输入决定的 D 字符串**；两家应拆唯一已发 E、缺/重复 P，name/args/签名另论 | **冻结前改图谱两处 Vertex 和 Google 根条件分类、改 Google 规格补 P**；实验结构化断言归 W-06 候选，不可全局忽略 ID |
| D06 A07.06 / write=0 | `irreversibility-atlas.md:221` 与 I18 `:341`：源 cacheWrite L | `api/family-variants.md:107`：write D→0，并承认原值 wire 未携带 | `src/api/google_generative_ai/encode.rs:90–98` 不编码 write；GV:240–249 新建 write=0。**源 write L、重建常数0为派生 D**，不能只给源字段 D | **冻结前改规格**，沿用源字段/重建值分层；无需改实现 |
| D07 A08.03 / Q redacted | `irreversibility-atlas.md:248` decode 固定占位 | `api/bedrock.md:34,90,123` Q 文本空串，R 才占位 | `src/api/bedrock_converse_stream/decode_assistant.rs:29–34` 明确 String::new()；BR:1041–1046 不发原 thinking | **冻结前改图谱**；主类 D 没冲突但算法错误。Q canonical 同错见 C14，不能把图谱和错误 oracle 相互背书 |
| D08 A08.07 / reasoning 扩展 | `irreversibility-atlas.md:252` 泛称厂商扩展 JSON 化；旧页同样含糊（`api/bedrock-mistral.md:26`） | `api/bedrock.md:45,100,113,123` 只读取 .thinking；effort/beta 等漏读 | `src/api/bedrock_converse_stream/decode.rs:39–42` 仅 `.thinking`；BR:1279–1332 另有 output_config/reasoning_effort | **冻结前改图谱及旧合并页**，把已发未读 D 缺口逐项写出；以后补读才属 W-07 候选 |
| D09 Vertex schema | 图谱已判“Vertex剥meta”错误（`irreversibility-atlas.md:389`）；家族新规格同样否定（`api/family-variants.md:69`） | Google 旧页仍称 useParameters=true 是 Vertex 路径（`api/google-generative-ai.md:53`） | GG:395–397 / GV:485–489 均传 false；GS:380–396 的 false 分支 parametersJsonSchema 原值保留 | **冻结前改 Google 规格**；不改正确源码、家族页或 schema fixture |
| D10 Responses Q 跨模型条件 | 图谱概括按跨源/模型门控（`irreversibility-atlas.md:70`），家族新页明确 foreign 规范化后可保留 item（`api/family-variants.md:39`） | 根规格 `api/openai-responses.md:74,78,91` 将工具签名删除限成跨provider/api，并称 item ID 仅同模型保留 | TM:95–98,131–137：同provider/api不同model也删 thoughtSignature、执行 normalizer；SH:257–260,290–305：只有 isDifferentModel 或前缀不匹配删 item；foreign 规范后 fc_ 可保留 | **冻结前改根规格 T2/T3/归一事实**；Q oracle 缺口另见 C05，不能以 oracle 的简化条件裁源码错 |
| D11 Google 纯图工具结果 | 根规格 `api/google-generative-ai.md:48` 对 Gemini≥3 笼统写文本为占位 | 家族页 `api/family-variants.md:68` 写按文本聚合；图谱 `irreversibility-atlas.md:194` 未限定该占位条件 | GS:285–315：有任何拼接后非空文本，保留该 textResult；**仅无文本而有图片**才 `(see attached image)`；Gemini<3 的额外 user 另起 | **冻结前改根规格**明确纯图前提；不把混合文本覆盖成占位；实验补图文向量属 W-06 候选 |
| D12 Google R usage 饱和 | 图谱已写 output<reasoning 时提升（`irreversibility-atlas.md:199`），家族页亦写（`api/family-variants.md:106`） | Google 根规格 `api/google-generative-ai.md:66` 直接 output−reasoning，无饱和前提 | `src/api/google_generative_ai/encode.rs:90–98` saturating_sub；GG:235–236 再加 reasoning：最终 output=max(source.output,source.reasoning??0)，缺 reasoning→0 | **冻结前改根规格并补 canonicalR 域/公式**；实际 fillGoogle 已有该公式（`tests/matrix-lib.mjs:160`），不能反向改它 |
| D13 Mistral tools-only / 图片 | 图谱已列真实 decoder 漏读（`irreversibility-atlas.md:272,276,401`） | 旧规格 `api/bedrock-mistral.md:66–67,81` 笼统说 ToolResult/tools 主路径成立，未声明这两个条件缺口；canonical 还合成 system（`tests/canonical-mistral.mjs:58–60`） | MI:875–896 发图；`src/api/mistral_conversations/decode_messages.rs:94–110` 只 content_text；`:115–119` 只挂已有首 System | **冻结前改 Mistral 规格**明记当前投影/缺口；修 decoder 为 W-07 候选，图片损失不能定义为协议无载体 |
| D14 Mistral 空白/Unicode 与 E 域 | `irreversibility-atlas.md:274` 一面“过滤trim空”一面整个 Q text/thinking E；旧规格 `api/bedrock-mistral.md:64,91` 仅强调保序 | 其他统一规格区分正常域 E、清洗/过滤 D（例如 `api/openai-completions.md:36–41`） | MI:844–858 先 trim 判空、再 sanitize；R 也 sanitize、跳过清洗后空串（MI:650–675,690–692）。保序不等于未清洗原文 E | **冻结前改图谱拆条件、改 Mistral 规格写 Q/R 净化规则**；oracle 不清洗见 C19。这是单边定义缺口，不额外算作“显式五分类表冲突” |
| D15 A10.11 / PM 合法 stop | `irreversibility-atlas.md:309` 整个范围列 D，但同行说范围内精确 | `api/pi-messages.md:54–55,62,78` 五合法 stop/error 为 E；pending/deferred 拒绝、成功 errorMessage L 分开 | `src/api/pi_messages/encode.rs:64–79` 与 PM:195–217 五值/流内错误直接赋回，无投影；无合法编码的输入不能为 D 提供依据 | **冻结前改图谱**：五合法终态 E，成功 errorMessage L，外域明确拒绝；不发明第六终态 |
| D16 “拒绝=transport”仍不统一 | 图谱/家族/PM 明确拒绝不是 T（`irreversibility-atlas.md:314`；`api/family-variants.md:7,90`；`api/pi-messages.md:62`） | AM 的 schema require/孤立结果/assistant image 分别记 T（`api/anthropic-messages.md:71,79,117`）；Bedrock 的 require/图片转换/pending/image 也记 T（`api/bedrock.md:27,29,72,77,131`） | CS:225–248 属发送前 require 拒绝；`src/api/anthropic_messages/messages.rs:87–90` 是内容解码后的配对拒绝；各 encoder 的 Err 在 HTTP500 前发生。外部 HTTP 客户端可观察 T，但不能把**同一 Q/R 组装的输入契约拒绝**统称内容解析前 transport。Bedrock 流内异常也可能已有内容（BR:320–357） | **冻结前统一分类轴/观察点并改 AM/Bedrock 规格**；可保留“下游观察到HTTP失败”，不可覆盖输入域/流内失败的根因。不是要求增加第六分类 |
| D17 A04.05 / Codex session | `irreversibility-atlas.md:132` 写“原session header”；与其 I23 `:346` 的长session例外范围也应分清 | `api/family-variants.md:12,53` 明确body与SSE headers同为截64值 | CX:276–284 先clamp出codexSessionId再传body/header builder，CX:1676–1678 两头用同值；显式额外header覆盖另论，默认并不保留原长值 | **冻结前改图谱**：Codex默认头和body均截64；不要套普通Responses原session header可保全的结论 |
| D18 Google R rawStop保留词 | 图谱 `irreversibility-atlas.md:201,239` 只说按native原因投影；没有承诺源error总是error | `api/google-generative-ai.md:67` 将所有非成功输入使用rawStop后说成error；`api/family-variants.md:108` 同样泛称pending/deferred为错误finish | `src/api/google_generative_ai/encode.rs:82–86` 对这些输入取任意source.rawStopReason或OTHER；GS:441–466 中若raw=STOP→stop（有call再toolUse），MAX_TOKENS→length；未知值抛错。**源stop枚举与raw保留词不一致时，实际可能变成功/length，而非总error** | **冻结前改根/家族规格**补该条件；oracle也须按native原因映射，不从源stop推断结果；W-06候选见C25 |
| D19 Responses Q净化范围 | 图谱 I24仅声称调用位置会sanitize（`irreversibility-atlas.md:347`），家族页同样限定S/G调用点（`api/family-variants.md:122`） | `api/openai-responses.md:83` 泛称所有文本均过sanitize，并用Rust String把它说成no-op | SH:263–267 的reasoning-item原JSON直接push，不遍历净化summary/content；names/arguments也不是普通文本净化路径。Rust不接受坏surrogate不能证明JS输入没有它 | **冻结前改根规格**为调用点白名单，明确签名item不改写；此输入若后续Rust拒绝，不能canonical先伪净化后宣布成功 |
| D20 Responses Q options缺条件 | 图谱 `irreversibility-atlas.md:73` 与根规格 `api/openai-responses.md:82` 概括max>=16、effort映射；后者漏0省略及reasoningSummary回退 | 家族Azure页已明确truthy max/summary默认medium（`api/family-variants.md:50,54`），不能以复用根把它们抹掉 | OR:340–342：maxTokens truthy才发，0省略；OR:363–379：reasoningEffort=显式??(truthy reasoningSummary?medium:undefined)，显式effort才经level map，summary用value或auto；默认参考provider=openai亦会走这些分支 | **冻结前补根规格和图谱条件**；第4节G07必须收录精确门控，而不是仅写max(16,n) |

### 2.1 过时交叉引用与证据时点（不是新增 codec bug）

| ID | 两方位置 / 裁决 | 建议处置 |
|---|---|---|
| R01 | 图谱 `:390` 仍指 OCC 旧第125行说 textSignature 报错；当前 `api/openai-completions.md:84,155` 已正确写静默不发，当前 :125 是 C13。`src/api/openai_completions/encode.rs:20–21` 支持新规格 | 改图谱：标旧版本 finding 已解决并更新引用，不能再称当前规格错误 |
| R02 | 图谱 `:367,387` 仍引用 family 旧第91行“只需SSE”和旧 F5“模型无endTurn”；当前 `api/family-variants.md:94,157` 已否定两说，`src/model/message.rs:82` 字段存在 | 改图谱为历史裁决，不重复报当前文档矛盾；当前 endTurn 类别冲突仍是 D04 |
| R03 | 图谱 `:389` family :113 并非当前 schema 依据；当前正确位置是 `api/family-variants.md:69,125`；Bedrock 页 `:123,133` 所引 atlas :188/:192/:191 已不在 A08，应为 atlas :248/:252/:251 | 改图谱/规格交叉引用。不能以“行号合法且没越界”证明引文命中论据 |
| R04 | Responses 补记仍称四案（`api/openai-responses.md:188`），Mistral 仍称31/0（`api/bedrock-mistral.md:91`）；当前 ledger 明示已扩容为 O18、Mistral63/0（`final-ledger.md:123–130,151`） | 改规格注明这是历史四案/历史31案，或更新当前分母；不是发现额外 fail |
| R05 | ledger `:118,145` 记录另一次 JSON hash `c353…`/日志，当前 JSON 为 `a458…`，图谱 `:463` 已明确是后续快照；本轮按完整键验证81项相同 | 保留历史执行事实，冻结索引增加当前快照身份即可；不能说 ledger 曾跑的 hash 是造假，也不能声称当前文件 hash 等于 ledger hash |
| R06 | 旧合并页仍说 Mistral 路由待接（`api/bedrock-mistral.md:78–80`）；当前 chat 路径先选Completions再由mount配置、x-affinity或body特征条件选择Mistral，见 `src/mounts/protocol.rs:116–118`、`src/mounts/routing.rs:40–46`、`src/mounts/selection.rs:7–51`；不是所有普通chat请求无条件归Mistral。ledger有真实63案（`:130`） | 改旧页/作明确退役声明。Bedrock 专页 `:113–123` 已指出旧页错误，但旧页本身没有权威优先级声明 |

## 3. canonical 汇编完备性：37 项缺列登记

严格按“**对应规格第4节**”验收，而不把其他协议页面、编码示例或测试实现当作该页完整汇编。G01–G15 对应 Responses D15，G16–G26 对应 Google D11，G27–G36 对应 Mistral D10，G37 对应 Codex endTurn；每项的图谱行号和规格已存在文字见表。**“迁入”表示规则已有，缺汇编位置；“补齐”表示语义本身也缺失/错误**。其余 D90 的第4节索引逐行见附录 A；D02/D04/D05/D15 等改分类后须重算分母，不把本轮233行统计当永久字段全集（原统计口径 `irreversibility-atlas.md:557–575`）。

| 缺口 | 图谱条目 / 位置 | 对应规格现有文字 | 应迁入/补齐的规则与裁决 |
|---|---|---|---|
| G01 | A02.01；`irreversibility-atlas.md:66` | `api/openai-responses.md:67–68,94` | 迁入system/sections/tools按顺序折叠，空system及tools-only物化；native分支另列（SH:184–227；utils/transcript.ts:58–119）。 |
| G02 | A02.02；`irreversibility-atlas.md:67` | `api/openai-responses.md:46–48,79,83` | 迁入字符串→input_text数组、空数组user跳过、sanitize、图片data URI保序（SH:229–253）。 |
| G03 | A02.03；`irreversibility-atlas.md:68` | `api/openai-responses.md:49,78,88–89` | 迁入item JSON原样回放（不递归sanitize其summary/content）；无签名不发；Q文本取summary/content；非法JSON必须抛错，不吞异常（SH:263–268）。 |
| G04 | A02.04；`irreversibility-atlas.md:69` | `api/openai-responses.md:50,78,90` | 迁入v1/legacy id及phase、msg_pi索引回退、>64 UTF16哈希、连续assistant合并（SH:269–289；src/api/openai_responses/decode.rs:118–142）。 |
| G05 | A02.05；`irreversibility-atlas.md:70` | `api/openai-responses.md:51,74,78,91` | 先修D10再迁入：sameModel三元门槛、分call/item与foreign fc_hash；仅isDifferentModel或前缀不匹配删item，namespace仅sameModel（TM:95–98,131–137；SH:154–177,257–325）。 |
| G06 | A02.06；`irreversibility-atlas.md:71` | `api/openai-responses.md:53–57,80,92` | 迁入单换行文本/空占位、视觉图随后、call_id配对全ID/name、isError=false、未配对拒绝（SH:81–108,332–348；src/api/openai_responses/decode.rs:89–108,195–199）。 |
| G07 | A02.08；`irreversibility-atlas.md:73` | `api/openai-responses.md:29–37,81–82,140–145` | 迁入schema严格化算法、truthy max才发且>=16（0省略）、effort显式映射或truthy summary回退medium、sampling覆盖、session头优先/body截64；wire strict未读不是无载体（SH:360–397；api/openai-responses.ts:277–291,330–386）。 |
| G08 | A02.09；`irreversibility-atlas.md:74` | `api/openai-responses.md:111–115` | 补独立R：added建slot并保空，done权威text；thinking=summary\|\|content\|\|delta，不套Q过滤（SH:464–484,688–710）。 |
| G09 | A02.10；`irreversibility-atlas.md:75` | `api/openai-responses.md:111,186` | 迁入合法reasoning-item JSON值域、终值JSON.stringify(item)、任意opaque不在当前encode域（SH:688–693；src/api/openai_responses/encode.rs:17–30）。 |
| G10 | A02.11；`irreversibility-atlas.md:76` | `api/openai-responses.md:186–188` | 迁入现状拒绝＋待批投影；不能把候选summary-item当既有实现，redacted不伪造可见文本（SH:688–693；irreversibility-atlas.md:351–361,419）。 |
| G11 | A02.12；`irreversibility-atlas.md:77` | `api/openai-responses.md:113` | 迁入无itemID补fc_hash，fullID=call_id与item.id拼接；done可补namespace，参数JSON值保留（SH:485–503,710–727；src/api/openai_responses/encode.rs:52–69）。 |
| G12 | A02.13；`irreversibility-atlas.md:78` | `api/openai-responses.md:122–124,130,190` | 补完整usage域：input=max(0,input_tokens-read-write)、reasoning缺省0、total取wire、cost按模型算；failed不走usage finalize（SH:560–595,747–757）。 |
| G13 | A02.15；`irreversibility-atlas.md:80` | `api/openai-responses.md:121` | 迁入缺省resp_mock、created/terminal赋ID，独立预测而非从actual复制（src/api/openai_responses/encode.rs:11；SH:557–559,601–604）。 |
| G14 | A02.16；`irreversibility-atlas.md:81` | `api/openai-responses.md:125–128,165` | 补有call完成→toolUse、无call的toolUse→stop，failed/code文案和零usage路径；unsupported为输入拒绝非协议绝对无容量（SH:584–595,743–760；src/api/openai_responses/encode.rs:100–112）。 |
| G15 | A02.22；`irreversibility-atlas.md:87` | `api/openai-responses.md:117–130（未独立列）` | 补rawStopReason=status或status.reason；源raw串不发，与统一stop分别比较（SH:584–589,747–755）。 |
| G16 | A06.01；`irreversibility-atlas.md:190` | `api/google-generative-ai.md:19–20,40,53` | 修D09后迁入system/工具快照；两家均parametersJsonSchema，strict按模型条件（GG:379–397；GV:489；GS:380–406）。 |
| G17 | A06.02；`irreversibility-atlas.md:191` | `api/google-generative-ai.md:21–22,49,51` | 迁入空字符串发text、零parts跳过、单text折串/图文保序/净化（GS:203–226；src/api/google_generative_ai/decode.rs:70–106）。 |
| G18 | A06.03；`irreversibility-atlas.md:192` | `api/google-generative-ai.md:23–25,44–46` | 补三类有效base64同源签名、签名空块保留、先受TM三元sameModel门槛，不能把oracle漏读当损失（TM:95–145；GS:146–160,230–281）。 |
| G19 | A06.04；`irreversibility-atlas.md:193` | `api/google-generative-ai.md:25,46` | 迁入条件ID：claude-/gpt-oss-/Gemini>=3发；跨模型清洗，Q缺ID按name回填（GS:165–177,270–281；src/api/google_generative_ai/decode.rs:135–143）。 |
| G20 | A06.05；`irreversibility-atlas.md:194` | `api/google-generative-ai.md:26,47–48` | 修D11后迁入text join/error-output、连续结果、条件ID、旧Gemini图片拆user、其他嵌套；仅纯图补占位（GS:285–338）。 |
| G21 | A06.06；`irreversibility-atlas.md:195` | `api/google-generative-ai.md:27–32,54` | 补等级/预算、strict工具mode优先级、Simple clamp及decoder budget:n；不逆猜原level（GG:379–418,431–460；GS:423–435）。 |
| G22 | A06.08；`irreversibility-atlas.md:197` | `api/google-generative-ai.md:63–64,68（未列合并）` | 补R相邻同型合并、空文本建块条件、最后非空签名覆盖，与Q过滤分开（GG:110–171；GS:138–143）。 |
| G23 | A06.09；`irreversibility-atlas.md:198` | `api/google-generative-ai.md:25,65（仅发ID条件）` | 补R唯一已发ID E，缺/重复ID P=本地时钟+counter；name/args/签名独立保留，不忽略全部ID（GG:175–219）。 |
| G24 | A06.10；`irreversibility-atlas.md:199` | `api/google-generative-ai.md:66,99–103` | 修D12后迁入prompt=input+read、candidates=max(0,output-reasoning)、最终output=max(output,reasoning)、read不再加input、total取wire（src/api/google_generative_ai/encode.rs:90–98；GG:232–250）。 |
| G25 | A06.12；`irreversibility-atlas.md:201` | `api/google-generative-ai.md:62,67,69,73` | 补首truthy responseId、STOP工具升格/无call回stop，source.error等若raw=STOP/MAX_TOKENS可变成功/length；错误原因派生文案/未知值抛错，非任意errorMessage往返（GG:110,224–228,272–297；GS:441–475）。 |
| G26 | A06.19；`irreversibility-atlas.md:208` | `api/google-generative-ai.md:67,89（未独立列）` | 补rawStopReason=wire finishReason；源raw仅在非成功encoder分支作候选，不与源raw无条件等价（GG:224–228；src/api/google_generative_ai/encode.rs:82–86）。 |
| G27 | A09.01；`irreversibility-atlas.md:272` | `api/bedrock-mistral.md:61,67（未列缺口）` | 补system/sections/tools快照、strict算法和tools-only不合成System的当前缺口（MI:777–810；src/api/mistral_conversations/decode_messages.rs:115–119）。 |
| G28 | A09.02；`irreversibility-atlas.md:273` | `api/bedrock-mistral.md:62–63` | 补非视觉占位、user空串/零块、净化、单text折串、data URL图片（TM:12–57；MI:812–839；src/api/mistral_conversations/decode_messages.rs:24–35）。 |
| G29 | A09.04；`irreversibility-atlas.md:275` | `api/bedrock-mistral.md:56,65` | 补9字符alnum：clean长9保留，否则hash(clean\|\|id)、碰撞attempt重试；仅跨模型执行、结果同步；content后追加calls导致原交错丢失（MI:238–267,840–874；TM:129–151）。 |
| G30 | A09.05；`irreversibility-atlas.md:276` | `api/bedrock-mistral.md:66,81（未列图片缺口）` | 补text sanitize/join后trim、error前缀/空占位，wire图片而mock只读text，isError=false不从前缀猜布尔（MI:875–920；src/api/mistral_conversations/decode_messages.rs:94–110）。 |
| G31 | A09.07；`irreversibility-atlas.md:278` | `api/bedrock-mistral.md:68–70` | 补direct/Simple预算、temperature、对象toolChoice JSON化、effort优先prompt_mode、body key优先x-affinity及retention门控（MI:350–430,527–552；src/api/mistral_conversations/decode.rs:14–35）。 |
| G32 | A09.08；`irreversibility-atlas.md:279` | `api/bedrock-mistral.md:75–76,89` | 补R sanitize再跳空、相邻同型无分隔合并、类型交错保留；不用顶层reasoning_content，不将Q保序推广R（MI:644–704）。 |
| G33 | A09.09；`irreversibility-atlas.md:280` | `api/bedrock-mistral.md:75（仅概述）` | 补工具index累积、缺id derive、args流解析；当前encoder已有合法ID时E，不套Q normalize到所有R输入（MI:710–745；src/api/mistral_conversations/encode.rs:18–20）。 |
| G34 | A09.10；`irreversibility-atlas.md:281` | `api/bedrock-mistral.md:75,89,93` | 补cached兼容拼写优先级、非有限/负值及[0,prompt] clamp，input=prompt-read、write0、total truthy否则四计数和（MI:555–573,616–628）。 |
| G35 | A09.12；`irreversibility-atlas.md:283` | `api/bedrock-mistral.md:75–76,89（未列全部终态）` | 补首responseId/缺省mock-mistral；error固定server error、aborted经abort→error、deferred→stop、pending拒绝（MI:609–614,936–951；src/api/mistral_conversations/encode.rs:6–9,28–36）。 |
| G36 | A09.18；`irreversibility-atlas.md:289` | `api/bedrock-mistral.md:75（未列rawStop）` | 补rawStopReason=wire finish_reason；源raw未被encoder使用，与统一stop分开（MI:633–636；src/api/mistral_conversations/encode.rs:28–35）。 |
| G37 | A04.08；`irreversibility-atlas.md:135` | `api/family-variants.md:94（仅第3节L）` | 补当前源endTurn不编码L与未来F5边界；true/false/None分开，不能把可表达当当前D（CX:775–783；src/api/openai_responses/encode.rs:107–111；irreversibility-atlas.md:435）。 |

## 4. 规格 canonical 与现有 tests 的差异清单

每行包含已存在的实现行为、规格/图谱契约和权威源裁决。“已记”＝差异已经反映在对应文档，**不等于测试已修**；“补记”＝只在图谱/其他页有，或本轮首次明确该 oracle 分支。下列修复均未实施；已明确行为下改实验 oracle/覆盖属于 W-06 候选，生产漏读/漏发属于 W-07 候选。新签名降级、扩统一模型仍需先批准契约，见 `irreversibility-atlas.md:419,431,436`。

| ID / 测试位置与现状 | 规格 / 图谱位置 | 源码裁决与应记录的规则 | 文档化与建议处置 |
|---|---|---|---|
| C01 OCC Q Unicode：`tests/canonical-occ.mjs:113–139` 未清洗 | `api/openai-completions.md:118,149` | OCC:1265,1305；`utils/sanitize-unicode.ts:21–25` 删除孤立 surrogate，不是 U+FFFD 替换 | **已记**；改 canonical；实验 W-06 候选 |
| C02 OCC Q thinking：`:129–144,163–168` 将 signature 字符串组成数组；opaque 也造 details，过滤空 thinking | `api/openai-completions.md:119,150–152`；`irreversibility-atlas.md:399` | OCC:1312–1319,1339–1347,1383–1405：首合法非空全合法 details 优先、抑制可见 reasoning；reasoning-only 无 content/tools 被删；空文本签名仍可贡献 details | **已记**；改 request canonical，不能借 R 已修声称 Q 正确 |
| C03 OCC Q compat/strict/grammar/options：`:27–32,100–109,146–151` 默认 compat/固定64/普通工具 | `api/openai-completions.md:121–124,153` | OCC:813–1007,1482–1516；默认fixture域不覆盖 mid-system/tool、strict、自定义 grammar 属性、reasoning模板、session/预算/采样覆盖 | **已记**；限制 oracle 域或按配置建模；已发 budget/grammar 键 decoder 缺口仍按规格 `:63,68–71,167` 单列实现，不可迁就测试 |
| C04 OCC R error/ID：`tests/canonical-occ-reply.mjs:10–11,39–41` 从got复制ID、无^的错误regex | `api/openai-completions.md:94,157–158` | `src/api/openai_completions/encode.rs:63–70` 只 strip_prefix；后缀 stop 等可变成功终态（OCC:1566–1584）；ID 应独立从输入及wire规则预测 | **已记**；改 oracle / 独立断言；不改正确 encoder 来满足宽regex |
| C05 Responses Q：`tests/canonical-ores.mjs:43,75–96` 简化整ID、吞JSON异常、忽略textSignature/phase/namespace | `api/family-variants.md:123,133`；图谱 `:398`；根页仍 D10 条件错误 | SH:154–177,263–288,290–325；非法签名必须显式拒绝，不能静默删除；foreign item前缀条件见 D10 | **家族已记、根页缺显式对账**；改根规格并改 canonical；W-06 候选 |
| C06 Responses Q 图像：`tests/canonical-ores.mjs:100–108,170` 总转text | `api/family-variants.md:124`；`api/openai-responses.md:54–55,80` | SH:81–108；`src/api/openai_responses/decode.rs:178–191` 支持图片；不能声明协议损失 | **家族已记、根页无测试差异表**；改 canonical |
| C07 Responses Q schema/options：`tests/canonical-ores.mjs:178–195` 固定64/d-s1且根canonical不strict；家族包装才调用strictTools | `api/family-variants.md:125–126,129–134`；`api/openai-responses.md:81–82` | SH:360–397、OR:330–386；root与wrapper的测试域不同，grammar/dynamic工具仍有decoder支持缺口 | **部分已记**；根页补分层；不得把家族strict测试外推根canonical |
| C08 家族 Q：`tests/canonical-family-variants.mjs:10–20,37–45` Codex无条件auto，默认mid模式，仅retag Vertex | `api/family-variants.md:120,125–130` | CX:543–598 显式toolChoice应保留、无maxTokens；Azure部署映射不同；Vertex预算/条件ID/图像不由retag证明 | **已记**；改 canonical 或准确限域，不改fixtures制造通过 |
| C09 Google Q 三类签名：`tests/canonical-gai.mjs:46–59,129–142` 模拟发text/thinking签名却重建删掉；工具未发签名 | `api/family-variants.md:127`；图谱 `:397`；Google根页 `:23–25,45–46,82` 声明支持 | GS:146–160,243–281；`src/api/google_generative_ai/decode.rs:135–156` 三类签名恢复真实存在 | **家族/图谱已记、Google根无差异表**；改 canonical，不得删 wire/parser 正确能力 |
| C10 Google Q 模型/图/options：`tests/canonical-gai.mjs:3–5,27,59,64–78,158` identity ID、无图、固定64 | `api/family-variants.md:128–130`；Google `:43,46–54` | GS:165–186,285–338；GG:431–460；只适用mock-gemini限定fixture，不是Gemini3/非Gemini多模态/预算全集 | **家族已记**；根规格需补独立实验域声明和差异表；改oracle/扩覆盖属W-06候选 |
| C11 Google R text最后签名：`tests/matrix-lib.mjs:171–175` 仅thinking更新签名、text保留第一签名 | `api/family-variants.md:103,132,136`；图谱 `:197,237` | GG:141–165 / GV:150–180 + GS:138–143：合并text也取最后非空签名 | **家族已记、Google根回复映射未写合并**；改root规则并改fillGoogle；本轮内存探针已复现第一签名残留；空签名也应按truthy门槛消失，而fill会照留源空串（同源GG:141–165 / GV:165–180） |
| C12 AM Q 错误图片/纯图片：`tests/canonical-am.mjs:136–161` 多图仅末尾一note，纯图不补前置文本 | `api/anthropic-messages.md:150–151,173–174` | AM:1330–1345 每图原位替换；AM:174–180 纯图前插 `(see attached image)`；不是“已有文本也被覆盖” | **已记**；改 canonical，不改真实 converter |
| C13 AM Q Unicode/配对/配置：`tests/canonical-am.mjs:33,37,46,55,58,131,149,158,178,192` 未清洗、无配对名默认空、固定64默认compat | `api/anthropic-messages.md:149,154–157,175–177` | `utils/sanitize-unicode.ts:21–24`；`src/api/anthropic_messages/messages.rs:87–90` 未配对抛错；native/strict/OAuth/managed effort不在默认oracle域 | **已记**；改测试或限域，不能把mock配对拒绝当成功空name |
| C14 Bedrock Q redacted/无效base64/Claude条件：`tests/canonical-bedrock.mjs:32–35` 固定占位、不校验、只查id含claude | `api/bedrock.md:90,115,117` | BR:852–861,1041–1075,1396–1402 同时看id/name并处理有效非空payload；Q decoder文本空（见 D07） | **已记**；改 canonical，同时改错误图谱 |
| C15 Bedrock Q Unicode/MIME：`tests/canonical-bedrock.mjs:3–6,21–35` 原文/原MIME | `api/bedrock.md:89,92,116,118` | BR:939–945,1358–1387；image/jpg→image/jpeg、base64比较字节；非法MIME/数据不能虚构成功 | **已记**；改 canonical |
| C16 Bedrock Q tool image/options：`tests/canonical-bedrock.mjs:16,39–45` 过滤图像、固定64、不走strict/其他options | `api/bedrock.md:102,119–120` | BR:965–966 有图片，decoder `decode_messages.rs:122–131` 漏读；strict/cache/metadata/reasoning已发未读各有边界 | **已记**；oracle与现有mock投影相符不代表协议完整；改实现候选W-07＋独立oracle候选W-06 |
| C17 Bedrock R redacted/default stop/未发元数据：`tests/canonical-bedrock-reply.mjs:2–18` 一律redacted占位、保留redacted=false，未投影deferred/success errorMessage/endTurn | `api/bedrock.md:61–62,72,122` | BR:655–690 空payload只建空thinking、不置redacted；encoder deferred→end_turn、未发源元数据 | **已记**；改fill，维持read/write/1h；已存在的投影不是允许删除可逆缓存 |
| C18 Mistral Q tools-only/图片：`tests/canonical-mistral.mjs:49–60` 丢图却合成System | 图谱 `:401,433–434`；旧规格 `api/bedrock-mistral.md:66–67` 缺条件 | decoder `decode_messages.rs:94–119` 丢图且不合成；两处都不是wire无字段 | **图谱已记、对应规格未记**；D13补规格，修decoder候选W-07，不把canonical删tools当修复 |
| C19 Mistral Q/R Unicode：`tests/canonical-mistral.mjs:25–55`、`tests/canonical-reply-additional.mjs:16–20` 无sanitize | 旧规格 `api/bedrock-mistral.md:64,75–76,91` 只谈顺序/累积；图谱 I24 `:347` 说删代理但A09.03仍E | MI:844–858 Q先trim后sanitize；MI:650–675,690–692 R先sanitize再跳空。源 `a\uD800b` 的canonical仍含坏代理，本轮只读探针确认 | **需补记到Mistral规则及对账表**；改 canonical；不把Rust无法表示坏代理当JS输入不存在 |
| C20 Mistral R stop：`tests/canonical-reply-additional.mjs:23` 仅处理error，aborted/deferred原值保留 | 图谱 `:405,437` 已列实际映射；`api/bedrock-mistral.md:75` 泛称其他→error，不说明源deferred经encoder变stop | `src/api/mistral_conversations/encode.rs:28–34` aborted→abort/deferred→stop；MI:936–951 abort→error（Provider stopped with: abort），deferred→stop | **对应规格/测试差异需补记**；当前规则写清再改oracle。未来改为显式拒绝属策略选择，不能本轮默认批准 |
| C21 PM Q options/sections：`tests/canonical-pi-messages.mjs:18,39` clone插入序、固定64/d-s1 | `api/pi-messages.md:75–77` | `src/model/message.rs:35` BTreeMap排序；PM:378–385白名单、cacheRetention实际发而mock不读，toolChoice对象JSON字符串化 | **已记**；deepEqual对象值不验证顺序，需专门序列/渲染断言；模型范围选择不是实验自动批准 |
| C22 oracle独立性/ignore：`tests/matrix-lib.mjs:46–54,67–68,85–89,106–107,139–149,164–165,186–189` 复制got并忽略total/cost/rawStop/ID等 | `api/openai-completions.md:158–159`；`api/anthropic-messages.md:180–181`；`api/family-variants.md:132,137`；`api/bedrock.md:124`；图谱 `:403–404` | SH:560–595、GG:232–250、BR:710–720 有独立total/rawStop/费率规则；GG/GV缺ID应结构断言，不能忽略所有content.id；AM responseModel按源model预测正确，不能一起否定 | **已记但根旧规格无系统对账**；改实验层；553PASS不能证明ignored字段 |
| C23 Responses R textSignature/无call toolUse：`tests/matrix-lib.mjs:110–126` 只补缺省签名、只stop→toolUse | `api/openai-responses.md:112,165`；家族 `:83,88` | `src/api/openai_responses/encode.rs:76–87` legacy→v1；SH:703签名总v1；completed无call→stop。测试却保legacy及无call的toolUse，本轮直接调用SH parser确认 | **需补“已有规则与oracle不符”的显式登记**；改fillResponses，W-06候选；不是新产品策略 |
| C24 回复未发字段清理不全：OCC `canonical-occ-reply.mjs:35` 原样push工具；Responses `matrix-lib.mjs:104–126` 保留responseModel/thoughtSignature/redacted；Google `:153–190` 保留responseModel/redacted/namespace；AM `:130–149` 不清text/tool签名 | 源能力已明确：`api/openai-completions.md:88,91,102`；`api/family-variants.md:84–85,94,104,111`；`api/anthropic-messages.md:112,116,133`；图谱 `:46,79,202` | 各encoder无这些源字段（OCC encode.rs:18–45；Responses encode.rs:11–74；Google encode.rs:54–78；AM encode.rs:19–46）；fill共同入口仅重写身份/去时间成本（matrix-lib:79–99），不会自动完成这些投影 | **字段能力已记，但oracle漏投影需显式补记**；按协议清理/断言，不可全局删除所有签名；本轮Responses保留错误源字段探针确认 |
| C25 AM unsupported/defaulterror；Google无call toolUse：`tests/matrix-lib.mjs:130–149,182–189` 前者只处理error、后者只stop→toolUse | `api/anthropic-messages.md:127–129,159`；`api/google-generative-ai.md:67,84`；家族 `:108` | AM encode.rs:98–115 unsupported三值→refusal/error；error缺/空文案→默认；Google STOP无call→stop（GG:224–228,272–297）；复制got.errorMessage还掩盖独立预测不足 | **规则已有、这组oracle缺口需补记**；W-06候选，不改converter迁就错误期望 |
| C26 已修部分不翻案：OCC details helper、Mistral保序/read、AM schema/responseModel、Google input/read、PM全量usage | `tests/canonical-occ-reasoning.mjs:2–29`；`canonical-mistral.mjs:39–46`；`canonical-reply-additional.mjs:1–29`；`matrix-lib.mjs:130–160` | 见 `api/openai-completions.md:156`、`api/bedrock-mistral.md:89–93`、`api/anthropic-messages.md:78,119,178–180`、`api/google-generative-ai.md:99–103`、`api/pi-messages.md:78`；与对应源限定域一致 | **这些裁决已反映、不得把原修复当当前回归**。本轮12测试通过仅支持其断言域，不抹掉C01–C25 |
| C27 AM R redacted文本：`tests/matrix-lib.mjs:130–149` 仅补缺省signature，不改源thinking文本 | `api/anthropic-messages.md:114,158` 已明确固定占位 | `src/api/anthropic_messages/encode.rs:24–27` 只发opaque data；AM:746–755 固定`[Reasoning redacted]`；fill保留任意源thinking不是实际投影 | **规则已记、oracle差异需补记**；改fillAnthropic，保留data签名，不可全局删thinking |
| C28 Responses R 默认错误文案：`tests/matrix-lib.mjs:117–120` 无条件模板拼原errorMessage | `api/family-variants.md:89` 记录encoder缺省unknown error；根 `api/openai-responses.md:127` 未写缺省/空串细分 | `src/api/openai_responses/encode.rs:109` 无值用unknown error；SH:749–754 再对空message用no message；canonical缺值会得到server_error: undefined、空串得到空后缀，均不等价 | **补根规则和oracle差异**；G14的错误规则需包含missing与empty，不从actual复制 |
| C29 OCC R 条件responseModel/重复工具ID：`tests/canonical-occ-reply.mjs:5–42` 不投影同目标responseModel，工具块原样push | `api/openai-completions.md:89,100` 明确相同/空model不设responseModel、重复ID可合并；图谱主类缺前提见D02 | OCC:499–555,565–566；源responseModel等目标时会消失；相同id的新index可能命中旧工具块，不能逐源块直接保留。fill当前没有对应规则 | **既有字段契约已记、oracle差异需补记**；W-06候选；模型身份P与responseModel D分开处理 |

### 4.1 18 个外域签名：边界不是“改 oracle 让它绿”

当前 Rust 与 `canonicalOresThinking` 都拒绝 opaque 签名；请求 converter 仅 JSON.parse，没有 type 校验；回复 parser 的 signature 恒 item JSON。三件事必须分开（SH:265–267,688–693；`src/api/openai_responses/encode.rs:17–30`；`tests/canonical-ores.mjs:199–206`）。`api/openai-responses.md:186–190` 与 `final-ledger.md:113` 已承认新投影须另批；图谱 `:351–361,419,431` 只证明存在合法 summary-item 目标形状，没有表示策略已批准。**保持18 FAIL；若另批降级，encoder与独立canonical同步改、记录源签名损失、redacted不得伪造可见summary。** 这是W-06/07候选中的待批策略，不可在冻结定义里写成既成事实。

## 5. 81 fail 与冻结前必修项

81项按完整 `(api,dir,name)`、顺序及机制机械核对，ledger第3节与图谱D1、当前JSON完全闭合（`final-ledger.md:30–110`；`irreversibility-atlas.md:471–551`）。对应规格机制：O→`api/openai-responses.md:186–190`、Azure→`api/family-variants.md:84,135`；T→`api/family-variants.md:156–157`。附录 B 保留每条主键及双方行号，新增“无解释”finding **0**。O的actual/expected为null是oracle异常记录，不是完成了内容比较（`tests/matrix-lib.mjs:62–73`）；T尚无capture，63项内容未验证（CX:208–231,377–385；`src/mounts/routing.rs:16–22`）。

**初审冻结前必修清单（本次已实施，当前逐项勾销见第1.0/7节）：**

1. 修正 D02–D08、D15 的分类/条件及重建规则；统一 D16 的输入拒绝/transport观察点；将 D14 的E域限定清楚。否则同字段在不同文档仍有不同终态。
2. 将 D01 的三份旧规格补成实际统一结构，逐项迁入/补齐 G01–G36；Codex补G37；完成 D09–D14、D17–D20 的正文规则纠错。不能仅加一个标题并声称完整。
3. 处理 R01–R06 的旧finding/交叉引用/权威页/历史快照身份；在对应规格记清 C05–C11、C18–C20、C23–C25、C27–C29 尚存oracle差异，保证“文档已反映”真实成立。
4. 冻结后的实现/实验 backlog 可以保留 C01–C25、C27–C29 已明确定义的偏差，以及 zstd、工具图片、Codex endTurn、PM模型顺序/字段等已声明缺口（图谱 `:431–437,453–455`）；前提是条目有明确现状、目标域、验收和策略批准状态。**不要求本次把81改成0，也不批准把有损降级当无损。**

初审因此不满足“差异为零或全部可归入W-06/07”的冻结条件：D/G/R中仍有必须先改文档的契约矛盾，不是单纯剩余实验。独立 reviewer gate 仍须执行；本文不自批准（既有纪律 `final-ledger.md:155`；`irreversibility-atlas.md:594`）。

## 6. 本轮验证（不是引用历史执行冒充本轮）

| 实际命令/检查 | 结果 | 能证明 / 不能证明 |
|---|---|---|
| `git status --short` | exit128，not a git repository | 根目录无Git元数据；未执行add/stage/commit；不能声称成功读取Git index。发现`.working-stack/.git`不等于项目根有Git仓库 |
| Python只读目录/标题/atlas计数 | PASS：8规格、5份编号六节、3份旧结构；A233/E9/D127/L64/P30/T3 | 结构计数；不替代源码语义裁决 |
| Python ledger/atlas/JSON逐主键断言 | PASS：634唯一case，553/81；81/81同顺序主键、O18/T63 | 当前JSON SHA256=`a4583609824bae6c9c884196fe8f636eea444101860a7e833525dea632b1443f`；时间2000-01-01→00:00:00；不是本轮重跑 |
| `node --test tests/canonical-ten.test.mjs tests/canonical-reply-projections.test.mjs` | PASS：12 tests / 12 pass / 0 fail | 现有纯canonical单测；不启动服务、不写矩阵；不证明完整协议等价 |
| `node --input-type=module` 只读内存探针 | PASS：7/7“差异存在性”断言 | 内存暴露现有私有providerFill；SH真实parser证明无call ToolUse→stop、legacy→v1；oracle保留错误元数据、Google首text签名残留、Mistral aborted/deferred未投影及Q坏代理未清洗均复现。未改源/测试、未持久化探针，非7项等价通过 |
| `node --input-type=module` 补充只读源探针 | PASS：3/3 | GS raw STOP/MAX_TOKENS→成功/length；SH回放reasoning-item不净化内部坏代理；OR maxTokens=0不发、truthy reasoningSummary回退medium。OR在onPayload抛错中止，未联网、未写文件 |
| 静态源码裁决 | 完成，证据逐项在D/C/G表 | 新发现/边界多为静态证据；未跑公网provider、WS、ADC、CLI、故障网络或全枚举SDK端到端 |

未新增/更新测试 **0**；没有运行全量duality/fuzz、cargo build/test，也没有用 ledger 既有109/1600/15的数字作为本轮结果（历史数字见 `final-ledger.md:137–141`）。报告按“初始范围→确认冲突→全量对账/结论→结束哈希”增量写入，限时30分钟内完成。初次仓库探测的组合命令因git exit128提前停止；后续分开读取；一次探测不存在的`tests/paths.mjs`报错，另一次不存在的TS根下Rust路径探测无输出，未影响其余读取。报告附录生成器首次因Python f-string反斜杠语法错误退出，未写文件；拆分改正后两次生成均成功。保留这些失败，不包装成全程命令无误。

### 6.1 收尾复验与改动证明

- Python断言通过：D20/R6/G37/C29编号唯一；附录A233行，主类159同/7分/67缺；D127=90有第4节索引+37缺列；81失败在ledger/图谱/JSON/本文四方逐主键同序相等。
- Markdown所有表格列数一致；共1197处显式TS别名/文件行号引用通过存在性及范围检查。这只保证引用存在，不替代第2–4节的语义裁决；R01–R03已专门防止“旧行号仍在范围内但引错内容”。
- 输入文档（排除本文）检索W-06/W-07无命中；本报告不声称这些工作项范围已获批准。当前根目录无Git index；无add/stage/commit动作，no-staged-files仅表示本轮未暂存，并非伪造Git审计通过。
- 收尾时距开始哈希记录约22.4分钟，未达30分钟硬限；只读树逐文件摘要与开始严格相等：

| 受保护树 | 文件数 | 结束SHA256 | 结论 |
|---|---:|---|---|
| `docs/design/mock-llm-server` | 24 | `08aabdbc63ba3f0889a7bee6a563047acce568b55544a5cf96339891c0465bfd` | 与开始相同 |
| `tests` | 37 | `531a832c80d466e8b88ee66c64a7b85b9fe0fc73d0ad3385720b76b9e493ac89` | 与开始相同 |
| `src` | 87 | `a36b52c0a90c5d4f79b1a768feccfbbc94ac72ee77eab8a18ab4d011b1357659` | 与开始相同 |
| `<pi-mono>/packages/ai/src` | 243 | `b5ff86777c0c1fd15280ab0cee1f4cbe7828922e9be717ce85fed9976af7bab0` | 与开始相同 |

**changed-files：仅 `docs/design/mock-llm-server/definition-freeze.md`；tests-added/updated：[]。** 没有实现任何建议。Git暂存区不可独立查询、静态新向量未持久化、全量矩阵/CLI/ADC/WS未复跑；这是本次分析边界，不是对残余缺陷的豁免。required reviewer gate：待独立审阅，不由本文自批准。


## 附录 A. 233 个图谱行的规格与第4节规则索引

分类结果码：**同**＝在各自声明条件内无主类冲突（不代表执行通过）；**分**＝需改判/拆条件；**缺**＝旧页没有显式五分类，禁止计作一致。对于混合字段行，D允许涵盖已明确的变换，但E/P/L条件必须逐字段保留；不能用一行聚合D吞掉本地随机/时间注入。主类“同”的额外算法差异仍以D/C表优先。A02/A06/A09均为“缺”，并不表示其全部叙述错误；G登记其D项的汇编缺口。

| 图谱条目 / 行号 | 字段方向（原分组） | 主类 | 规格位置 | 类别结果 | 第4节D规则 / 缺口 |
|---|---|---|---|---|---|
| A01.01 / `irreversibility-atlas.md:35` | Q system.content/sections/toolsRemoved | D | `api/openai-completions.md:33–35` | 同 | `api/openai-completions.md:113,121` |
| A01.02 / `irreversibility-atlas.md:36` | Q user.text/image | D | `api/openai-completions.md:36–38` | 同 | `api/openai-completions.md:114,118,120` |
| A01.03 / `irreversibility-atlas.md:37` | Q assistant.text/block order | D | `api/openai-completions.md:41,45` | 同 | `api/openai-completions.md:118,120` |
| A01.04 / `irreversibility-atlas.md:38` | Q thinking/签名 | D | `api/openai-completions.md:42–45` | 同 | `api/openai-completions.md:115,119–120` |
| A01.05 / `irreversibility-atlas.md:39` | Q toolCall.id/name/arguments | D | `api/openai-completions.md:46–48` | 同 | `api/openai-completions.md:117,121` |
| A01.06 / `irreversibility-atlas.md:40` | Q toolResult.content/images | D | `api/openai-completions.md:50–51` | 同 | `api/openai-completions.md:118,120` |
| A01.07 / `irreversibility-atlas.md:41` | Q toolResult.isError/toolName | L | `api/openai-completions.md:52` | 同 | — |
| A01.08 / `irreversibility-atlas.md:42` | Q options/tools | D | `api/openai-completions.md:62–72` | 同 | `api/openai-completions.md:121–124` |
| A01.09 / `irreversibility-atlas.md:43` | R text/thinking boundaries | D | `api/openai-completions.md:83,85,92` | 同 | `api/openai-completions.md:125` |
| A01.10 / `irreversibility-atlas.md:44` | R thinkingSignature | D | `api/openai-completions.md:85–87` | 同 | `api/openai-completions.md:125` |
| A01.11 / `irreversibility-atlas.md:45` | R toolCall.id/name/arguments | E | `api/openai-completions.md:89` | 分；D02 | — |
| A01.12 / `irreversibility-atlas.md:46` | R textSignature/thoughtSignature/namespace/redacted | L | `api/openai-completions.md:84,88,91` | 同 | — |
| A01.13 / `irreversibility-atlas.md:47` | R usage.input/output/read/write/reasoning | D | `api/openai-completions.md:96–97` | 同 | `api/openai-completions.md:126` |
| A01.14 / `irreversibility-atlas.md:48` | R usage.cacheWrite1h | L | `api/openai-completions.md:97` | 同 | — |
| A01.15 / `irreversibility-atlas.md:49` | R usage.totalTokens | D | `api/openai-completions.md:98` | 同 | `api/openai-completions.md:126` |
| A01.16 / `irreversibility-atlas.md:50` | R responseId/responseModel | D | `api/openai-completions.md:99–100` | 同 | `api/openai-completions.md:126` |
| A01.17 / `irreversibility-atlas.md:51` | R stopReason/errorMessage | D | `api/openai-completions.md:93–95` | 同 | `api/openai-completions.md:127` |
| A01.18 / `irreversibility-atlas.md:52` | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | L | `api/openai-completions.md:54` | 同 | — |
| A01.19 / `irreversibility-atlas.md:53` | Q 历史timestamp/durationMs | L | `api/openai-completions.md:54` | 同 | — |
| A01.20 / `irreversibility-atlas.md:54` | R api/provider/model 身份 | P | `api/openai-completions.md:101` | 同 | — |
| A01.21 / `irreversibility-atlas.md:55` | R timestamp/durationMs | P | `api/openai-completions.md:101` | 同 | — |
| A01.22 / `irreversibility-atlas.md:56` | R usage.cost | P | `api/openai-completions.md:98` | 同 | — |
| A01.23 / `irreversibility-atlas.md:57` | R rawStopReason | D | `api/openai-completions.md:93–94,102` | 同 | `api/openai-completions.md:127` |
| A01.24 / `irreversibility-atlas.md:58` | R thinkingLevel/providerThinkingLevel | L | `api/openai-completions.md:102` | 同 | — |
| A01.25 / `irreversibility-atlas.md:59` | Q 历史assistant.api/provider/model来源 | L | `api/openai-completions.md:54` | 同 | — |
| A01.26 / `irreversibility-atlas.md:60` | Q 未单列的textSignature/tool thoughtSignature/namespace | L | `api/openai-completions.md:37,41,47,50` | 同 | — |
| A02.01 / `irreversibility-atlas.md:66` | Q system/sections/tool history | D | `api/openai-responses.md:67–68,94` | 缺 | G01 |
| A02.02 / `irreversibility-atlas.md:67` | Q user.text/image/empty | D | `api/openai-responses.md:46–48,79` | 缺 | G02 |
| A02.03 / `irreversibility-atlas.md:68` | Q thinking/thinkingSignature | D | `api/openai-responses.md:49,78,88–89` | 缺；D19 | G03 |
| A02.04 / `irreversibility-atlas.md:69` | Q assistant.text/textSignature | D | `api/openai-responses.md:50,78,90` | 缺 | G04 |
| A02.05 / `irreversibility-atlas.md:70` | Q toolCall.id/namespace/args | D | `api/openai-responses.md:51,74,78,91` | 缺 | G05 |
| A02.06 / `irreversibility-atlas.md:71` | Q toolResult.content/id/name | D | `api/openai-responses.md:53–57,80,92` | 缺 | G06 |
| A02.07 / `irreversibility-atlas.md:72` | Q toolResult.isError | L | `api/openai-responses.md:53,92` | 缺 | — |
| A02.08 / `irreversibility-atlas.md:73` | Q tools/schema/options/session | D | `api/openai-responses.md:29–37,81–82,140–145` | 缺；D20 | G07 |
| A02.09 / `irreversibility-atlas.md:74` | R text/thinking/empty blocks | D | `api/openai-responses.md:111–115` | 缺 | G08 |
| A02.10 / `irreversibility-atlas.md:75` | R thinkingSignature（reasoning JSON域） | D | `api/openai-responses.md:111,186` | 缺 | G09 |
| A02.11 / `irreversibility-atlas.md:76` | R opaque signature（当前策略） | D | `api/openai-responses.md:186–188` | 缺 | G10 |
| A02.12 / `irreversibility-atlas.md:77` | R toolCall.id/namespace/args | D | `api/openai-responses.md:113` | 缺 | G11 |
| A02.13 / `irreversibility-atlas.md:78` | R usage.input/output/read/write/reasoning/total | D | `api/openai-responses.md:122–124` | 缺 | G12 |
| A02.14 / `irreversibility-atlas.md:79` | R usage.cacheWrite1h/responseModel/tool thoughtSignature/redacted | L | `api/openai-responses.md:111–130,190（仅1h显式；其余未列全）` | 缺 | — |
| A02.15 / `irreversibility-atlas.md:80` | R responseId | D | `api/openai-responses.md:121` | 缺 | G13 |
| A02.16 / `irreversibility-atlas.md:81` | R stopReason/errorMessage | D | `api/openai-responses.md:125–128,165` | 缺 | G14 |
| A02.17 / `irreversibility-atlas.md:82` | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | L | `api/openai-responses.md:59,156` | 缺 | — |
| A02.18 / `irreversibility-atlas.md:83` | Q 历史timestamp/durationMs | L | `api/openai-responses.md:59,156` | 缺 | — |
| A02.19 / `irreversibility-atlas.md:84` | R api/provider/model 身份 | P | `api/openai-responses.md:99–130（未显式列P）` | 缺 | — |
| A02.20 / `irreversibility-atlas.md:85` | R timestamp/durationMs | P | `api/openai-responses.md:99–130（未显式列P）` | 缺 | — |
| A02.21 / `irreversibility-atlas.md:86` | R usage.cost | P | `api/openai-responses.md:130` | 缺 | — |
| A02.22 / `irreversibility-atlas.md:87` | R rawStopReason | D | `api/openai-responses.md:117–130（未独立列rawStop）` | 缺 | G15 |
| A02.23 / `irreversibility-atlas.md:88` | R thinkingLevel/providerThinkingLevel | L | `api/openai-responses.md:99–130（未列levels）` | 缺 | — |
| A02.24 / `irreversibility-atlas.md:89` | Q 历史assistant.api/provider/model来源 | L | `api/openai-responses.md:59,169` | 缺 | — |
| A03.01 / `irreversibility-atlas.md:95` | Q model | D | `api/family-variants.md:49` | 同 | `api/family-variants.md:126,129` |
| A03.02 / `irreversibility-atlas.md:96` | Q system/user/text/thinking/toolCall/toolResult | D | `api/family-variants.md:25–42` | 同 | `api/family-variants.md:120–125` |
| A03.03 / `irreversibility-atlas.md:97` | Q tools/maxTokens/temperature/reasoning | D | `api/family-variants.md:42,50–54` | 同 | `api/family-variants.md:125,129,131,134` |
| A03.04 / `irreversibility-atlas.md:98` | Q sessionId | D | `api/family-variants.md:11,53` | 同 | `api/family-variants.md:129（回引§2.3）` |
| A03.05 / `irreversibility-atlas.md:99` | R content/signatures/ids/usage/stop | D | `api/family-variants.md:82–94` | 同 | `api/family-variants.md:135` |
| A03.06 / `irreversibility-atlas.md:100` | R opaque signature | D | `api/family-variants.md:84,135` | 同 | `api/family-variants.md:135` |
| A03.07 / `irreversibility-atlas.md:101` | R cacheWrite1h/responseModel/块独立redacted或thoughtSignature | L | `api/family-variants.md:84–87,94` | 同 | — |
| A03.08 / `irreversibility-atlas.md:102` | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | L | `api/family-variants.md:29` | 同 | — |
| A03.09 / `irreversibility-atlas.md:103` | Q 历史timestamp/durationMs | L | `api/family-variants.md:29` | 同 | — |
| A03.10 / `irreversibility-atlas.md:104` | R api/provider/model 身份 | P | `api/family-variants.md:93` | 同 | — |
| A03.11 / `irreversibility-atlas.md:105` | R timestamp/durationMs | P | `api/family-variants.md:93` | 同 | — |
| A03.12 / `irreversibility-atlas.md:106` | R usage.cost | P | `api/family-variants.md:87` | 同 | — |
| A03.13 / `irreversibility-atlas.md:107` | R rawStopReason | D | `api/family-variants.md:92` | 同 | `api/family-variants.md:135` |
| A03.14 / `irreversibility-atlas.md:108` | R thinkingLevel/providerThinkingLevel | L | `api/family-variants.md:94` | 同 | — |
| A03.15 / `irreversibility-atlas.md:109` | Q 历史assistant.api/provider/model来源 | L | `api/family-variants.md:43` | 同 | — |
| A03.16 / `irreversibility-atlas.md:110` | Q system/sections/tool history | D | `api/family-variants.md:25,35` | 同 | `api/family-variants.md:120` |
| A03.17 / `irreversibility-atlas.md:111` | Q user.text/image/empty | D | `api/family-variants.md:36` | 同 | `api/family-variants.md:121–122` |
| A03.18 / `irreversibility-atlas.md:112` | Q thinking/thinkingSignature | D | `api/family-variants.md:38` | 同 | `api/family-variants.md:123` |
| A03.19 / `irreversibility-atlas.md:113` | Q assistant.text/textSignature | D | `api/family-variants.md:37` | 同 | `api/family-variants.md:123` |
| A03.20 / `irreversibility-atlas.md:114` | Q toolCall.id/namespace/args | D | `api/family-variants.md:39–40` | 同 | `api/family-variants.md:123,133` |
| A03.21 / `irreversibility-atlas.md:115` | Q toolResult.content/id/name | D | `api/family-variants.md:41` | 同 | `api/family-variants.md:124` |
| A03.22 / `irreversibility-atlas.md:116` | Q toolResult.isError | L | `api/family-variants.md:41` | 同 | — |
| A03.23 / `irreversibility-atlas.md:117` | R text/thinking/empty blocks | D | `api/family-variants.md:82,84` | 同 | `api/family-variants.md:135` |
| A03.24 / `irreversibility-atlas.md:118` | R thinkingSignature（reasoning JSON域） | D | `api/family-variants.md:84` | 同 | `api/family-variants.md:135` |
| A03.25 / `irreversibility-atlas.md:119` | R toolCall.id/namespace/args | D | `api/family-variants.md:85` | 同 | `api/family-variants.md:135` |
| A03.26 / `irreversibility-atlas.md:120` | R usage.input/output/read/write/reasoning/total | D | `api/family-variants.md:86` | 同 | `api/family-variants.md:135` |
| A03.27 / `irreversibility-atlas.md:121` | R responseId | D | `api/family-variants.md:91` | 同 | `api/family-variants.md:135` |
| A03.28 / `irreversibility-atlas.md:122` | R stopReason/errorMessage | D | `api/family-variants.md:88–89` | 同 | `api/family-variants.md:135` |
| A04.01 / `irreversibility-atlas.md:128` | Q/R 实际执行链 | T | `api/family-variants.md:156` | 同 | — |
| A04.02 / `irreversibility-atlas.md:129` | Q model/system/instructions | D | `api/family-variants.md:35,49` | 同 | `api/family-variants.md:126` |
| A04.03 / `irreversibility-atlas.md:130` | Q user/assistant/thinking/toolCall/toolResult/tools | D | `api/family-variants.md:36–42` | 同 | `api/family-variants.md:120–125` |
| A04.04 / `irreversibility-atlas.md:131` | Q maxTokens | L | `api/family-variants.md:50` | 同 | — |
| A04.05 / `irreversibility-atlas.md:132` | Q toolChoice/session/temperature/effort | D | `api/family-variants.md:12,51–55` | 同；D17 | `api/family-variants.md:126,129,134` |
| A04.06 / `irreversibility-atlas.md:133` | Q WS previous_response_id/input | T | `api/family-variants.md:157` | 同 | — |
| A04.07 / `irreversibility-atlas.md:134` | R text/thinking/signatures/tools/usage | D | `api/family-variants.md:82–96` | 同 | `api/family-variants.md:135` |
| A04.08 / `irreversibility-atlas.md:135` | R endTurn | D | `api/family-variants.md:94` | 分；D04 | G37 |
| A04.09 / `irreversibility-atlas.md:136` | R cacheWrite1h/responseModel/独立块redacted/thoughtSignature | L | `api/family-variants.md:84–87,94` | 同 | — |
| A04.10 / `irreversibility-atlas.md:137` | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | L | `api/family-variants.md:29` | 同 | — |
| A04.11 / `irreversibility-atlas.md:138` | Q 历史timestamp/durationMs | L | `api/family-variants.md:29` | 同 | — |
| A04.12 / `irreversibility-atlas.md:139` | R api/provider/model 身份 | P | `api/family-variants.md:93` | 同 | — |
| A04.13 / `irreversibility-atlas.md:140` | R timestamp/durationMs | P | `api/family-variants.md:93` | 同 | — |
| A04.14 / `irreversibility-atlas.md:141` | R usage.cost | P | `api/family-variants.md:87` | 同 | — |
| A04.15 / `irreversibility-atlas.md:142` | R rawStopReason | D | `api/family-variants.md:92,96` | 同 | `api/family-variants.md:135` |
| A04.16 / `irreversibility-atlas.md:143` | R thinkingLevel/providerThinkingLevel | L | `api/family-variants.md:94` | 同 | — |
| A04.17 / `irreversibility-atlas.md:144` | Q 历史assistant.api/provider/model来源 | L | `api/family-variants.md:43` | 同 | — |
| A04.18 / `irreversibility-atlas.md:145` | Q user.text/image/empty | D | `api/family-variants.md:36` | 同 | `api/family-variants.md:121–122` |
| A04.19 / `irreversibility-atlas.md:146` | Q thinking/thinkingSignature | D | `api/family-variants.md:38` | 同 | `api/family-variants.md:123` |
| A04.20 / `irreversibility-atlas.md:147` | Q assistant.text/textSignature | D | `api/family-variants.md:37` | 同 | `api/family-variants.md:123` |
| A04.21 / `irreversibility-atlas.md:148` | Q toolCall.id/namespace/args | D | `api/family-variants.md:39–40` | 同 | `api/family-variants.md:123,133` |
| A04.22 / `irreversibility-atlas.md:149` | Q toolResult.content/id/name | D | `api/family-variants.md:41` | 同 | `api/family-variants.md:124` |
| A04.23 / `irreversibility-atlas.md:150` | Q toolResult.isError | L | `api/family-variants.md:41` | 同 | — |
| A04.24 / `irreversibility-atlas.md:151` | R text/thinking/empty blocks | D | `api/family-variants.md:82,84` | 同 | `api/family-variants.md:135` |
| A04.25 / `irreversibility-atlas.md:152` | R thinkingSignature（reasoning JSON域） | D | `api/family-variants.md:84` | 同 | `api/family-variants.md:135` |
| A04.26 / `irreversibility-atlas.md:153` | R toolCall.id/namespace/args | D | `api/family-variants.md:85` | 同 | `api/family-variants.md:135` |
| A04.27 / `irreversibility-atlas.md:154` | R usage.input/output/read/write/reasoning/total | D | `api/family-variants.md:86` | 同 | `api/family-variants.md:135` |
| A04.28 / `irreversibility-atlas.md:155` | R responseId | D | `api/family-variants.md:91` | 同 | `api/family-variants.md:135` |
| A04.29 / `irreversibility-atlas.md:156` | R stopReason/errorMessage（Codex事件先归一） | D | `api/family-variants.md:88–89,96` | 同 | `api/family-variants.md:135,137` |
| A05.01 / `irreversibility-atlas.md:162` | Q system/sections/toolsRemoved | D | `api/anthropic-messages.md:53–57` | 同 | `api/anthropic-messages.md:145,153` |
| A05.02 / `irreversibility-atlas.md:163` | Q user.text/image/empty | D | `api/anthropic-messages.md:58–60` | 同 | `api/anthropic-messages.md:146,149,152` |
| A05.03 / `irreversibility-atlas.md:164` | Q assistant.text/thinking/redacted | D | `api/anthropic-messages.md:62–65` | 同 | `api/anthropic-messages.md:147,149` |
| A05.04 / `irreversibility-atlas.md:165` | Q/R toolCall.id/name/args | D | `api/anthropic-messages.md:66–68,115` | 同 | `api/anthropic-messages.md:148,153,158` |
| A05.05 / `irreversibility-atlas.md:166` | Q toolResult.content/isError/name | D | `api/anthropic-messages.md:69–71` | 同 | `api/anthropic-messages.md:150–151` |
| A05.06 / `irreversibility-atlas.md:167` | Q tool.parameters 非strict | L | `api/anthropic-messages.md:78,154` | 分；D03 | — |
| A05.07 / `irreversibility-atlas.md:168` | Q tools strict/effort/max/temperature/session | D | `api/anthropic-messages.md:76,79,87–96` | 同 | `api/anthropic-messages.md:154–157` |
| A05.08 / `irreversibility-atlas.md:169` | R text/thinking/signature/empty | D | `api/anthropic-messages.md:110–114` | 同 | `api/anthropic-messages.md:158` |
| A05.09 / `irreversibility-atlas.md:170` | R redacted | D | `api/anthropic-messages.md:114` | 同 | `api/anthropic-messages.md:158` |
| A05.10 / `irreversibility-atlas.md:171` | R usage.input/output/read/write/1h/reasoning | D | `api/anthropic-messages.md:121–125` | 同 | `api/anthropic-messages.md:160` |
| A05.11 / `irreversibility-atlas.md:172` | R responseId/responseModel | D | `api/anthropic-messages.md:118–119` | 同 | `api/anthropic-messages.md:158` |
| A05.12 / `irreversibility-atlas.md:173` | R stopReason/errorMessage | D | `api/anthropic-messages.md:126–129` | 同 | `api/anthropic-messages.md:159` |
| A05.13 / `irreversibility-atlas.md:174` | R textSignature/thoughtSignature/namespace/endTurn | L | `api/anthropic-messages.md:112,116,133` | 同 | — |
| A05.14 / `irreversibility-atlas.md:175` | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | L | `api/anthropic-messages.md:75–76` | 同 | — |
| A05.15 / `irreversibility-atlas.md:176` | Q 历史timestamp/durationMs | L | `api/anthropic-messages.md:73` | 同 | — |
| A05.16 / `irreversibility-atlas.md:177` | R api/provider/model 身份 | P | `api/anthropic-messages.md:109,119–120` | 同 | — |
| A05.17 / `irreversibility-atlas.md:178` | R timestamp/durationMs | P | `api/anthropic-messages.md:131` | 同 | — |
| A05.18 / `irreversibility-atlas.md:179` | R usage.cost | P | `api/anthropic-messages.md:125` | 同 | — |
| A05.19 / `irreversibility-atlas.md:180` | R rawStopReason | D | `api/anthropic-messages.md:130` | 同 | `api/anthropic-messages.md:159` |
| A05.20 / `irreversibility-atlas.md:181` | R providerThinkingLevel | P | `api/anthropic-messages.md:132` | 同 | — |
| A05.21 / `irreversibility-atlas.md:182` | R thinkingLevel | L | `api/anthropic-messages.md:133` | 同 | — |
| A05.22 / `irreversibility-atlas.md:183` | Q 历史assistant.api/provider/model来源 | L | `api/anthropic-messages.md:74` | 同 | — |
| A05.23 / `irreversibility-atlas.md:184` | Q 未单列的textSignature/tool thoughtSignature/namespace | L | `api/anthropic-messages.md:63,68,73` | 同 | — |
| A06.01 / `irreversibility-atlas.md:190` | Q system/sections/tools | D | `api/google-generative-ai.md:19–20,40,53` | 缺 | G16 |
| A06.02 / `irreversibility-atlas.md:191` | Q user.text/image/empty | D | `api/google-generative-ai.md:21–22,49,51` | 缺 | G17 |
| A06.03 / `irreversibility-atlas.md:192` | Q text/thinking/tool thoughtSignature | D | `api/google-generative-ai.md:23–25,44–46` | 缺 | G18 |
| A06.04 / `irreversibility-atlas.md:193` | Q toolCall.id | D | `api/google-generative-ai.md:25,46` | 缺 | G19 |
| A06.05 / `irreversibility-atlas.md:194` | Q toolResult.content/isError/id | D | `api/google-generative-ai.md:26,47–48` | 缺 | G20 |
| A06.06 / `irreversibility-atlas.md:195` | Q options/toolChoice/reasoning/maxTokens | D | `api/google-generative-ai.md:27–32,54` | 缺 | G21 |
| A06.07 / `irreversibility-atlas.md:196` | Q sessionId/redacted | L | `api/google-generative-ai.md:33,44` | 缺 | — |
| A06.08 / `irreversibility-atlas.md:197` | R text/thinking/签名/块边界 | D | `api/google-generative-ai.md:63–64,68（未写合并/最后签名）` | 缺 | G22 |
| A06.09 / `irreversibility-atlas.md:198` | R toolCall.id/name/args/thoughtSignature | D | `api/google-generative-ai.md:25,65（无五分类列）` | 缺；D05 | G23 |
| A06.10 / `irreversibility-atlas.md:199` | R usage.input/read/output/reasoning/total | D | `api/google-generative-ai.md:66,99–103` | 缺 | G24 |
| A06.11 / `irreversibility-atlas.md:200` | R usage.cacheWrite/cacheWrite1h | L | `api/google-generative-ai.md:99,103` | 缺 | — |
| A06.12 / `irreversibility-atlas.md:201` | R responseId/stopReason/errorMessage | D | `api/google-generative-ai.md:62,67,69,73` | 缺；D18 | G25 |
| A06.13 / `irreversibility-atlas.md:202` | R responseModel/redacted/namespace | L | `api/google-generative-ai.md:70,84（未完整分Q/R）` | 缺 | — |
| A06.14 / `irreversibility-atlas.md:203` | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | L | `api/google-generative-ai.md:52` | 缺 | — |
| A06.15 / `irreversibility-atlas.md:204` | Q 历史timestamp/durationMs | L | `api/google-generative-ai.md:34,52` | 缺 | — |
| A06.16 / `irreversibility-atlas.md:205` | R api/provider/model 身份 | P | `api/google-generative-ai.md:70（未显式列P）` | 缺 | — |
| A06.17 / `irreversibility-atlas.md:206` | R timestamp/durationMs | P | `api/google-generative-ai.md:70（未显式列P）` | 缺 | — |
| A06.18 / `irreversibility-atlas.md:207` | R usage.cost | P | `api/google-generative-ai.md:66,84,99` | 缺 | — |
| A06.19 / `irreversibility-atlas.md:208` | R rawStopReason | D | `api/google-generative-ai.md:67,89（未独立列规则）` | 缺 | G26 |
| A06.20 / `irreversibility-atlas.md:209` | R thinkingLevel/providerThinkingLevel | L | `api/google-generative-ai.md:70` | 缺 | — |
| A06.21 / `irreversibility-atlas.md:210` | Q 历史assistant.api/provider/model来源 | L | `api/google-generative-ai.md:52` | 缺 | — |
| A07.01 / `irreversibility-atlas.md:216` | Q/R ADC认证前置 | T | `api/family-variants.md:13,15,159` | 同 | — |
| A07.02 / `irreversibility-atlas.md:217` | Q model/system/user/assistant/toolResult/签名/schema | D | `api/family-variants.md:64–74` | 同 | `api/family-variants.md:120–122,125,127–131` |
| A07.03 / `irreversibility-atlas.md:218` | Q options/session/redacted | D | `api/family-variants.md:70–73` | 同 | `api/family-variants.md:129–130` |
| A07.04 / `irreversibility-atlas.md:219` | R text/thinking/tools/signatures/id/stop | D | `api/family-variants.md:102–105,108` | 分；D05 | `api/family-variants.md:136,138` |
| A07.05 / `irreversibility-atlas.md:220` | R usage.input/read/output/reasoning/total | D | `api/family-variants.md:106` | 同 | `api/family-variants.md:136` |
| A07.06 / `irreversibility-atlas.md:221` | R usage.cacheWrite/1h/responseModel/redacted/namespace | L | `api/family-variants.md:107,111` | 分；D06 | — |
| A07.07 / `irreversibility-atlas.md:222` | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | L | `api/family-variants.md:29` | 同 | — |
| A07.08 / `irreversibility-atlas.md:223` | Q 历史timestamp/durationMs | L | `api/family-variants.md:29` | 同 | — |
| A07.09 / `irreversibility-atlas.md:224` | R api/provider/model 身份 | P | `api/family-variants.md:110` | 同 | — |
| A07.10 / `irreversibility-atlas.md:225` | R timestamp/durationMs | P | `api/family-variants.md:110` | 同 | — |
| A07.11 / `irreversibility-atlas.md:226` | R usage.cost | P | `api/family-variants.md:107` | 同 | — |
| A07.12 / `irreversibility-atlas.md:227` | R rawStopReason | D | `api/family-variants.md:108` | 同 | `api/family-variants.md:138` |
| A07.13 / `irreversibility-atlas.md:228` | R thinkingLevel/providerThinkingLevel | L | `api/family-variants.md:111` | 同 | — |
| A07.14 / `irreversibility-atlas.md:229` | Q 历史assistant.api/provider/model来源 | L | `api/family-variants.md:74` | 同 | — |
| A07.15 / `irreversibility-atlas.md:230` | Q system/sections/tools | D | `api/family-variants.md:64` | 同 | `api/family-variants.md:120` |
| A07.16 / `irreversibility-atlas.md:231` | Q user.text/image/empty | D | `api/family-variants.md:65` | 同 | `api/family-variants.md:121–122` |
| A07.17 / `irreversibility-atlas.md:232` | Q text/thinking/tool thoughtSignature | D | `api/family-variants.md:66–67` | 同 | `api/family-variants.md:127` |
| A07.18 / `irreversibility-atlas.md:233` | Q toolCall.id | D | `api/family-variants.md:67` | 同 | `api/family-variants.md:128` |
| A07.19 / `irreversibility-atlas.md:234` | Q toolResult.content/isError/id | D | `api/family-variants.md:68` | 同 | `api/family-variants.md:128` |
| A07.20 / `irreversibility-atlas.md:235` | Q options/toolChoice/reasoning/maxTokens | D | `api/family-variants.md:70–72` | 同 | `api/family-variants.md:129–130` |
| A07.21 / `irreversibility-atlas.md:236` | Q sessionId/redacted | L | `api/family-variants.md:73,66` | 同 | — |
| A07.22 / `irreversibility-atlas.md:237` | R text/thinking/签名/块边界 | D | `api/family-variants.md:102–103` | 同 | `api/family-variants.md:136` |
| A07.23 / `irreversibility-atlas.md:238` | R toolCall.id/name/args/thoughtSignature | D | `api/family-variants.md:105` | 分；D05 | `api/family-variants.md:136` |
| A07.24 / `irreversibility-atlas.md:239` | R responseId/stopReason/errorMessage | D | `api/family-variants.md:108–109` | 同；D18 | `api/family-variants.md:136,138` |
| A07.25 / `irreversibility-atlas.md:240` | R responseModel/redacted/namespace | L | `api/family-variants.md:104,111` | 同 | — |
| A08.01 / `irreversibility-atlas.md:246` | Q system/sections/tools | D | `api/bedrock.md:24–27` | 同 | `api/bedrock.md:86,93` |
| A08.02 / `irreversibility-atlas.md:247` | Q user.text/image/empty | D | `api/bedrock.md:28–29` | 同 | `api/bedrock.md:87,89,92` |
| A08.03 / `irreversibility-atlas.md:248` | Q assistant.text/thinking/signature/redacted | D | `api/bedrock.md:31–34` | 同；D07 | `api/bedrock.md:90` |
| A08.04 / `irreversibility-atlas.md:249` | Q toolCall.id/args | D | `api/bedrock.md:35–36` | 同 | `api/bedrock.md:87,91` |
| A08.05 / `irreversibility-atlas.md:250` | Q toolResult.text/isError/id | D | `api/bedrock.md:38–39,41` | 同 | `api/bedrock.md:91` |
| A08.06 / `irreversibility-atlas.md:251` | Q toolResult.image | D | `api/bedrock.md:40` | 同 | `api/bedrock.md:102` |
| A08.07 / `irreversibility-atlas.md:252` | Q max/temperature/toolChoice/reasoning | D | `api/bedrock.md:43–45` | 同；D08 | `api/bedrock.md:94,96–100` |
| A08.08 / `irreversibility-atlas.md:253` | R text/thinking/signature/redacted/toolCall | D | `api/bedrock.md:59–64` | 同 | `api/bedrock.md:103–104` |
| A08.09 / `irreversibility-atlas.md:254` | R usage.input/output/read/write/1h/total | D | `api/bedrock.md:65–67` | 同 | `api/bedrock.md:106` |
| A08.10 / `irreversibility-atlas.md:255` | R usage.reasoning/responseId/responseModel | L | `api/bedrock.md:68,74` | 同 | — |
| A08.11 / `irreversibility-atlas.md:256` | R stopReason/errorMessage | D | `api/bedrock.md:70–73` | 同 | `api/bedrock.md:105` |
| A08.12 / `irreversibility-atlas.md:257` | R textSignature/tool thoughtSignature/namespace | L | `api/bedrock.md:60,64` | 同 | — |
| A08.13 / `irreversibility-atlas.md:258` | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | L | `api/bedrock.md:42` | 同 | — |
| A08.14 / `irreversibility-atlas.md:259` | Q 历史timestamp/durationMs | L | `api/bedrock.md:42` | 同 | — |
| A08.15 / `irreversibility-atlas.md:260` | R api/provider/model 身份 | P | `api/bedrock.md:58` | 同 | — |
| A08.16 / `irreversibility-atlas.md:261` | R timestamp/durationMs | P | `api/bedrock.md:76` | 同 | — |
| A08.17 / `irreversibility-atlas.md:262` | R usage.cost | P | `api/bedrock.md:69` | 同 | — |
| A08.18 / `irreversibility-atlas.md:263` | R rawStopReason | D | `api/bedrock.md:73` | 同 | `api/bedrock.md:105` |
| A08.19 / `irreversibility-atlas.md:264` | R thinkingLevel/providerThinkingLevel | L | `api/bedrock.md:75` | 同 | — |
| A08.20 / `irreversibility-atlas.md:265` | Q 历史assistant.api/provider/model来源 | L | `api/bedrock.md:42` | 同 | — |
| A08.21 / `irreversibility-atlas.md:266` | Q 未单列的textSignature/tool thoughtSignature/namespace | L | `api/bedrock.md:31,37,41` | 同 | — |
| A09.01 / `irreversibility-atlas.md:272` | Q system/sections/tools | D | `api/bedrock-mistral.md:61,67（未列tools-only缺口）` | 缺 | G27 |
| A09.02 / `irreversibility-atlas.md:273` | Q user.text/image | D | `api/bedrock-mistral.md:62–63` | 缺 | G28 |
| A09.03 / `irreversibility-atlas.md:274` | Q assistant.text/thinking | E | `api/bedrock-mistral.md:64,91（过滤/净化域不全）` | 缺；D14 | — |
| A09.04 / `irreversibility-atlas.md:275` | Q toolCall.id/name/arguments | D | `api/bedrock-mistral.md:56,65` | 缺 | G29 |
| A09.05 / `irreversibility-atlas.md:276` | Q toolResult.text/images/isError | D | `api/bedrock-mistral.md:66（未列图像缺口）` | 缺 | G30 |
| A09.06 / `irreversibility-atlas.md:277` | Q/R textSignature/thinkingSignature/redacted/tool thoughtSignature/namespace | L | `api/bedrock-mistral.md:64,75,89（签名部分）` | 缺 | — |
| A09.07 / `irreversibility-atlas.md:278` | Q options/session | D | `api/bedrock-mistral.md:68–70` | 缺 | G31 |
| A09.08 / `irreversibility-atlas.md:279` | R text/thinking/empty | D | `api/bedrock-mistral.md:75–76` | 缺 | G32 |
| A09.09 / `irreversibility-atlas.md:280` | R toolCall.id/name/args | D | `api/bedrock-mistral.md:75（未列缺ID算法）` | 缺 | G33 |
| A09.10 / `irreversibility-atlas.md:281` | R usage.input/output/read/total | D | `api/bedrock-mistral.md:75,89` | 缺 | G34 |
| A09.11 / `irreversibility-atlas.md:282` | R usage.cacheWrite/1h/reasoning | L | `api/bedrock-mistral.md:89,93` | 缺 | — |
| A09.12 / `irreversibility-atlas.md:283` | R responseId/stop/error | D | `api/bedrock-mistral.md:75–76` | 缺 | G35 |
| A09.13 / `irreversibility-atlas.md:284` | Q 历史usage/stop/responseId/responseModel/错误/运行时元数据 | L | `api/bedrock-mistral.md:58–70（未列历史全集）` | 缺 | — |
| A09.14 / `irreversibility-atlas.md:285` | Q 历史timestamp/durationMs | L | `api/bedrock-mistral.md:58–70（未列时间）` | 缺 | — |
| A09.15 / `irreversibility-atlas.md:286` | R api/provider/model 身份 | P | `api/bedrock-mistral.md:72–76（未列P）` | 缺 | — |
| A09.16 / `irreversibility-atlas.md:287` | R timestamp/durationMs | P | `api/bedrock-mistral.md:72–76（未列时间P）` | 缺 | — |
| A09.17 / `irreversibility-atlas.md:288` | R usage.cost | P | `api/bedrock-mistral.md:72–76（未列费率P）` | 缺 | — |
| A09.18 / `irreversibility-atlas.md:289` | R rawStopReason | D | `api/bedrock-mistral.md:75（未独立列rawStop）` | 缺 | G36 |
| A09.19 / `irreversibility-atlas.md:290` | R thinkingLevel/providerThinkingLevel | L | `api/bedrock-mistral.md:72–76（未列levels）` | 缺 | — |
| A09.20 / `irreversibility-atlas.md:291` | Q 历史assistant.api/provider/model来源 | L | `api/bedrock-mistral.md:58–70（未列历史身份）` | 缺 | — |
| A09.21 / `irreversibility-atlas.md:292` | Q 未单列的textSignature/tool thoughtSignature/namespace | L | `api/bedrock-mistral.md:58–70（未列text/tool签名）` | 缺 | — |
| A09.22 / `irreversibility-atlas.md:293` | R responseModel/endTurn | L | `api/bedrock-mistral.md:72–76（未列responseModel/endTurn）` | 缺 | — |
| A10.01 / `irreversibility-atlas.md:299` | Q model/context/messages/order | E | `api/pi-messages.md:22–23` | 同 | — |
| A10.02 / `irreversibility-atlas.md:300` | Q text/image/thinking/signatures/redacted/toolCall/namespace | E | `api/pi-messages.md:24,28–29,34,36` | 同 | — |
| A10.03 / `irreversibility-atlas.md:301` | Q timestamp/durationMs/usage/cost/历史响应元数据 | E | `api/pi-messages.md:27,30–32` | 同 | — |
| A10.04 / `irreversibility-atlas.md:302` | Q system.sections键值/工具增删 | E | `api/pi-messages.md:25–26` | 同 | — |
| A10.05 / `irreversibility-atlas.md:303` | Q sections插入顺序 | D | `api/pi-messages.md:25,75` | 同 | `api/pi-messages.md:75` |
| A10.06 / `irreversibility-atlas.md:304` | Q diagnostics/deferred/tool.details/usage/nestedCalls | D | `api/pi-messages.md:33,35,77` | 同 | `api/pi-messages.md:74,77` |
| A10.07 / `irreversibility-atlas.md:305` | Q options | D | `api/pi-messages.md:37–39,76` | 同 | `api/pi-messages.md:76` |
| A10.08 / `irreversibility-atlas.md:306` | R content/text/thinking/signatures/redacted/toolCall/namespace/empty | E | `api/pi-messages.md:48–52` | 同 | — |
| A10.09 / `irreversibility-atlas.md:307` | R usage/cost/total/read/write/1h/reasoning | E | `api/pi-messages.md:53` | 同 | — |
| A10.10 / `irreversibility-atlas.md:308` | R responseId/providerThinkingLevel | E | `api/pi-messages.md:57` | 同 | — |
| A10.11 / `irreversibility-atlas.md:309` | R stopReason/errorMessage | D | `api/pi-messages.md:54–56,62` | 分；D15 | `api/pi-messages.md:78,80` |
| A10.12 / `irreversibility-atlas.md:310` | R responseModel/thinkingLevel/rawStopReason/endTurn | L | `api/pi-messages.md:60` | 同 | — |
| A10.13 / `irreversibility-atlas.md:311` | R api/provider/model 身份 | P | `api/pi-messages.md:58` | 同 | — |
| A10.14 / `irreversibility-atlas.md:312` | R timestamp/durationMs | P | `api/pi-messages.md:59` | 同 | — |

## 附录 B. 81 fail 的逐主键覆盖

下表的 O/T 是 ledger 机制标签，不是把O新增为第六终态。每条源码机制引用统一为：O＝SH:265–267,688–693 / `src/api/openai_responses/encode.rs:17–30` / `tests/canonical-ores.mjs:199–206`；T＝CX:208–231,377–385 / `src/mounts/routing.rs:16–22`。两机制的观察阶段分别见 `tests/matrix-lib.mjs:62–73` 和 `irreversibility-atlas.md:465–467`，不将重复同根因计作81个新缺陷。

| # | API / direction / case | ledger位置 | 图谱位置 | 规格机制 / 覆盖 |
|---|---|---|---|---|
| 1 | `openai-responses / reply / reply-corpus-kahuwo-2` | `final-ledger.md:28` | `irreversibility-atlas.md:471` | O / `api/openai-responses.md:186–190` / 有对应 |
| 2 | `openai-responses / reply / reply-corpus-claude2-2` | `final-ledger.md:29` | `irreversibility-atlas.md:472` | O / `api/openai-responses.md:186–190` / 有对应 |
| 3 | `openai-responses / reply / reply-corpus-b4-claude-reason-2` | `final-ledger.md:30` | `irreversibility-atlas.md:473` | O / `api/openai-responses.md:186–190` / 有对应 |
| 4 | `openai-responses / reply / reply-corpus-b4-deepseek-mixed-2` | `final-ledger.md:31` | `irreversibility-atlas.md:474` | O / `api/openai-responses.md:186–190` / 有对应 |
| 5 | `openai-responses / reply / reply-corpus-b4-deepseek-codegen-2` | `final-ledger.md:32` | `irreversibility-atlas.md:475` | O / `api/openai-responses.md:186–190` / 有对应 |
| 6 | `openai-responses / reply / reply-corpus-b4-deepseek-longreason-2` | `final-ledger.md:33` | `irreversibility-atlas.md:476` | O / `api/openai-responses.md:186–190` / 有对应 |
| 7 | `openai-responses / reply / reply-corpus-b4-kimi-reason-2` | `final-ledger.md:34` | `irreversibility-atlas.md:477` | O / `api/openai-responses.md:186–190` / 有对应 |
| 8 | `openai-responses / reply / reply-corpus-b4-kimi-toolerr-2` | `final-ledger.md:35` | `irreversibility-atlas.md:478` | O / `api/openai-responses.md:186–190` / 有对应 |
| 9 | `openai-responses / reply / reply-corpus-b4-glm53-mixed-2` | `final-ledger.md:36` | `irreversibility-atlas.md:479` | O / `api/openai-responses.md:186–190` / 有对应 |
| 10 | `azure-openai-responses / reply / reply-corpus-kahuwo-2` | `final-ledger.md:37` | `irreversibility-atlas.md:480` | O / `api/family-variants.md:84,135` / 有对应 |
| 11 | `azure-openai-responses / reply / reply-corpus-claude2-2` | `final-ledger.md:38` | `irreversibility-atlas.md:481` | O / `api/family-variants.md:84,135` / 有对应 |
| 12 | `azure-openai-responses / reply / reply-corpus-b4-claude-reason-2` | `final-ledger.md:39` | `irreversibility-atlas.md:482` | O / `api/family-variants.md:84,135` / 有对应 |
| 13 | `azure-openai-responses / reply / reply-corpus-b4-deepseek-mixed-2` | `final-ledger.md:40` | `irreversibility-atlas.md:483` | O / `api/family-variants.md:84,135` / 有对应 |
| 14 | `azure-openai-responses / reply / reply-corpus-b4-deepseek-codegen-2` | `final-ledger.md:41` | `irreversibility-atlas.md:484` | O / `api/family-variants.md:84,135` / 有对应 |
| 15 | `azure-openai-responses / reply / reply-corpus-b4-deepseek-longreason-2` | `final-ledger.md:42` | `irreversibility-atlas.md:485` | O / `api/family-variants.md:84,135` / 有对应 |
| 16 | `azure-openai-responses / reply / reply-corpus-b4-kimi-reason-2` | `final-ledger.md:43` | `irreversibility-atlas.md:486` | O / `api/family-variants.md:84,135` / 有对应 |
| 17 | `azure-openai-responses / reply / reply-corpus-b4-kimi-toolerr-2` | `final-ledger.md:44` | `irreversibility-atlas.md:487` | O / `api/family-variants.md:84,135` / 有对应 |
| 18 | `azure-openai-responses / reply / reply-corpus-b4-glm53-mixed-2` | `final-ledger.md:45` | `irreversibility-atlas.md:488` | O / `api/family-variants.md:84,135` / 有对应 |
| 19 | `openai-codex-responses / req / corpus-sys-user` | `final-ledger.md:46` | `irreversibility-atlas.md:489` | T / `api/family-variants.md:156–157` / 有对应 |
| 20 | `openai-codex-responses / req / corpus-orphan-toolcall` | `final-ledger.md:47` | `irreversibility-atlas.md:490` | T / `api/family-variants.md:156–157` / 有对应 |
| 21 | `openai-codex-responses / req / corpus-full-convo` | `final-ledger.md:48` | `irreversibility-atlas.md:491` | T / `api/family-variants.md:156–157` / 有对应 |
| 22 | `openai-codex-responses / req / corpus-claude-full` | `final-ledger.md:49` | `irreversibility-atlas.md:492` | T / `api/family-variants.md:156–157` / 有对应 |
| 23 | `openai-codex-responses / req / corpus-thinking` | `final-ledger.md:50` | `irreversibility-atlas.md:493` | T / `api/family-variants.md:156–157` / 有对应 |
| 24 | `openai-codex-responses / req / corpus-plain-multi-glm5` | `final-ledger.md:51` | `irreversibility-atlas.md:494` | T / `api/family-variants.md:156–157` / 有对应 |
| 25 | `openai-codex-responses / req / corpus-plain-multi-glm52` | `final-ledger.md:52` | `irreversibility-atlas.md:495` | T / `api/family-variants.md:156–157` / 有对应 |
| 26 | `openai-codex-responses / req / corpus-b4-claude-thinking` | `final-ledger.md:53` | `irreversibility-atlas.md:496` | T / `api/family-variants.md:156–157` / 有对应 |
| 27 | `openai-codex-responses / req / corpus-b4-claude-parallel-toolcall` | `final-ledger.md:54` | `irreversibility-atlas.md:497` | T / `api/family-variants.md:156–157` / 有对应 |
| 28 | `openai-codex-responses / req / corpus-b4-claude-tool-error` | `final-ledger.md:55` | `irreversibility-atlas.md:498` | T / `api/family-variants.md:156–157` / 有对应 |
| 29 | `openai-codex-responses / req / corpus-b4-mixed-zh-en` | `final-ledger.md:56` | `irreversibility-atlas.md:499` | T / `api/family-variants.md:156–157` / 有对应 |
| 30 | `openai-codex-responses / req / corpus-b4-codegen` | `final-ledger.md:57` | `irreversibility-atlas.md:500` | T / `api/family-variants.md:156–157` / 有对应 |
| 31 | `openai-codex-responses / req / corpus-b4-long-thinking` | `final-ledger.md:58` | `irreversibility-atlas.md:501` | T / `api/family-variants.md:156–157` / 有对应 |
| 32 | `openai-codex-responses / req / corpus-b4-glm52-codegen-mixed` | `final-ledger.md:59` | `irreversibility-atlas.md:502` | T / `api/family-variants.md:156–157` / 有对应 |
| 33 | `openai-codex-responses / req / corpus-b4-glm52-parallel-toolcall` | `final-ledger.md:60` | `irreversibility-atlas.md:503` | T / `api/family-variants.md:156–157` / 有对应 |
| 34 | `openai-codex-responses / req / corpus-b4-glm52-tool-error-zh` | `final-ledger.md:61` | `irreversibility-atlas.md:504` | T / `api/family-variants.md:156–157` / 有对应 |
| 35 | `openai-codex-responses / req / corpus-b4-kimi-reason` | `final-ledger.md:62` | `irreversibility-atlas.md:505` | T / `api/family-variants.md:156–157` / 有对应 |
| 36 | `openai-codex-responses / req / corpus-b4-kimi-thinking-tool-error` | `final-ledger.md:63` | `irreversibility-atlas.md:506` | T / `api/family-variants.md:156–157` / 有对应 |
| 37 | `openai-codex-responses / req / corpus-b4-glm53-parallel-toolcall` | `final-ledger.md:64` | `irreversibility-atlas.md:507` | T / `api/family-variants.md:156–157` / 有对应 |
| 38 | `openai-codex-responses / req / corpus-b4-glm53-mixed` | `final-ledger.md:65` | `irreversibility-atlas.md:508` | T / `api/family-variants.md:156–157` / 有对应 |
| 39 | `openai-codex-responses / req / syn-tools-declared` | `final-ledger.md:66` | `irreversibility-atlas.md:509` | T / `api/family-variants.md:156–157` / 有对应 |
| 40 | `openai-codex-responses / req / syn-multi-toolcall` | `final-ledger.md:67` | `irreversibility-atlas.md:510` | T / `api/family-variants.md:156–157` / 有对应 |
| 41 | `openai-codex-responses / req / syn-same-model-thinking` | `final-ledger.md:68` | `irreversibility-atlas.md:511` | T / `api/family-variants.md:156–157` / 有对应 |
| 42 | `openai-codex-responses / req / syn-assistant-multi-text` | `final-ledger.md:69` | `irreversibility-atlas.md:512` | T / `api/family-variants.md:156–157` / 有对应 |
| 43 | `openai-codex-responses / req / syn-error-assistant-dropped` | `final-ledger.md:70` | `irreversibility-atlas.md:513` | T / `api/family-variants.md:156–157` / 有对应 |
| 44 | `openai-codex-responses / req / syn-user-blocks` | `final-ledger.md:71` | `irreversibility-atlas.md:514` | T / `api/family-variants.md:156–157` / 有对应 |
| 45 | `openai-codex-responses / req / syn-user-image` | `final-ledger.md:72` | `irreversibility-atlas.md:515` | T / `api/family-variants.md:156–157` / 有对应 |
| 46 | `openai-codex-responses / req / syn-no-system` | `final-ledger.md:73` | `irreversibility-atlas.md:516` | T / `api/family-variants.md:156–157` / 有对应 |
| 47 | `openai-codex-responses / req / syn-schema-metadata` | `final-ledger.md:74` | `irreversibility-atlas.md:517` | T / `api/family-variants.md:156–157` / 有对应 |
| 48 | `openai-codex-responses / reply / reply-text-stop` | `final-ledger.md:75` | `irreversibility-atlas.md:518` | T / `api/family-variants.md:156–157` / 有对应 |
| 49 | `openai-codex-responses / reply / reply-thinking-text` | `final-ledger.md:76` | `irreversibility-atlas.md:519` | T / `api/family-variants.md:156–157` / 有对应 |
| 50 | `openai-codex-responses / reply / reply-single-toolcall` | `final-ledger.md:77` | `irreversibility-atlas.md:520` | T / `api/family-variants.md:156–157` / 有对应 |
| 51 | `openai-codex-responses / reply / reply-multi-toolcall` | `final-ledger.md:78` | `irreversibility-atlas.md:521` | T / `api/family-variants.md:156–157` / 有对应 |
| 52 | `openai-codex-responses / reply / reply-length` | `final-ledger.md:79` | `irreversibility-atlas.md:522` | T / `api/family-variants.md:156–157` / 有对应 |
| 53 | `openai-codex-responses / reply / reply-error-finish-reason` | `final-ledger.md:80` | `irreversibility-atlas.md:523` | T / `api/family-variants.md:156–157` / 有对应 |
| 54 | `openai-codex-responses / reply / reply-response-id` | `final-ledger.md:81` | `irreversibility-atlas.md:524` | T / `api/family-variants.md:156–157` / 有对应 |
| 55 | `openai-codex-responses / reply / reply-corpus-kahuwo-2` | `final-ledger.md:82` | `irreversibility-atlas.md:525` | T / `api/family-variants.md:156–157` / 有对应 |
| 56 | `openai-codex-responses / reply / reply-corpus-kahuwo-4` | `final-ledger.md:83` | `irreversibility-atlas.md:526` | T / `api/family-variants.md:156–157` / 有对应 |
| 57 | `openai-codex-responses / reply / reply-corpus-claude-2` | `final-ledger.md:84` | `irreversibility-atlas.md:527` | T / `api/family-variants.md:156–157` / 有对应 |
| 58 | `openai-codex-responses / reply / reply-corpus-claude-4` | `final-ledger.md:85` | `irreversibility-atlas.md:528` | T / `api/family-variants.md:156–157` / 有对应 |
| 59 | `openai-codex-responses / reply / reply-corpus-glm5-2` | `final-ledger.md:86` | `irreversibility-atlas.md:529` | T / `api/family-variants.md:156–157` / 有对应 |
| 60 | `openai-codex-responses / reply / reply-corpus-claude2-2` | `final-ledger.md:87` | `irreversibility-atlas.md:530` | T / `api/family-variants.md:156–157` / 有对应 |
| 61 | `openai-codex-responses / reply / reply-corpus-glm52-2` | `final-ledger.md:88` | `irreversibility-atlas.md:531` | T / `api/family-variants.md:156–157` / 有对应 |
| 62 | `openai-codex-responses / reply / reply-corpus-b4-claude-reason-2` | `final-ledger.md:89` | `irreversibility-atlas.md:532` | T / `api/family-variants.md:156–157` / 有对应 |
| 63 | `openai-codex-responses / reply / reply-corpus-b4-claude-multitool-2` | `final-ledger.md:90` | `irreversibility-atlas.md:533` | T / `api/family-variants.md:156–157` / 有对应 |
| 64 | `openai-codex-responses / reply / reply-corpus-b4-claude-multitool-5` | `final-ledger.md:91` | `irreversibility-atlas.md:534` | T / `api/family-variants.md:156–157` / 有对应 |
| 65 | `openai-codex-responses / reply / reply-corpus-b4-claude-toolerr-2` | `final-ledger.md:92` | `irreversibility-atlas.md:535` | T / `api/family-variants.md:156–157` / 有对应 |
| 66 | `openai-codex-responses / reply / reply-corpus-b4-claude-toolerr-4` | `final-ledger.md:93` | `irreversibility-atlas.md:536` | T / `api/family-variants.md:156–157` / 有对应 |
| 67 | `openai-codex-responses / reply / reply-corpus-b4-deepseek-mixed-2` | `final-ledger.md:94` | `irreversibility-atlas.md:537` | T / `api/family-variants.md:156–157` / 有对应 |
| 68 | `openai-codex-responses / reply / reply-corpus-b4-deepseek-codegen-2` | `final-ledger.md:95` | `irreversibility-atlas.md:538` | T / `api/family-variants.md:156–157` / 有对应 |
| 69 | `openai-codex-responses / reply / reply-corpus-b4-deepseek-longreason-2` | `final-ledger.md:96` | `irreversibility-atlas.md:539` | T / `api/family-variants.md:156–157` / 有对应 |
| 70 | `openai-codex-responses / reply / reply-corpus-b4-glm52-codegen-mixed-2` | `final-ledger.md:97` | `irreversibility-atlas.md:540` | T / `api/family-variants.md:156–157` / 有对应 |
| 71 | `openai-codex-responses / reply / reply-corpus-b4-glm52-multitool-2` | `final-ledger.md:98` | `irreversibility-atlas.md:541` | T / `api/family-variants.md:156–157` / 有对应 |
| 72 | `openai-codex-responses / reply / reply-corpus-b4-glm52-multitool-5` | `final-ledger.md:99` | `irreversibility-atlas.md:542` | T / `api/family-variants.md:156–157` / 有对应 |
| 73 | `openai-codex-responses / reply / reply-corpus-b4-glm52-toolerr-zh-2` | `final-ledger.md:100` | `irreversibility-atlas.md:543` | T / `api/family-variants.md:156–157` / 有对应 |
| 74 | `openai-codex-responses / reply / reply-corpus-b4-glm52-toolerr-zh-4` | `final-ledger.md:101` | `irreversibility-atlas.md:544` | T / `api/family-variants.md:156–157` / 有对应 |
| 75 | `openai-codex-responses / reply / reply-corpus-b4-kimi-reason-2` | `final-ledger.md:102` | `irreversibility-atlas.md:545` | T / `api/family-variants.md:156–157` / 有对应 |
| 76 | `openai-codex-responses / reply / reply-corpus-b4-kimi-toolerr-2` | `final-ledger.md:103` | `irreversibility-atlas.md:546` | T / `api/family-variants.md:156–157` / 有对应 |
| 77 | `openai-codex-responses / reply / reply-corpus-b4-kimi-toolerr-4` | `final-ledger.md:104` | `irreversibility-atlas.md:547` | T / `api/family-variants.md:156–157` / 有对应 |
| 78 | `openai-codex-responses / reply / reply-corpus-b4-glm53-multitool-2` | `final-ledger.md:105` | `irreversibility-atlas.md:548` | T / `api/family-variants.md:156–157` / 有对应 |
| 79 | `openai-codex-responses / reply / reply-corpus-b4-glm53-multitool-5` | `final-ledger.md:106` | `irreversibility-atlas.md:549` | T / `api/family-variants.md:156–157` / 有对应 |
| 80 | `openai-codex-responses / reply / reply-corpus-b4-glm53-mixed-2` | `final-ledger.md:107` | `irreversibility-atlas.md:550` | T / `api/family-variants.md:156–157` / 有对应 |
| 81 | `openai-codex-responses / reply / reply-nonzero-cache-usage` | `final-ledger.md:108` | `irreversibility-atlas.md:551` | T / `api/family-variants.md:156–157` / 有对应 |


## 7. 复审记录

### 7.1 实施边界与计数

本次按初审裁决实施文档修订，不修改src/**、tests/**、锁定TS或快照；所有源码仅只读参照。源码别名沿用第1.2节；G37沿用family页的C=CX、OE=src/api/openai_responses/encode.rs。D **20/20**、G **37/37**、R **6/6**为既有处置记录；独立复审随后检出F1–F5，本轮已补修，完成状态与本轮验证以 `freeze-verdict.md` 第7节为准，仍待再次独立gate。当前图谱 **239行＝E12/D126/L66/P32/T3**（原233行加6个条件子行）；原编号保留，新增后缀-D/-L/-P显式区分条件，不把变化后的分母冒充原统计。A07.04聚合行不再包含ID，ID条件由A07.23及-P明确承担。

重构文档：openai-responses.md **275行**；google-generative-ai.md **181行**；mistral.md **101行**。八份权威规格覆盖十协议，另有bedrock-mistral.md退役存根，非第九份权威规格。

### 7.2 D01–D20逐项处置（D14已按F1补修，待独立复审）

| ID | 处置结果 | 当前定位 | 只读源码裁决 |
|---|---|---|---|
| D01 | 已完成：八份权威页+一份退役存根；Responses/Google重组、Mistral独立，统一1–6及第4节。 | `api/openai-responses.md:3` | 实际文件结构；图谱A节清点 |
| D02 | 已完成：不同工具ID/index域E；重复ID命中旧slot另列D，不删除正确规格边界。 | `irreversibility-atlas.md:46` | OCC:499–555 |
| D03 | 已完成：非strict schema整体D，根级其他键单独L；保留I06范围。 | `irreversibility-atlas.md:169` | AM:1637–1650 |
| D04 | 已完成：当前源endTurn为L；true/false→None，未来补发后才可能E；G37收录。 | `api/family-variants.md:139` | CX:775–783；src/api/openai_responses/encode.rs:107–111 |
| D05 | 已完成：Google/Vertex唯一已发工具ID为E，缺/重复为P；Vertex聚合行明确排除ID，不用D吞本地时钟。 | `irreversibility-atlas.md:201` | GG:195–201；GV:204–210 |
| D06 | 已完成：源write不发为L，重建常数0为派生D，family正文与第4节同步。 | `api/family-variants.md:140` | src/api/google_generative_ai/encode.rs:90–98；GV:240–249 |
| D07 | 已完成：Bedrock Q redacted thinking明确空串，不套R占位。 | `irreversibility-atlas.md:252` | src/api/bedrock_converse_stream/decode_assistant.rs:29–34 |
| D08 | 已完成：只读.thinking；output_config.effort/anthropic_beta/reasoning_effort/reasoning.effort条件已发未读逐项列出；旧合并页退役，补读W-07候选。 | `irreversibility-atlas.md:256` | src/api/bedrock_converse_stream/decode.rs:39–42；BR:1279–1355 |
| D09 | 已完成：Google/Vertex均false→parametersJsonSchema保meta，不再称Vertex剥meta。 | `api/google-generative-ai.md:129` | GG:395–397；GV:485–489；GS:380–396 |
| D10 | 已完成：三元跨模型去工具签名/调用normalizer；isDifferentModel或前缀不匹配才删item，foreign fc_可保留，namespace仅sameModel。 | `api/openai-responses.md:204` | TM:95–98,129–151；SH:257–325 |
| D11 | 已完成：只有无拼接文本且有图片才占位；混合文本保留，旧Gemini图另起user。 | `api/google-generative-ai.md:133` | GS:285–338 |
| D12 | 已完成：usage饱和与缺省reasoning域明确，最终output=max(output,reasoning??0)，input不重复加read。 | `api/google-generative-ai.md:137` | src/api/google_generative_ai/encode.rs:90–98；GG:232–250 |
| D13 | 已完成：Mistral tools-only不合成System、工具图片wire有而mock只读text；明记W-07候选与验收，不实施。 | `api/mistral.md:61` | MI:777–810,875–920；src/api/mistral_conversations/decode_messages.rs:94–119 |
| D14 | 已按F1补修：Q先经TM跨模型thinking→text为D，再trim判空、sanitize；E仅限块类型未被跨模型转换、未过滤/净化且消息边界未合并的文本域。R先sanitize再跳空；保序不等于原文/原块类型E。 | `api/mistral.md:66`；`irreversibility-atlas.md` A09.03及-D | TM:95–117；MI:844–858,644–704 |
| D15 | 已完成：PM五合法stop/error域E；成功errorMessage另列L；pending/deferred明确输入拒绝。 | `irreversibility-atlas.md:315` | src/api/pi_messages/encode.rs:64–79；PM:195–217 |
| D16 | 已完成：AM/Bedrock第2/3/4/5节统一观察点；schema require、孤立结果、image/pending等输入拒绝非T；内容后流内错误非T，HTTP400/500另记下游观察。 | `api/anthropic-messages.md:162` | CS:225–248；src/api/anthropic_messages/messages.rs:87–90；BR:320–357 |
| D17 | 已完成：Codex默认头与body均为先截64的同值；普通Responses头保原长串的结论不套Codex。 | `irreversibility-atlas.md:133` | CX:276–284,1676–1679 |
| D18 | 已完成：Google/Vertex非成功源stop使用raw或OTHER后按native重映射；raw STOP/MAX_TOKENS可变成功/length，未知抛错。 | `api/family-variants.md:141` | src/api/google_generative_ai/encode.rs:82–86；GS:441–475 |
| D19 | 已完成：Responses净化调用点白名单；reasoning item JSON直接回放不递归净化，不以Rust String否认JS坏代理输入。 | `api/openai-responses.md:177` | SH:263–267,286,314；utils/sanitize-unicode.ts:21–24 |
| D20 | 已完成：truthy max且支持才发max(16,n)，0省略；显式effort或truthy summary回退medium，仅显式经map，sampling最后覆盖。 | `api/openai-responses.md:206` | OR:330–386 |

### 7.3 G01–G37逐项处置（全部已完成；剩余0）

每个目标均为对应权威规格**第4节表格行**，不是只加标题、引用其他协议或用测试函数冒充规则。结果“已补齐”包含迁入已有规则及按D裁决纠错；每行源码范围可直接复查。

| ID | 处置结果 | 当前第4节定位 | 规则源码（目标行原证据） |
|---|---|---|---|
| G01 | 已补齐；剩余0 | `api/openai-responses.md:200` | SH:184–227；TR:58–119；src/api/openai_responses/decode.rs:141–161 |
| G02 | 已补齐；剩余0 | `api/openai-responses.md:201` | SH:229–253；src/api/openai_responses/decode.rs:165–175 |
| G03 | 已补齐；剩余0 | `api/openai-responses.md:202` | SH:263–268；src/api/openai_responses/decode.rs:56–64 |
| G04 | 已补齐；剩余0 | `api/openai-responses.md:203` | SH:53–70,269–289；src/api/openai_responses/decode.rs:118–142 |
| G05 | 已补齐；剩余0 | `api/openai-responses.md:204` | TM:95–98,129–151；SH:154–177,257–325 |
| G06 | 已补齐；剩余0 | `api/openai-responses.md:205` | SH:81–108,332–348；src/api/openai_responses/decode.rs:89–108,178–199 |
| G07 | 已补齐；剩余0 | `api/openai-responses.md:206` | SH:360–397；api/constrained-sampling.ts:15–143,225–248；OR:277–291,330–386；api/simple-options.ts:18–46 |
| G08 | 已补齐；剩余0 | `api/openai-responses.md:207` | SH:464–484,688–710；src/api/openai_responses/encode.rs:76–87 |
| G09 | 已补齐；剩余0 | `api/openai-responses.md:208` | SH:688–693；src/api/openai_responses/encode.rs:17–30 |
| G10 | 已补齐；剩余0 | `api/openai-responses.md:209` | SH:688–693；src/api/openai_responses/encode.rs:17–30；tests/canonical-ores.mjs:199–206；../irreversibility-atlas.md:B2 |
| G11 | 已补齐；剩余0 | `api/openai-responses.md:210` | SH:485–503,710–727；src/api/openai_responses/encode.rs:52–69 |
| G12 | 已补齐；剩余0 | `api/openai-responses.md:211` | SH:560–595,747–757；src/api/openai_responses/encode.rs:90–109 |
| G13 | 已补齐；剩余0 | `api/openai-responses.md:212` | src/api/openai_responses/encode.rs:11；SH:557–559,601–604 |
| G14 | 已补齐；剩余0 | `api/openai-responses.md:213` | SH:584–595,743–760；src/api/openai_responses/encode.rs:100–112 |
| G15 | 已补齐；剩余0 | `api/openai-responses.md:214` | SH:584–589,747–755；src/api/openai_responses/encode.rs:100–109 |
| G16 | 已补齐；剩余0 | `api/google-generative-ai.md:129` | GG:379–397；api/google-vertex.ts:485–489；GS:380–406；TR:58–119；CS:15–143,225–248；src/api/google_generative_ai/decode.rs:53–87 |
| G17 | 已补齐；剩余0 | `api/google-generative-ai.md:130` | GS:203–226；src/api/google_generative_ai/decode.rs:70–132；utils/sanitize-unicode.ts:21–24 |
| G18 | 已补齐；剩余0 | `api/google-generative-ai.md:131` | TM:95–145；GS:146–160,230–281；src/api/google_generative_ai/decode.rs:135–156 |
| G19 | 已补齐；剩余0 | `api/google-generative-ai.md:132` | GS:165–177,197–201,270–281；TM:129–151；src/api/google_generative_ai/decode.rs:135–143 |
| G20 | 已补齐；剩余0 | `api/google-generative-ai.md:133` | GS:285–338；src/api/google_generative_ai/decode.rs:160–188 |
| G21 | 已补齐；剩余0 | `api/google-generative-ai.md:134` | GG:379–418,431–460；GS:48–110,423–435；api/simple-options.ts:18–46；src/api/google_generative_ai/decode.rs:191–211 |
| G22 | 已补齐；剩余0 | `api/google-generative-ai.md:135` | GG:110–171；GS:138–143；src/api/google_generative_ai/encode.rs:54–78 |
| G23 | 已补齐；剩余0 | `api/google-generative-ai.md:136` | GG:175–219；api/google-vertex.ts:184–227；src/api/google_generative_ai/encode.rs:63–73,101–117 |
| G24 | 已补齐；剩余0 | `api/google-generative-ai.md:137` | src/api/google_generative_ai/encode.rs:90–98；GG:232–250 |
| G25 | 已补齐；剩余0 | `api/google-generative-ai.md:138` | GG:110,224–228,272–297；GS:441–475；src/api/google_generative_ai/encode.rs:82–86 |
| G26 | 已补齐；剩余0 | `api/google-generative-ai.md:139` | GG:224–228；src/api/google_generative_ai/encode.rs:82–86 |
| G27 | 已补齐；剩余0 | `api/mistral.md:61` | MI:777–810；TR:58–119；CS:15–143,225–248；src/api/mistral_conversations/decode_messages.rs:115–119 |
| G28 | 已补齐；剩余0 | `api/mistral.md:62` | TM:12–57；MI:812–839；src/api/mistral_conversations/decode_messages.rs:24–35 |
| G29 | 已按F2同步图谱A09.04：sameModel保持ID，cross-model才规范化；ID与交错位置投影分述。 | `api/mistral.md:63` | MI:238–267,840–874；TM:95–98,129–151 |
| G30 | 已补齐；剩余0 | `api/mistral.md:64` | MI:875–920；src/api/mistral_conversations/decode_messages.rs:94–110 |
| G31 | 已按F5删除env long/default short推断；只按retention非none及truthy session启用缓存，Simple直接透传。 | `api/mistral.md:65` | MI:187–215,350–430,527–552；SO:18–53；src/api/mistral_conversations/decode.rs:14–35 |
| G32 | 已补齐；剩余0 | `api/mistral.md:67` | MI:644–704 |
| G33 | 已按F3补修：name只取建块首段，只有arguments逐段累积解析；当前encoder单帧完整工具名的E域不外推至一般wire。 | `api/mistral.md:68` | MI:710–749；src/api/mistral_conversations/encode.rs:18–20 |
| G34 | 已补齐；剩余0 | `api/mistral.md:69` | MI:555–573,616–628；src/api/mistral_conversations/encode.rs:36–37 |
| G35 | 已补齐；剩余0 | `api/mistral.md:70` | MI:609–614,936–951；src/api/mistral_conversations/encode.rs:6–9,28–36 |
| G36 | 已补齐；剩余0 | `api/mistral.md:71` | MI:633–636；src/api/mistral_conversations/encode.rs:28–35 |
| G37 | 已补齐；剩余0 | `api/family-variants.md:139` | C:775–783；OE:107–111；src/model/message.rs:82；../irreversibility-atlas.md A04.08/F5；定义仅记候选，不实施。 |

### 7.4 R/C处置与剩余候选任务的验收边界

| 初审项 | 本次文档处置与当前依据 | 剩余文档必修 |
|---|---|---|
| R01 | atlas B4将OCC textSignature报错标为已解决历史finding；现行OCC第3/4节是静默不发，不再指旧第125行。 | 0 |
| R02 | atlas B3/B4撤销对当前family的“只需SSE”“模型无endTurn”指控，明确当前family第3/5节已纠正；现状endTurn仍L，G37/F5另案。 | 0 |
| R03 | atlas B4 Google schema以当前Google G16/family第2.4/4节定位；Bedrock第4/5节按A08.03/A08.07/A08.06语义ID定位，旧188/192/191不沿用。 | 0 |
| R04 | Responses四案/Mistral31案明确历史分母；当前18个O与Mistral63/0另记，不伪称本轮重跑。 | 0 |
| R05 | 当前JSON SHA256 a4583609824bae6c9c884196fe8f636eea444101860a7e833525dea632b1443f；ledger旧c353…是另次历史执行，不改历史ledger或谎称hash相等。 | 0 |
| R06 | 旧合并页退役；Mistral第1节明确chat先Completions，再按mount/x-affinity/body特征选择Mistral；不是待接也非无条件全chat。 | 0 |
| C05–C07 | Responses第4节显式对账表与G03–G07登记ID/签名/图像/schema/options oracle偏差。 | 0 |
| C08 | family第4节Q Codex默认/预算/推理及options既有表保留：无条件auto、固定64、retag不证明全部变体。 | 0 |
| C09–C11 | Google第4节显式对账表登记三类签名、模型/图/options窄域、R最后非空签名；family同源规则保持。 | 0 |
| C18–C20 | Mistral第4节专表登记tools-only/图片、Q/R Unicode先后次序、aborted/deferred投影偏差。 | 0 |
| C23 | Responses/family第4节明确legacy→v1、无call toolUse→stop的oracle缺口。 | 0 |
| C24 | OCC、Responses、Google、AM和family第4节分别登记未发元数据/签名未清理，禁止全局剥签名。 | 0 |
| C25 | AM第4节登记unsupported/default error，Google第4节登记无call toolUse及raw保留词条件；family同源。 | 0 |
| C27–C29 | AM登记redacted文本占位；Responses/family登记missing/empty错误文案；OCC登记条件responseModel/重复工具ID，均在第4节。 | 0 |

W-06/W-07在本次仅作**候选标签**，不是已批准工作项、已实现或已通过验收。以下保留工作均不再是未定义的冻结前矛盾：

| 候选 / 现状 | 目标域与独立验收 | 策略批准状态 |
|---|---|---|
| W-06：C01–C25、C27–C29现存oracle/覆盖偏差 | 按各页第4节当前源码算法独立预测，不复制actual；分别测Unicode、空块/签名门槛、ID条件、图文路由、options、usage/total/cost/native stop与未发字段；保持所有非零缓存与原语料。现有12单测不证明全集。 | 已定义现状的实验修复可候选，未在本轮实施；扩大fixture不改变协议契约。 |
| W-07：Bedrock/Mistral工具图像、Mistral tools-only、Bedrock reasoning扩展等已发未读 | 逐项按wire恢复，text/image混合及纯图、error状态、no-system/tools-only、schema/order及每个已发扩展独立断言；不以canonical删除字段掩盖共同bug（atlas F2–F4、Bedrock/Mistral第4/5节）。 | 只标候选，未补读；不批准模型扩容。 |
| W-07：Codex endTurn当前L | Codex专用补发后true/false/None与锁定parser一致，普通Responses不强迫支持；transport解阻后真实SDK验证（family G37；atlas F5）。 | 候选，未补发，不将未来E冒充当前D。 |
| W-07：Codex zstd/WS、Vertex ADC | zstd在String提取前解压、错误及大小限制/未压缩兼容；真实63案复跑再看内容差异。WS单独验证auto回退/显式WS/开始后错误/续传，ADC必须走真实分支并隔离公网，不能用Express代替（atlas T1–T3）。 | 候选；WS/ADC不编造当前FAIL，环境/隔离策略仍另案批准。 |
| 待批策略：Responses外域opaque降级 | 当前拒绝且保留O18；若将来批准，encoder与独立canonical同步，记录原签名损失、同域item保持、redacted不造可见summary（Responses G09/G10；atlas K2/F1）。 | **未批准**，不把候选summary item当既有实现。 |
| 待批模型/stop策略：PM字段/sections与BR/MI deferred | 当前PM模型投影、BR deferred→stop、MI aborted→error/deferred→stop已明记；若要求完整TS模型或新拒绝策略，另案决定，完整字段/顺序/全部stop枚举独立验收（atlas F6/F7）。 | **未批准**；本轮维持当前映射。 |

### 7.5 本次执行验证与改动证据

以下命令、摘要及改动清单为初轮实施的历史执行证据，不作为F1–F5补修的新跑结果；本轮验证见 `freeze-verdict.md` 第7节。

本次只运行不覆写快照的单测与只读/文档检查，不跑duality全矩阵、cargo、fuzz、公网provider、WS/ADC；不把第6节历史探针/执行结果当本次结果。

| 本次命令/检查 | 实际结果 | 能证明与边界 |
|---|---|---|
| git status --short | exit128：not a git repository | 根无Git元数据，无法独立读取index；本次没有add/stage/commit动作。 |
| node --test tests/canonical-ten.test.mjs tests/canonical-reply-projections.test.mjs | PASS：12 tests / 12 pass / 0 fail（duration约418ms） | 现有纯canonical断言不回归，不证明已知oracle缺口消失。 |
| Python文档结构/G索引/表格/主类检查 | 最终PASS：八份权威规格均1–6；D20/G37复审唯一、G37条均在对应第4节；当前D126/126索引落在第4节；图谱239行计数一致、所有表格无列错位/孤行。初轮旧pipe及生成器6/7列误判已纠正，误判轮未写文件。 | 不隐藏失败；机械定位检查不替代独立语义审阅。 |
| Python显式TS别名/源码路径行号检查 | 最终PASS：2429处显式TS别名/源码路径引用均存在且行号不越界（含新增复审记录，不重复伪称独立语义证明）。初轮发现的Mistral encode_error越界已改41–43。 | 范围有效不替代语义审阅，D表/G表载明语义依据。 |

受保护树按“排序相对路径+NUL+内容+NUL”的SHA256，开始与本次收尾检查相同：

| 树 | 文件数 | 开始/结束相同摘要 |
|---|---:|---|
| src | 87 | a36b52c0a90c5d4f79b1a768feccfbbc94ac72ee77eab8a18ab4d011b1357659 |
| tests | 37 | 531a832c80d466e8b88ee66c64a7b85b9fe0fc73d0ad3385720b76b9e493ac89 |
| 锁定TS src | 243 | b5ff86777c0c1fd15280ab0cee1f4cbe7828922e9be717ce85fed9976af7bab0 |

changed-files（全部位于docs/design/mock-llm-server/）：definition-freeze.md、irreversibility-atlas.md、api/openai-responses.md、api/google-generative-ai.md、api/mistral.md（新增）、api/bedrock-mistral.md（退役存根）、api/family-variants.md、api/anthropic-messages.md、api/bedrock.md、api/openai-completions.md。tests-added/updated=[]。no-staged-files只表示本次未暂存；因无Git index，不能伪造“暂存区已独立核验”。

**冻结边界结论：初轮“定义必修文档差异0，可提交冻结”声明已被独立复审驳回；F1–F5已补修文档，但仍待再次独立reviewer gate确认。** 实验/实现残余及待批策略如上，81历史FAIL保持；不能把未批策略或未修代码算成已完成。


### 7.6 当前126个D行的第4节索引

分母随条件裁决更新为D126，不沿用初审D127。下列每行均指向当前对应规格第4节的显式规则（新条件子行保留独立ID）；该表验证汇编可定位，不代表所有实验向量已通过。Responses的外域D索引仍仅登记待批目标/当前拒绝，非已发生正常D往返。

| 当前图谱D行 | 对应规格第4节规则 | 当前定位 |
|---|---|---|
| A01.01 | C1 Q transcript | `api/openai-completions.md:113` |
| A01.02 | C6 Q 文本 | `api/openai-completions.md:118` |
| A01.03 | C6 Q 文本 | `api/openai-completions.md:118` |
| A01.04 | C7 Q thinking | `api/openai-completions.md:119` |
| A01.05 | C5 Q ID | `api/openai-completions.md:117` |
| A01.06 | C8 Q 消息/结果结构 | `api/openai-completions.md:120` |
| A01.08 | C9 Q tools | `api/openai-completions.md:121` |
| A01.09 | C13 R 槽位/签名 | `api/openai-completions.md:125` |
| A01.10 | C13 R 槽位/签名 | `api/openai-completions.md:125` |
| A01.11-D | C29 / | `api/openai-completions.md:167` |
| A01.13 | C14 R usage/身份 | `api/openai-completions.md:126` |
| A01.15 | C14 R usage/身份 | `api/openai-completions.md:126` |
| A01.16 | C14 R usage/身份 | `api/openai-completions.md:126` |
| A01.17 | C15 R finish/error | `api/openai-completions.md:127` |
| A01.23 | C15 R finish/error | `api/openai-completions.md:127` |
| A02.01 | G01 / | `api/openai-responses.md:200` |
| A02.02 | G02 / | `api/openai-responses.md:201` |
| A02.03 | G03 / | `api/openai-responses.md:202` |
| A02.04 | G04 / | `api/openai-responses.md:203` |
| A02.05 | G05 / | `api/openai-responses.md:204` |
| A02.06 | G06 / | `api/openai-responses.md:205` |
| A02.08 | G07 / | `api/openai-responses.md:206` |
| A02.09 | G08 / | `api/openai-responses.md:207` |
| A02.10 | G09 / | `api/openai-responses.md:208` |
| A02.11 | G10 / | `api/openai-responses.md:209` |
| A02.12 | G11 / | `api/openai-responses.md:210` |
| A02.13 | G12 / | `api/openai-responses.md:211` |
| A02.15 | G13 / | `api/openai-responses.md:212` |
| A02.16 | G14 / | `api/openai-responses.md:213` |
| A02.22 | G15 / | `api/openai-responses.md:214` |
| A03.01 | Q options | `api/family-variants.md:129` |
| A03.02 | Q 全消息预处理 | `api/family-variants.md:121` |
| A03.03 | Q 严格schema | `api/family-variants.md:125` |
| A03.04 | Q options | `api/family-variants.md:129` |
| A03.05 | R Responses canonical | `api/family-variants.md:135` |
| A03.06 | R Responses canonical | `api/family-variants.md:135` |
| A03.13 | R Responses canonical | `api/family-variants.md:135` |
| A03.16 | Q 系统/工具重放 | `api/family-variants.md:120` |
| A03.17 | Q Unicode | `api/family-variants.md:122` |
| A03.18 | Q Responses ID/签名 | `api/family-variants.md:123` |
| A03.19 | Q Responses ID/签名 | `api/family-variants.md:123` |
| A03.20 | Q Responses ID/签名 | `api/family-variants.md:123` |
| A03.21 | Q Responses tool output | `api/family-variants.md:124` |
| A03.23 | R Responses canonical | `api/family-variants.md:135` |
| A03.24 | R Responses canonical | `api/family-variants.md:135` |
| A03.25 | R Responses canonical | `api/family-variants.md:135` |
| A03.26 | R Responses canonical | `api/family-variants.md:135` |
| A03.27 | R Responses canonical | `api/family-variants.md:135` |
| A03.28 | R Responses canonical | `api/family-variants.md:135` |
| A04.02 | Q Codex 默认/预算/推理 | `api/family-variants.md:126` |
| A04.03 | Q 全消息预处理 | `api/family-variants.md:121` |
| A04.05 | Q Codex 默认/预算/推理 | `api/family-variants.md:126` |
| A04.07 | R Responses canonical | `api/family-variants.md:135` |
| A04.15 | R Responses canonical | `api/family-variants.md:135` |
| A04.18 | Q Unicode | `api/family-variants.md:122` |
| A04.19 | Q Responses ID/签名 | `api/family-variants.md:123` |
| A04.20 | Q Responses ID/签名 | `api/family-variants.md:123` |
| A04.21 | Q Responses ID/签名 | `api/family-variants.md:123` |
| A04.22 | Q Responses tool output | `api/family-variants.md:124` |
| A04.24 | R Responses canonical | `api/family-variants.md:135` |
| A04.25 | R Responses canonical | `api/family-variants.md:135` |
| A04.26 | R Responses canonical | `api/family-variants.md:135` |
| A04.27 | R Responses canonical | `api/family-variants.md:135` |
| A04.28 | R Responses canonical | `api/family-variants.md:135` |
| A04.29 | R Responses canonical | `api/family-variants.md:135` |
| A05.01 | C02／Q system | `api/anthropic-messages.md:145` |
| A05.02 | C06／Q 空白 | `api/anthropic-messages.md:149` |
| A05.03 | C04／Q thinking | `api/anthropic-messages.md:147` |
| A05.04 | C05／Q ID | `api/anthropic-messages.md:148` |
| A05.05 | C07／Q 结果 | `api/anthropic-messages.md:150` |
| A05.06 | C11／Q schema | `api/anthropic-messages.md:154` |
| A05.07 | C13／Q thinking | `api/anthropic-messages.md:156` |
| A05.08 | C15／R 内容 | `api/anthropic-messages.md:158` |
| A05.09 | C15／R 内容 | `api/anthropic-messages.md:158` |
| A05.10 | C17／R usage | `api/anthropic-messages.md:160` |
| A05.11 | C15／R 内容 | `api/anthropic-messages.md:158` |
| A05.12 | C16／R stop | `api/anthropic-messages.md:159` |
| A05.19 | C16／R stop | `api/anthropic-messages.md:159` |
| A06.01 | G16 / | `api/google-generative-ai.md:129` |
| A06.02 | G17 / | `api/google-generative-ai.md:130` |
| A06.03 | G18 / | `api/google-generative-ai.md:131` |
| A06.04 | G19 / | `api/google-generative-ai.md:132` |
| A06.05 | G20 / | `api/google-generative-ai.md:133` |
| A06.06 | G21 / | `api/google-generative-ai.md:134` |
| A06.08 | G22 / | `api/google-generative-ai.md:135` |
| A06.10 | G24 / | `api/google-generative-ai.md:137` |
| A06.12 | G25 / | `api/google-generative-ai.md:138` |
| A06.19 | G26 / | `api/google-generative-ai.md:139` |
| A07.02 | Q Google签名 | `api/family-variants.md:127` |
| A07.03 | Q Google预算 | `api/family-variants.md:130` |
| A07.04 | R Vertex canonical | `api/family-variants.md:136` |
| A07.05 | R Vertex canonical | `api/family-variants.md:136` |
| A07.12 | R Google finishReason全集 | `api/family-variants.md:138` |
| A07.15 | Q 系统/工具重放 | `api/family-variants.md:120` |
| A07.16 | Q Unicode | `api/family-variants.md:122` |
| A07.17 | Q Google签名 | `api/family-variants.md:127` |
| A07.18 | Q Google工具ID/图 | `api/family-variants.md:128` |
| A07.19 | Q Google工具ID/图 | `api/family-variants.md:128` |
| A07.20 | Q options | `api/family-variants.md:129` |
| A07.22 | R Vertex canonical | `api/family-variants.md:136` |
| A07.24 | R Vertex canonical | `api/family-variants.md:136` |
| A08.01 | Q-system | `api/bedrock.md:86` |
| A08.02 | Q-文本/空内容 | `api/bedrock.md:89` |
| A08.03 | Q-thinking | `api/bedrock.md:90` |
| A08.04 | Q-工具参数/结果 | `api/bedrock.md:91` |
| A08.05 | Q-工具参数/结果 | `api/bedrock.md:91` |
| A08.06 | Q-mock 归一缺口 | `api/bedrock.md:102` |
| A08.07 | Q-其他模型 reasoning | `api/bedrock.md:100` |
| A08.08 | R-块解析 | `api/bedrock.md:103` |
| A08.09 | R-usage/cost | `api/bedrock.md:106` |
| A08.11 | R-stop/error | `api/bedrock.md:105` |
| A08.18 | R-stop/error | `api/bedrock.md:105` |
| A09.01 | G27 / | `api/mistral.md:61` |
| A09.02 | G28 / | `api/mistral.md:62` |
| A09.03-D | D14 / | `api/mistral.md:66` |
| A09.04 | G29 / | `api/mistral.md:63` |
| A09.05 | G30 / | `api/mistral.md:64` |
| A09.07 | G31 / | `api/mistral.md:65` |
| A09.08 | G32 / | `api/mistral.md:67` |
| A09.09 | G33 / | `api/mistral.md:68` |
| A09.10 | G34 / | `api/mistral.md:69` |
| A09.12 | G35 / | `api/mistral.md:70` |
| A09.18 | G36 / | `api/mistral.md:71` |
| A10.05 | Q sections顺序 | `api/pi-messages.md:75` |
| A10.06 | Q 运行时记录字段 | `api/pi-messages.md:77` |
| A10.07 | Q options白名单 | `api/pi-messages.md:76` |


### 7.7 最终复验

- PASS：八份权威规格的编号章节均恰为1–6，G37/37、第7.2节D20/20、第7.3节G37/37唯一；当前126个D索引全部指向对应规格第4节，图谱239行＝E12/D126/L66/P32/T3。
- PASS：全部修改文档与报告的Markdown表格列数一致、无孤立表格行；2429处显式源码引用存在且行号有效。初审旧文档行号是历史证据，不假装是新版定位；第7节新版规格引用均落在实际文件范围内。
- PASS：只读JSON重计634唯一记录、553/81；81个完整(api,dir,name)与当前图谱D1同序相等，Responses9+Azure9+Codex63，无新增未解释FAIL，Mistral仍63/0；矩阵SHA256未变。未重跑矩阵。
- PASS：src/tests/锁定TS的三棵树摘要仍与本次开始相同；现有Node单测12/12通过；新增/修改测试0。
- 三份重构规格最终行数：Responses275、Google181、Mistral101。受保护基线到最终检查约15分钟，本次在30分钟硬限内增量完成；未执行stage/commit，根无Git index无法独立审计暂存区。
- 上述自检是初轮记录，随后独立reviewer gate已检出F1–F5并驳回冻结声明；本轮已按源码补修，逐项结果见 `freeze-verdict.md` 第7节，**待再次独立复审，作者不自批准正式冻结**。推荐下一步核对修订后的源码条件，不在验收时顺手实施W-06/W-07或批准新策略。
