# W-08 match 总对账（终账）

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 1. 结论与执行边界

**管线终跑已完成，但不是全绿验收。** W-07留下的5条oracle新红、W06-F1两实例及W06-F3一实例均转绿；W06-F2经批准裁为调用方路由声明边界，显式Mistral mount后绿，原共享路径歧义仍被独立复现。发现新 **W08-F4：Codex HTTP路由未调用endTurn wrapper**，6个wire反例未修，交owner/reviewer。

三类总账：**2466＝2350绿＋92外部transport边界＋24裁决类非绿（O18×18＋W08-F4×6）**。这是三个套件执行次数之和，不是2466个独立业务输入，也不是所有规则分支的穷尽证明。

| 套件 | 总数 | 绿 | 外部边界T | 裁决类非绿 | exit |
|---|---:|---:|---:|---:|---:|
| duality（真实锁定SDK） | 828 | 718 | 92 | 18 O18 | 1 |
| fuzz（4协议×200 seeds×双向） | 1600 | 1600 | 0 | 0 | 0 |
| 补充HTTP wire/路由检查 | 38 | 32 | 0 | 6 W08-F4 | 1 |
| 合计 | 2466 | 2350 | 92 | 24 | 不伪造全绿 |

另有Rust单测 **118/118**、Node单测 **41/41**；这两项不混入上述执行分母。cargo build、cargo check --all-targets、12个改动/新增mjs语法检查均通过。fuzz crash=0。

权威为W-07演进后的 `irreversibility-atlas.md`＋`api/`八份权威规格（覆盖十协议；`bedrock-mistral.md`为退役存根），不是十份独立权威页。输入为 `w06-experiments.md`、`w07-implementation.md`、进入时 `tests/matrix-ten-results.json`。锁定TS根 `<pi-mono>/packages/ai/src` 只读，SHA256逐文件核验0变化。本轮在30分钟硬限时内完成；先落初稿、再落裁决、最后复跑和终账，不改历史W06/W07报告。

进入时W-07矩阵 **795＝688绿＋107非绿**。修改前主键/差异摘要保存在 `tests/w08-baseline.json`，原始文件SHA256在 `tests/w08-before-hashes.json`。本轮保留全部795主键，新增33案，无删除；旧主键9条新绿、0条新红。历史F1/F2/F3及O18完整差异仍可查 `tests/w06-results-ledger.json`，W-07五条新红的expected/actual保留在其实施报告，不把新的matrix文件冒称旧证据。

## 2. W-07定义同步→oracle逐项对账

| 演进条目 | 本轮oracle/反例 | 终态 |
|---|---|---|
| Bedrock工具结果图片（atlas A08.06；bedrock §4 Q-W07） | `canonical-bedrock.mjs`去除结果图片过滤；保留wire图文顺序、base64字节与jpg→jpeg。原 `w06-vision-error-image-order`、`w06-vision-image-only` 两案不删输入 | 两案真实SDK绿；独立单测覆盖混合/纯图/error及MIME |
| Mistral工具结果data URL图片（G30） | `canonical-mistral.mjs`输出聚合文本后全部视觉图片，保留错误前缀；isError仍false，不反推原布尔 | 两个同名vision案真实SDK绿；纯图占位及图片MIME精确断言 |
| Mistral tools-only（G27） | 有工具无首System时合成content=""的System承载；schema/name/description/order保留；空工具不合成 | `w06-tools-only-strict`真实SDK绿；空transcript/无system/已有system/schema/order单测绿 |
| Bedrock reasoning envelope（A08.07-E；Q-其他模型reasoning） | 新 `canonical-bedrock-reasoning.mjs`从model/options独立构造完整扩展对象，非空整体JSON字符串；无扩展不设reasoning，不采用thinking-only双形态、不逆猜level | 新增8案真实SDK全绿：预算无beta、预算含beta、自定义high预算、adaptive binding/native xhigh、adaptive无binding、GovCloud、GPT-OSS平面、GPT嵌套映射、未知模型缺省（预算用例合并覆盖9个条件） |
| 同上JSON值语义 | `harness.mjs`仅对Bedrock `$.options.reasoning`做JSON值比较，不扩大为所有同名字段；opaque/v1签名规则不变 | mutation断言：键序可变、缺extension/改effort失败、工具arguments同名reasoning字符串仍精确比较 |
| Codex endTurn（A04.08/G37） | `canonical-responses-reply.mjs`仅Codex且非failed保留源bool/None；普通Responses/Azure仍删；新增12个SDK案、36个直接HTTP终帧检查 | SDK12案全被zstd阻断，不能声称E2E绿；wrapper原单测绿，但HTTP6案揭示W08-F4，不将oracle改回None |

