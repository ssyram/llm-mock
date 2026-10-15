# 独立冻结复审裁决

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

**最终判定：驳回＋必修改正清单。**

全部 D 项已逐条核验：**19 项通过、D14 未闭合**。G 抽查选取 Mistral 全部 **G27–G36**：**8 项通过、2 项存在错误**。另发现图谱与 canonical 的现行规则冲突，不能认可“剩余必修文档项 0”。

## Review

- **Correct**：三份重构页均具备编号六节；退役页明确权威迁移；绝大多数分类裁决符合锁定源码；历史 FAIL、实现缺口和未批准策略没有被伪称完成。
- **Fixed**：无。本轮只读，没有修改任何文件。
- **Finding**：4 项 P1、1 项 P2，证据及最小修正见下。
- **Merge verdict：BLOCK。**

### 核验口径

TS 引用根为 `<pi-mono>/packages/ai/src`；`src/**` 相对 mock-with-pi。TS 别名沿用报告：MI=Mistral、TM=transform-messages、GG=Google、GS=google-shared、GV=Vertex、SH=Responses-shared、OR=Responses、CX=Codex、OCC=Completions、AM=Anthropic、BR=Bedrock、PM=pi-messages、CS=constrained-sampling。

实际目录为 **8 份权威规格＋1 份退役存根，覆盖10协议**，不是10份独立规格；与图谱现行清点一致（`irreversibility-atlas.md:7`）。

## 1. D01–D20 逐项裁决

| 项目 | 结果 | 独立核验依据 |
|---|---|---|
| D01 | ✅ | 八份权威页均有编号1–6；`api/bedrock-mistral.md:3–8` 明确迁移至 Bedrock/Mistral。结构问题已处理；语义残项另列。 |
| D02 | ✅ | `OCC:499–555` 先查 index、再查 id；重复 id 可命中旧块。图谱 `:45–46` 已分 E/D。 |
| D03 | ✅ | `AM:1637–1650` 非 strict 仅发送 type/properties/required。图谱 `:168–169` 整体 D、被删根键 L 正确。 |
| D04 | ✅ | `CX:775–783` 能读 end_turn；`src/api/openai_responses/encode.rs:100–111` 不发送。`api/family-variants.md:139` 当前源值 L 正确。 |
| D05 | ✅ | `GG:195–201`、`GV:204–210` 缺失/重复 ID 使用 Date.now 与计数器。图谱 `:200–201,241–242` 分唯一已发 E、生成 P 正确。 |
| D06 | ✅ | `src/api/google_generative_ai/encode.rs:90–98` 不编码 write；`GV:240–249` 重建0。`api/family-variants.md:140` 源 L／派生常数 D 已分层。 |
| D07 | ✅ | `BR:1041–1046` redacted 不发送原 thinking；`src/api/bedrock_converse_stream/decode_assistant.rs:29–34` 重建空串。图谱 `:252` 正确。 |
| D08 | ✅ | `src/api/bedrock_converse_stream/decode.rs:39–42` 仅读 .thinking；`BR:1279–1332` 确有其他条件扩展。图谱 `:256` 已明确漏读。 |
| D09 | ✅ | `GG:395–397`、`GV:485–489` 均传 false；`GS:380–396` 对应 parametersJsonSchema。`api/google-generative-ai.md:129` 正确。 |
| D10 | ✅ | `TM:95–98,129–151` 三元同模型门控；`SH:257–325` foreign fc_ 可保留，namespace 仅 sameModel。`api/openai-responses.md:204` 已纠正。 |
| D11 | ✅ | `GS:285–315` 先按原拼接文本是否非空选文本/图片占位；混合文本不被占位覆盖。Google规格 `:133` 符合。 |
| D12 | ✅ | Rust encode `:90–98` saturating_sub，`GG:232–250` 再加 reasoning；最终 output=max(output,reasoning)。Google规格 `:137` 正确。 |
| D13 | ✅ | `MI:875–896` 发工具图片；Mistral decoder `:94–119` 仅读文本、只挂已有首 System。规格 `:61,64` 已如实登记。 |
| D14 | ❌ | Q/R 清洗顺序正确，但 E 域仍过宽。`TM:95–117` 会将跨模型非空 thinking 转成 text；图谱 `:278`、Mistral规格 `:27,66` 的 E 前提没有排除此情况。见 F1。 |
| D15 | ✅ | `src/api/pi_messages/encode.rs:64–79` 五合法终态原值发送；`PM:195–217` 原值赋回。图谱 `:314–315` E／成功文案 L 正确。 |
| D16 | ✅ | `CS:225–248`、Anthropic messages decoder `:87–90` 为输入拒绝；两个 Rust encoder 直接返回 Err；`BR:320–357` 可携 partial content 失败。AM规格 `:162`、Bedrock规格第4/5节已分观察点。 |
| D17 | ✅ | `CX:276–284,1676–1679` 默认头与 body 使用同一 clamped session；`api/openai-prompt-cache.ts:1–7` 按64码点截断。图谱 `:133` 正确。 |
| D18 | ✅ | Google Rust encode `:82–86` 非成功源 stop 选 raw/OTHER；`GS:441–466` 按 native 原因映射。family规格 `:141`、Google规格 `:138` 正确。 |
| D19 | ✅ | `SH:263–267` 直接回放 reasoning JSON；普通文本在具体调用点净化。Responses规格 `:177` 已改为白名单。 |
| D20 | ✅ | `OR:339–386` 的 truthy max、summary 回退、显式 effort 映射和 sampling 末写条件，与 Responses规格 `:206` 一致。 |