八个Bedrock新案完整参数在 `tests/w08-matrix-cases.mjs`；独立期待常量与mutation在 `tests/w08-oracles.test.mjs`。所有期待生成只接收source/model/options，不读取actual；比较器的JSON排序不是字段删除或忽略。其他W-07未批准候选不借本轮实现。

## 3. W06-F1/F2/F3三方裁决

TS引用AM/MI/CX/BR均相对锁定源码根，mock路径相对本仓库。

### W06-F1：定义正确、实现错误，已修（2个历史实例）

- 冻结依据：`api/anthropic-messages.md` C16规定unsupported三终态经refusal→error，errorMessage有值保留，空/缺失使用 `The model refused to complete the request`。
- 客户端源码：AM:851–858读取stop_details并设置rawStopReason/errorMessage，AM:1663–1688映射refusal；解释文本可以被携带，不是信息论丢失，也不是transport。
- 旧实现：`src/api/anthropic_messages/encode.rs:98–114`对aborted/deferred/pending生成unsupported自造文案。
- 本轮实现：三种正常stop保持原样，其余统一refusal explanation；空/缺失归默认文案。没有改变stopReason/rawStopReason规则，也没有修改oracle来迎合旧actual。
- 回归：`encode_tests.rs`新增1项循环单测（error/pending/aborted/deferred×缺失/空/有值＝12组合）；真实SDK增加12案全绿。历史 `anthropic-messages/reply/w06-r-aborted` 保留 `cancelled`，`.../w06-r-deferred` 用默认文案，均绿。

### W06-F2：路由身份前置条件缺失，显式声明边界，非猜测式修复（1实例）

- 冻结依据：Mistral §1已定义chat默认Completions，再按mount/prefer、x-affinity或body特征选Mistral；G31 retention=none正确省略缓存key/affinity。
- 客户端源码：MI:298–318追加 `/v1/chat/completions`；MI:355–384与527–552在none时没有自动affinity/cache key。普通user/model/messages请求可与OCC重合，不能可靠逆推出调用方选择的API。
- 实现：`src/mounts/selection.rs:7–51`已有显式prefer优先级；不按model名猜测、不把无缓存解释为OCC协议语义、不修改src路由。
- **监督方明确批准**：归入“共享路由身份前置条件缺失”；Mistral canonicalQ以已选中本协议为前置，调用方用专用mount的 `prefer: "mistral-conversations"`（CLI `--prefer`）显式钉死。已同步 `api/mistral.md` §1，不是修改TS语义。
- `harness.mjs`使用临时mount配置（与CLI --prefer同一MountSpec），只有此历史case及新空thinking反例使用其baseUrl；主矩阵仍精确要求capture API=Mistral。没有偷偷把全矩阵改成固定路由，没有保留缓存信号隐藏边界。
- `tests/w08-wire-results.json` 两条独立证据：原共享路径=Completions且无session；显式prefer路径=Mistral且无session。前者是已裁决边界复现，不称原歧义被修复。历史失败摘要与W06完整失败仍保留；原主键挂专用mount后绿，matrix行带mount元数据。

### W06-F3：定义正确、实现错误，已修（1实例）

- 冻结依据：Mistral D14/atlas A09.03-D：先trim判非空再sanitize，故surrogate-only原块可以发合法空串；剩余chunks保序不合并。
- 客户端源码：MI:844–858分别发text/thinking chunk，与定义一致。
- 旧实现：`src/api/mistral_conversations/decode_messages.rs`再次以is_empty删已发送的块。
- 本轮只删除数组text/thinking路径的二次空串过滤，保留合法wire空块及顺序；不将“Rust不能表示坏surrogate”用作删合法空串的借口。
- 新增1项Rust单测断言text空串→thinking空串→ax三块顺序；历史 `mistral-conversations/req/w06-surrogate-order` 与新增 `w08-empty-thinking-order` 真实SDK均绿。oracle先trim再sanitize的旧正确规则不改。

以上没有出现需要推翻锁定TS语义的定义冲突；F2是经批准的路由前提澄清，F1/F3是实现修复。src仅改这两条根因及各自回归文件（4文件）。

## 4. 新finding W08-F4：Codex HTTP未调用专用wrapper

**定义正确、生产接线不兑现，保留6 FAIL。** 不属于本轮第2步获准修复的F1/F3，因此只留证据，不扩大src修补，不将E契约降级为None。

- 批准契约：family G37/atlas A04.08，completed/incomplete的Some(true/false)应发 `response.end_turn`；None省略；failed在CX:766–772先抛错，不宣称读取endTurn。CX:775–783确实读boolean。
- 专用实现：`src/api/openai_codex_responses/encode.rs:1–7`已把源endTurn传给共享encoder，原wrapper单测通过。
- **生产seam**：`src/mounts/protocol.rs:85–89`把Responses/Azure/Codex共同送到 `openai_responses::encode::encode_response`；该入口 `src/api/openai_responses/encode.rs:11–15`固定传None。wrapper并未接进HTTP路由。
- `node tests/w08-wire-checks.mjs`以未压缩JSON直接访问真实本地HTTP路由并检查SSE terminal：stop/length/toolUse×true/false六案均200且终帧存在，但均缺end_turn；None及failed六案绿。普通Responses/Azure各12案均不发end_turn并绿；另2案F2边界绿，合计38＝32绿＋6红。
- 此检查刻意绕开压缩只隔离HTTP编码接线，**不证明真实Codex SDK zstd已解阻或端到端通过**。SDK矩阵的12个endTurn新案仍全为T。
- 终帧、状态与期待逐案保存 `tests/w08-wire-results.json`；失败日志 `tests/w08-wire.log`。atlas导言与family §5已加当前未兑现说明，保持批准契约，不让W-07“wrapper已实施”误读为“HTTP已满足”。

六条失败主键：`openai-codex-responses/wire/endTurn-{stop,length,toolUse}-{true,false}`（完整展开在wire JSON）。建议另批一条Codex路由wrapper接线修复；无需与zstd/WS工程捆绑。

补充检查初稿曾未给Azure发送api-key，产生12条测试接线失败；依据既有Azure认证定义补上api-key后完整重跑，这些不是生产finding。最终38案只剩上述6条，不把初稿失败抹成协议T。

## 5. 最终三类结果与逐协议账

| duality API | 绿 | T | O18 | 总数 |
|---|---:|---:|---:|---:|
| openai-completions | 81 | 0 | 0 | 81 |
| openai-responses | 68 | 1 | 9 | 78 |
| azure-openai-responses | 69 | 0 | 9 | 78 |
| openai-codex-responses | 0 | 90 | 0 | 90 |
| anthropic-messages | 91 | 0 | 0 | 91 |
| google-generative-ai | 80 | 0 | 0 | 80 |
| google-vertex | 80 | 0 | 0 | 80 |
| bedrock-converse-stream | 89 | 0 | 0 | 89 |
| mistral-conversations | 79 | 1 | 0 | 80 |
| pi-messages | 81 | 0 | 0 | 81 |
| 合计 | 718 | 92 | 18 | 828 |

### 绿（仅限声明向量/投影）

旧主键新绿9条：AM `w06-r-aborted`、`w06-r-deferred`；Bedrock两个 `w06-vision-*`；Mistral两个 `w06-vision-*`、`w06-tools-only-strict`、`w06-retention-none`（显式mount）、`w06-surrogate-order`。没有旧绿转红。33个新增SDK案＝Bedrock8绿＋Mistral1绿＋Anthropic12绿＋Codex12T。

### 外部边界T（92）