## 2. G 抽样：Mistral 全部10条

| 项目 | 结果 | 证据 |
|---|---|---|
| G27 | ✅ | 规格 `:61`；`MI:777–810`、CS strict 分支及 decoder `:115–119` 支持当前工具快照／tools-only缺口声明。 |
| G28 | ✅ | 规格 `:62`；`MI:812–839`、`TM:12–57`、decoder `:24–35` 支持净化、图片降级、空串与单text折串规则。 |
| G29 | ✅ | 规格 `:63` 正确限定 cross-model；`MI:238–267`、`TM:129–151` 支持算法和结果ID同步。**对应图谱未对齐，见 F2。** |
| G30 | ✅ | 规格 `:64`；`MI:875–920` 支持文本聚合、trim、错误前缀；decoder `:94–110` 确实只读文本且 isError=false。 |
| G31 | ❌ | max、reasoning、header/body规则基本正确，但 `:65` 加入了源码没有的 env long/默认short解析。见 F5。 |
| G32 | ✅ | 规格 `:67`；`MI:644–704` 确为 sanitize 后跳空、相邻同型合并、读取 delta.content。 |
| G33 | ❌ | 规格 `:68` 称逐段累积 name/arguments；`MI:731–749` 只在建块时取 name，后续仅累积 arguments。见 F3。 |
| G34 | ✅ | 规格 `:69`；`MI:555–573,616–628` 支持兼容字段优先级、缓存clamp及total回退。 |
| G35 | ✅ | 规格 `:70`；Rust encode `:6–9,28–36` 与 `MI:609–614,936–951` 支持缺省ID、aborted/deferred及错误文案规则。 |
| G36 | ✅ | 规格 `:71`；Rust encode `:28–35` 不使用源raw，`MI:633–636` 读取 finish_reason。 |

## 3. 三份重构页与图谱对齐

| 对象 | 结果 | 证据 |
|---|---|---|
| Responses | ✅ | 六节位于 `:3,35,97,156,228,257`；G01–G15 均在第4节。此次核验的 D10/D19/D20 与源码一致。opaque 的 D 标签被图谱 `:320` 明确限定为待批目标索引，规格 `:209` 明确当前拒绝，未当作已实现往返。 |
| Google | ❌ | 六节齐备（`:3,26,65,103,152,164`），但第4节 `:122` 与 `:134` 对 maxTokens clamp 条件互相冲突，见 F4。 |
| Mistral | ❌ | 六节齐备（`:3,18,36,55,83,91`）；但 A09.03 的 E 域、A09.04 与 G29、G33 的算法仍有错误。第7.6节“索引可定位”不证明语义一致。 |

## 4. Findings 与最小修正

### F1 — P1：D14 的 E 域漏掉跨模型 thinking→text

- **位置**：`irreversibility-atlas.md:278`；`api/mistral.md:27,66`；完成声明 `definition-freeze.md:569`。
- **源码**：`TM:95–117` 对跨模型非空 thinking 返回 text；MI 在转换后发射。
- **静态反例**：只有 model 不同的 assistant，内容为非空 ASCII thinking `"abc"`。不发生trim过滤或Unicode净化，但重建块类型为 text，不是原 thinking。
- **最小修正**：E 前提明确要求块类型未被跨模型转换；将跨模型 thinking→text 登记为 D，同步图谱、规格与复审状态。

### F2 — P1：A09.04 将条件性的ID规范化写成无条件规则