- Codex zstd **89**：原77＋本轮12个endTurn案；capture=0、SDK报 `Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1`。CX:208–231,377–385压缩成功即发；mock `src/mounts/routing.rs:16–22` String extractor先拒绝。未改压缩/解压/传输，不据此判内容相等或不等。
- Node header ByteString **3**：Responses/Codex/Mistral的 `req/w06-unicode-session`，capture=0，`Cannot convert argument to a ByteString because the character at index 0 has a value of 55357 which is greater than 255.`。原Unicode输入保留，ASCII长session另测，不能换输入后宣称原案成功。
- F2显式路由是另一个调用方边界，但其有capture、可比较，**不是T**；不混进92计数。WS和ADC本轮未覆盖，不虚增为运行T实例。

### 裁决类非绿（24）

- **O18×18，非T**：Responses/Azure各9个corpus reply的opaque `reasoning_content`不在冻结reasoning-item JSON域。withCapture之后，phase=oracle抛 `Unexpected token 'r', "reasoning_content" is not valid JSON`，不是“发请求前失败”，也不是内容通过。维持拒绝，不批准summary降级，不剥签名后判绿。
- 每个API的9个名字：`reply-corpus-kahuwo-2`、`reply-corpus-claude2-2`、`reply-corpus-b4-claude-reason-2`、`reply-corpus-b4-deepseek-mixed-2`、`reply-corpus-b4-deepseek-codegen-2`、`reply-corpus-b4-deepseek-longreason-2`、`reply-corpus-b4-kimi-reason-2`、`reply-corpus-b4-kimi-toolerr-2`、`reply-corpus-b4-glm53-mixed-2`。完整18主键/阶段/差异在ledger，不合并掉实例。
- **W08-F4×6**：见第4节；真实HTTP终帧缺批准的bool字段，不能归zstd或定义投影。

## 6. 全部历史finding最终归宿

同名F编号必须带命名空间：下表的W06-F1不等于atlas候选F1，也不等于旧family F1。

### 管线主finding与atlas新发现

| ID | 最终归宿 |
|---|---|
| W06-F1 | 实现错已修；历史2案＋新增12案SDK绿 |
| W06-F2 | 经批准为路由声明前置条件边界；历史原共享路径仍复现，专用prefer补验绿；不称修了自动识别 |
| W06-F3 | 实现错已修；历史空text及新增空thinking保序绿 |
| N1 | Google/Vertex Q合法签名：W06修oracle；本轮保留签名/条件ID反例，默认矩阵无回归 |
| N2 | Responses Q ID/phase/namespace/JSON拒绝/图片：W06已对齐声明向量；不是任意compat通用oracle |
| N3 | OCC Q首个合法details及visible thinking：W06修oracle；既有反例/本轮fuzz绿 |
| N4 | Bedrock工具图片：W07修decoder，本轮修oracle并闭合2红 |
| N5 | Mistral工具图片/tools-only：W07修decoder，本轮修oracle并闭合3红 |
| N6 | PM模型extras/执行记录/cacheRetention/sections顺序：仍待owner扩模型，不伪称网络不携带 |
| N7 | 从actual复制期待/全局ignore：W06改独立oracle；本轮保持确定ID、total/cost/raw/error比较及mutation；只验证P时钟区间 |
| N8 | Google/Vertex缺/重复工具ID：P分支结构验证，唯一已发ID精确比较；不全局忽略ID |
| N9 | BR Deferred→end_turn，MI Deferred→stop/Aborted→abort→error：既有D策略保持；新拒绝策略未批准 |
| N10 | Codex endTurn：W07wrapper单测绿，但本轮发现HTTP接线未闭合，转W08-F4；不能标历史全闭合 |
| atlas候选F1 / O18 | 保留18个当前域拒绝finding；opaque降级需owner |
| atlas候选F2 | Bedrock图像补读＋oracle＋SDK闭合 |
| atlas候选F3 | Mistral图像补读＋oracle＋SDK闭合 |
| atlas候选F4 | Mistral tools-only补读＋oracle＋SDK闭合 |
| atlas候选F5 | Codex成功/长度endTurn契约保持；HTTP接线转W08-F4，failed不扩域 |
| atlas候选F6 | PM模型契约扩容待owner |
| atlas候选F7 | 新stop拒绝/投影策略待owner；不擅改当前行为 |
| T1 | zstd入站解压、解压大小/错误策略待owner；89案现测T |
| T2 | Codex WS upgrade/续传/状态机/已开始失败边界未实施未验证，不是zstd根因 |
| T3 | Vertex ADC离线凭证/token隔离未实施未验证；80绿仅普通key本地路径 |

### C01–C29 oracle历史登记

“声明域对齐”只表示现有fixture与冻结规则一致，不能外推未建模分支。W06报告的16个显式编号闭合统计仍为历史口径，不用本表回写其分母。

| ID | 最终归宿 / 剩余边界 |
|---|---|
| C01 | OCC Q surrogate已由W06 sanitize；本轮反例绿 |
| C02 | OCC Q details/opaque carrier已按首合法details、thinking-only规则修；现有向量绿 |
| C03 | OCC compat/strict/grammar/options仍限声明域；动态工具/模板/预算/任意sampling不是全域覆盖 |
| C04 | OCC R默认ID与前缀锚定独立预测已修，保留词与非前缀反例绿 |
| C05 | Responses Q三元sameModel、call/item/hash、phase/ns、非法JSON拒绝已修；不吞异常 |
| C06 | Responses Q视觉工具结果图文已修oracle，纯图不造多余文本 |
| C07 | Responses strict/schema和显式预算声明域已对齐；grammar/dynamic/任意options扩展仍非全覆盖 |
| C08 | Azure/Codex/Vertex默认接线与预算/session条件已建模；Azure部署全部配置、Codex SDK内容被T遮蔽，不算通用已验 |
| C09 | Google/Vertex三类合法Q签名已修，不删正确wire能力 |
| C10 | Google条件模型ID/视觉分支有新增反例；Simple预算与全部模型组合仍待覆盖 |
| C11 | Google R text/thinking均取最后非空签名已修，fuzz/单测保留 |
| C12 | AM每张error image原位替换、纯图前缀已修oracle |
| C13 | AM Unicode/配对/schema默认域已对齐；OAuth/managed/native工具变更仍非全域oracle |
| C14 | Bedrock Q redacted空串/非法base64删除/Claude name门控已修oracle |
| C15 | Bedrock surrogate/MIME/字节规范化已修oracle；非法MIME等输入拒绝不虚构成功 |
| C16 | 工具图像与reasoning envelope本轮闭合；strict意图/cachePoint/requestMetadata其他槽位仍待owner |
| C17 | Bedrock R有效redacted、空payload/default stop/未发元数据已按定义投影；任意坏base64/厂商混合流仍边界 |
| C18 | Mistral图像/tools-only本轮5红中的3案闭合 |
| C19 | Mistral Q先trim后sanitize/R相反次序：oracleW06已修，decoder漏空块本轮F3修 |
| C20 | Mistral aborted/deferred依既有G35投影；新stop策略未批准 |
| C21 | PM对象值投影不是sections顺序保真证明；模型扩槽位/cacheRetention/extras仍待owner |
| C22 | W06已移除got填期待及确定字段全局ignore；本轮保留mutation，Bedrock envelope仅定点JSON比较 |
| C23 | Responses legacy→v1与无call toolUse→stop已修oracle |
| C24 | 按协议清未发元数据/签名，不跨协议全局剥签名；现有向量绿 |
| C25 | AM unsupported拒绝文案F1本轮实现修复；Google native stop/无call规则维持 |
| C26 | 已修部分不翻案：OCC details、Mistral保序/read、AM schema/responseModel、Google input/read、PM usage均维持；新增空块根因另列F3 |
| C27 | AM R redacted文本固定占位、opaque data保留，W06已修 |
| C28 | Responses failed缺失unknown error/空no message/零usage已修oracle |
| C29 | OCC相同responseModel省略/重复工具ID命中旧slot已修oracle，当前向量绿 |

### 定义冻结登记D/G与更早finding

D01–D20和G01–G37是已冻结的定义修订/规则迁入，不是本轮新codec修复。逐项索引仍由 `definition-freeze.md` §7.2/7.3与 `tests/w06-rule-audit.json`保存。