- **位置**：`irreversibility-atlas.md:280`，与 `api/mistral.md:63` 的 G29 冲突；报告 `:795` 将两者直接对齐。
- **源码**：`TM:136–141` 仅在非 sameModel 时调用 normalizer；`MI:860–863` 直接发送转换后的 block.id。
- **静态反例**：三元身份相同、ID=`call-1`。源码保持 `call-1`，不执行9字符规范化；图谱却称9字符规范化且原ID丢失。
- **最小修正**：A09.04 明确 sameModel 保持ID、cross-model 才运行算法，分开描述ID与交错位置投影。无需改源码。

### F3 — P1：G33 错称流式累积工具名

- **位置**：`api/mistral.md:68`；完成声明 `definition-freeze.md:615`。
- **源码**：`MI:731–741` 仅新建块时赋 name；`:744–749` 仅 arguments 追加和解析。
- **静态反例**：同index连续两段 name=`get_`、`weather`，源码保留首段，不产生 `get_weather`。当前mock单帧完整工具名不受影响，但不能据此声称一般流式name累积成立。
- **最小修正**：改为“name取建块首段；仅arguments逐段累积”，区分当前encoder域与一般wire行为。

### F4 — P1：Google canonical 同时保留两种 maxTokens 规则

- **位置**：`api/google-generative-ai.md:122,134`。
- **源码**：`GG:379–384` 原生 stream 非undefined直传；`api/simple-options.ts:18–20,35–46` 仅Simple链路做context clamp。
- **影响**：原生请求显式max超过可用context时，两段规则预测不同的wire值。
- **最小修正**：`:122` 限定为 streamSimple；原生stream按显式值。与G21统一，不改变实现。

### F5 — P2：G31 引入不存在的 retention 环境解析

- **位置**：`api/mistral.md:65`。
- **源码**：`MI:551–552` 只判断 cacheRetention!==none 与 truthy sessionId；Mistral文件没有 env long/default short解析，Simple base也直接透传retention。
- **最小修正**：删除“retention显式或env long否则short”，保留实际缓存开关条件。当前short/long同走启用分支，未发现由此产生不同wire的现行回归。

## 5. “不自批准”与未闭合项

- ✅ `definition-freeze.md:648–649,672,816` 与图谱末尾声明一致：opaque降级、PM模型/stop新策略仍未批准，独立reviewer gate尚未通过。
- ✅ W-06/W-07仅为候选；历史81 FAIL不是本轮新跑结果，也未要求本次清零。
- ❌ `definition-freeze.md:548,672,811–816` 的“剩余必修0”不成立：至少F1–F4仍是定义错误，不是已明确契约下的实现任务。
- 本次驳回**不要求批准任何遗留策略**；只要求修正文档并再次通过独立gate。

## 6. 必修改正清单与验证边界

冻结前必须完成 **F1–F4**，同步第7节完成状态；F5为已证实的P2文字修正建议。无需改源码、测试、fixture、ignore或矩阵。

本轮只读静态核验，未执行测试或网络探针。`watchdog_diff` 返回无有效Git HEAD基线，不能证明提交差异、暂存区或历史摘要。未抽中的G项没有获得本轮逐算法独立确认；作者既有12项测试通过不作为本轮执行证据。

## 7. F1–F5 文档修正完成状态（待再次独立复审）

第1–6节保留上述独立复审时点的证据与驳回裁决；本节是其后的实施回写，不把原❌改成未经审阅者确认的✅。本次包含F5的P2文字修正，五项均已对照锁定TS源码落笔；“已完成”仅指文档修正，不代表独立gate通过或正式冻结。

### 7.1 逐项处置