| ID | 本轮最终归宿 |
|---|---|
| D01 | 八权威页/十协议＋一存根清点保持 |
| D02 | OCC不同ID E/重复ID D保持，当前反例绿 |
| D03 | AM非strict整体D、被删根键L保持 |
| D04 / G37 | Codex批准E契约已演进，但HTTP未兑现转W08-F4，不以旧L期待遮蔽 |
| D05 | Google/Vertex唯一ID E、缺/重复P保持 |
| D06 | 源write L/重建0 D分层保持 |
| D07 | Bedrock Q redacted空串保持，非R占位 |
| D08 | W07已补整reasoning扩展，本轮8个SDK反例闭合 |
| D09 | Google/Vertex parametersJsonSchema保meta保持 |
| D10 | Responses三元跨模型/item前缀/namespace条件保持 |
| D11 | Google仅纯图补占位，混合文字保持 |
| D12 | Google output饱和与input/read公式保持 |
| D13 | Mistral工具图像/tools-only本轮oracle闭合 |
| D14 | Q/R清洗次序保持，已发送空块实现差异本轮F3修 |
| D15 | PM五合法stop E/外域拒绝保持 |
| D16 | 输入契约拒绝不叫T；内容后流内失败不叫内容前T |
| D17 | Codex默认session头/body均截64保持；真实SDK受T |
| D18 | Google/Vertex native raw保留词可把源error投成stop/length，规则保持 |
| D19 | Responses reasoning item JSON不递归sanitize，调用点白名单保持 |
| D20 | Responses max truthy/effort-summary/sampling终值条件保持，非所有options分支已动态验证 |
| G01–G36 | 定义规则迁入已完成状态保持；Bedrock/Mistral的W07演进以现行页为准；126主规则的静态inventory不等于所有分支均动态覆盖 |

atlas B4收敛的更早集合亦不丢账：

| 历史集合 | 最终归宿 |
|---|---|
| final-ledger T63/O18/U0/M0 | 旧分母不回写：本轮T92/O18仍18；U0/M0只作旧快照事实，不表示当前无finding |
| fix-rust原23案R四案 | 归O18当前域拒绝，原4不是当前分母 |
| 原23案A-S一案 | AM非strict schema投影D/被删根键L；strict域不混同 |
| 原23案A-M七案 | responseModel条件曾为oracle漏项，已修，当前相关向量绿 |
| 原23案G四案 | input/read逆公式oracle曾错误，已修；write另属L |
| 原23案M-Q一案 | thinking保序microfix已修；本轮另补空chunk根因F3，不翻旧案 |
| 原23案M-T/M-U六案 | Mistral thinking/read encoder已修且当前绿；签名/write仍按定义投影 |
| fuzz Responses s50/107/195 | delta fallback oracle历史修复保持；本轮200种子双向全绿 |
| fuzz OCC s30/53/114/156/189 | details最终覆盖/合并oracle历史修复保持；专门SDK单测与fuzz绿 |
| Bedrock旧transport30案、usage拼写/1h | EventStream与read/write/1h旧修复保持；本轮Bedrock89绿不是新的压缩/ADC证明 |
| script F2 status/code/message | 旧registry错误类型推断修复保持；Node mounted script errors回归绿 |
| 旧family F1/F2/F3/F7 | deployment body、Codex无max/default instructions、Azure body-only session等条件保持；不混同本轮W06-F编号 |

## 7. 仍待owner事项（不得用本轮绿灯隐去）