| 项目 | 完成状态 | 修正内容与当前定位 | 本次只读源码复核 |
|---|---|---|---|
| F1 / P1 | 文档修正已完成；待独立复审 | 图谱A09.03的E域及 `api/mistral.md:27,66` 明确排除跨模型块类型转换；A09.03-D及D14将跨模型非空、非redacted thinking→text登记为D。E还要求未过滤/净化、消息边界未合并。`definition-freeze.md` 第7.2节D14同步补修，不再把纯保序视为原块类型E。 | TM:95–117明确三元sameModel与thinking→text；MI:840–858发转换后的块。model不同、thinking="abc"的反例落在D域。 |
| F2 / P1 | 文档修正已完成；待独立复审 | 图谱A09.04分述ID与交错位置：sameModel保持原ID，仅cross-model执行9字符算法、结果ID同步；content后追加calls仍为位置投影D。`api/mistral.md:28,63` 与第5节同步限定跨模型原ID损失；`definition-freeze.md` 第7.3节G29同步。 | TM:95–98,129–151仅非sameModel调用normalizer；MI:238–267为具体算法，:860–863直接发送block.id。同模型call-1原样保持，不执行9字符算法。 |
| F3 / P1 | 文档修正已完成；待独立复审 | `api/mistral.md:42,68` 与图谱A09.09改为name只取建块首段，只有arguments逐段累积解析；明确同index的get_、weather不拼成get_weather。当前encoder每工具单帧完整name、合法非空ID和有效object args域不外推为一般wire的E。`definition-freeze.md` 第7.3节G33同步。 | MI:731–741仅新建块时赋name，:744–749仅追加arguments；`src/api/mistral_conversations/encode.rs:18–20`发单帧完整工具名。 |
| F4 / P1 | 文档修正已完成；待独立复审 | `api/google-generative-ai.md:122` 第4节第15条明确只有streamSimple经buildBaseOptions做context clamp；原生stream非undefined显式max原值写入maxOutputTokens，未指定省略，与G21（:134）一致。 | GG:305–321调用buildBaseOptions；SO:18–20,35–46执行clamp；GG:379–384显式值直传，故超过可用context的原生max不套Simple规则。 |
| F5 / P2 | 文字修正已完成；待独立复审 | `api/mistral.md:65` G31删除虚构的retention显式/env long/默认short解析；只判断cacheRetention非none及truthy sessionId，未指定retention和short/long均走同一启用分支。保留自动x-affinity受显式头覆盖抑制、mock body key优先的实际规则；`definition-freeze.md` 第7.3节G31同步。 | MI:551–552为缓存开关，:546发body key，:365–368控制自动头；SO:52直接透传cacheRetention，无env/default解析。 |

另外同步 `definition-freeze.md` 第1、7.1、7.5及7.7节：撤回初轮“可提交冻结”的现行声明，标记原验证为历史执行记录，明确独立复审已驳回且本次补修仍待再次gate。未批准opaque降级、PM模型/stop策略或W-06/W-07；未改历史FAIL和实验快照。

### 7.2 本次验证与证据边界

| 本次命令或检查 | 实际结果 | 证据边界 |
|---|---|---|
| `git status --short` | exit128：not a git repository | 无Git HEAD/index，无法给出Git diff或独立审计暂存区；本次未执行add/stage/commit。 |
| Python只读文档及源码条件断言 | PASS | 五份目标Markdown表格列数一致、无尾随空白；八份权威规格仍为编号1–6；图谱239行仍为E12/D126/L66/P32/T3。F1–F5修正标记与锁定源码条件、引用范围均通过静态检查；不是动态协议或全集语义证明。 |
| `node --test tests/canonical-ten.test.mjs tests/canonical-reply-projections.test.mjs` | PASS：12 tests / 12 pass / 0 fail，约406ms | 本次实际运行的既有纯canonical单测；没有新增或修改测试，不证明已知oracle/实现缺口已修复，也不代替F1–F5独立复审。 |
| Python只读受保护文件SHA256复核 | PASS：下列五棵树及根目录四个文件与本次修改前一致 | 对排序相对路径+NUL+内容+NUL计算树摘要；Cargo.lock、Cargo.toml、README.md、mounts.json内容也未变。证明这些受保护内容未改，不伪造全仓Git差异。 |

| 受保护树 | 文件数 | 修改前后相同SHA256 |
|---|---:|---|
| src | 87 | a36b52c0a90c5d4f79b1a768feccfbbc94ac72ee77eab8a18ab4d011b1357659 |
| tests（含fixture/矩阵） | 37 | 531a832c80d466e8b88ee66c64a7b85b9fe0fc73d0ad3385720b76b9e493ac89 |
| scripts | 11 | 1b4a0c505bba6fd34e91a89988663494199af4e6dae54fc324038dfb451835af |
| extensions | 1 | dd0b3dec1e7a29b0c0c5105d617d6b9bb93794cb7d16ee2e8d982553f7da0d0d |
| 锁定TS src | 243 | b5ff86777c0c1fd15280ab0cee1f4cbe7828922e9be717ce85fed9976af7bab0 |

changed-files（仅 `docs/design/mock-llm-server/`）：`irreversibility-atlas.md`、`api/mistral.md`、`api/google-generative-ai.md`、`definition-freeze.md`、`freeze-verdict.md`。tests-added/updated=[]。no-staged-files仅表示本次没有暂存动作；Git index不可用，不能声称已独立核验暂存区为空。本次未运行duality矩阵、网络探针、cargo、上游测试、WS/ADC，也没有改源码、fixture、ignore或矩阵。

**处置结论：F1–F5文档修正全部完成，待父线程送再次独立复审；原驳回/gate未通过状态不由作者自行解除。**