| 事项 | 所需决定/工程与证据边界 |
|---|---|
| W08-F4 Codex HTTP endTurn接线 | 决定另批局部路由wrapper修复；6反例已持久化，完成后需复跑wire与SDK（SDK仍可T） |
| opaque降级 / atlas F1 / O18 | 选择外域签名拒绝或summary-item确定性投影；需要定义批准、保留原信息损失声明。现18红不是transport |
| PM模型扩槽位 / F6/N6/C21 | diagnostics/deferred/tool执行记录/details/usage/nestedCalls、cacheRetention、有序sections/extras的模型契约选择；wire有信息而Rust缺槽位，不是协议不可逆 |
| strict/constrainedSampling与其他未读终值 | strict终值不等于原prefer/require；grammar/dynamic工具、对象toolChoice、OCC budgets/template、Bedrock cachePoint/requestMetadata等需逐项定域/扩槽位，不能泛化本轮oracle |
| zstd / T1 | 入站body:String之前解压、压缩/解压大小上限、错误/资源策略；89个T当前尚无内容结论 |
| Codex WS / T2 | upgrade、session/account复用、previous_response_id/前缀缓存、开始前回退/开始后错误；本轮SSE不证明它 |
| Vertex ADC / T3 | project/location/凭证获取、离线token隔离；普通key的Express本地80绿不证明真实ADC |
| stop策略 / F7/N9 | 是否改变BR deferred/MI deferred-aborted的当前D规则，必须另批，不在本轮自造拒绝 |
| Node Unicode header | sessionId的真实HTTP Header ByteString域边界/调用方编码策略；原3案保持T，不以ASCII替换掩盖 |
| 覆盖深化 | mid-conversation/native dynamic tools、OAuth/managed effort、Simple上下文预算、全部reasoning模板/采样、任意onPayload、一般畸形SSE/repair、Codex service tier、真实AWS签名/浏览器/坏网络未穷尽 |

F2调用方现在已有可执行动作：在Mistral与Completions可能共享chat形状时显式使用专用prefer mount，而非等待启发式自动识别修复。

## 8. 验证、可复算证据与改动边界

| 命令 | 最终结果 | 证据 |
|---|---|---|
| `cargo test` | exit0，118 passed/0 failed | `tests/w08-cargo-test.log` |
| `cargo build` | exit0，新binary已用于SDK/HTTP终跑 | `tests/w08-build.log` |
| `cargo check --all-targets` | exit0 | `tests/w08-check.log` |
| `node --test tests/*.test.mjs` | exit0，41 passed/0 failed | `tests/w08-unit.log` |
| `node tests/duality.mjs` | exit1，718/110；110＝92T＋18O18 | `tests/w08-duality.log`、`tests/matrix-ten-results.json` |
| `node tests/fuzz.mjs` | exit0，1600/1600、crash0，默认seedCount=200 | `tests/w08-fuzz.log`；脚本原有目标仍为 `tests/w06-fuzz-results.json`（此文件现为W08复跑结果） |
| `node tests/w08-wire-checks.mjs` | exit1，32/6；6个W08-F4 | `tests/w08-wire.log`、`tests/w08-wire-results.json` |
| `node tests/w08-results-ledger.mjs` | exit0，2466主键唯一，795旧主键均保留，9新绿/0新红 | `tests/w08-ledger.log`、`tests/w08-results-ledger.json` |
| `node --check` 全部12个改动/新增mjs | exit0；源码文件均小于200非空非注释行 | `tests/w08-validation.json`、`tests/w08-final-inventory.json` |

分类器只识别已证实zstd/ByteString/O18机制，其他失败直接抛错，不兜底归T；wire失败也必须属于六个明确Codex主键，fuzz crash数组必须空。ledger保存每个主键/类别/阶段/差异及原JSON数组索引；原结果保留expected/actual，wire保留terminal/status。证据文件SHA256、精确changedFiles、锁定TS不变检查在 `tests/w08-final-inventory.json`。

src仅4文件：`anthropic_messages/encode.rs`、`encode_tests.rs`、`mistral_conversations/decode_messages.rs`、`decode_gap_tests.rs`。没有修Codex接线、没有扩模型、没有改TS。测试变更仅上述oracle、Mistral显式fixture接线、新W08向量/回归/账本与生成结果。定义仅改atlas导言及Bedrock/Mistral/family受影响条目，说明演进后验证状态与未兑现seam；W06/W07历史报告和冻结判决不回写。

根目录及祖先无Git元数据；`git status --short` exit128，无法以Git diff/index认证工作区或暂存区为空。**没有执行add/stage/commit，也未运行破坏性Git操作**；不能将此描述为git diff --cached通过。文件级SHA256清单替代变更核验，但不替代Git index认证。

**审阅门仍需独立reviewer。** 首先核对F1/F3修复与F2批准边界，再审W08-F4六条wire证据；owner未决项不因管线执行完成而关闭。若验收要求“全部协议无红”，本轮不满足；若验收要求“演进oracle对齐、三方裁决、全量终跑与诚实终账”，证据已齐。
