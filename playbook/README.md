# playbook — mock 剧本项目（根级伴随项目）

本项目是 mock-with-pi 仓的根级剧本项目，包含两代能力：

- **v1（本 README 主体）**：Markdown 剧本 mock（原 `scripts/mock-scripts/markdown-playbook/`，已整体迁入；旧路径仅余薄 wrapper `mock.mjs` 供既有挂载命令兼容）。
- **三单元语言**：`mock2.mjs`；函数体只有 RV、User、Segment 三种管理单元，label 为属性。见 [语法](docs/next-language/language.md)。
- **CCA 原生 OC 实验**：见 [`integrations/cca/moc18a/`](integrations/cca/moc18a/README.md)，依赖外部本机环境。

运行产物写 `target/test-artifacts/`（gitignored）。项目教训见 `LEARNINGS.md`。

## 三单元运行入口

`ManagementUnit := RVUnit | UserBlock | SegmentBlock`。User 不属于 Validation；
Aggregation 是 RV 的验证处理者，不是第四种管理单元。执行与外接数据流见
[`docs/next-language/overview.md`](docs/next-language/overview.md)。本文后半仍说明 v1。

## 本地完整测试入口

从仓库根目录运行 `node playbook/tests2/run-local-suite.mjs`；加 `--list` 仅打印
选择而不执行。入口动态发现活动 `*.test.mjs`，并执行语法检查、v1/v2 本地
测试、独立契约、三挂载合成 HTTP、v1/v2 真实 Pi E2E、既有及 full-showcase
真实 Pi 对偶。它先打印实际命令/用例/排除范围，再把逐项状态、退出码、计数、
耗时及原始日志写入 `target/test-artifacts/playbook-local-suite/`；任一失败、
依赖不可用或空集合不报全套成功。详细契约、实测边界和当前真实 Pi 缓存命中
问题见 `docs/next-language/subplans/pb-2-pi-duality-suite.md`。

自动 Pi 使用本地 mock 随机端口与私有 `target/` 工作区，固定 bash 的
`--approve` 仅限这些独立 headless 会话；不使用人工 TUI，不连接真实 provider。
三挂载 HTTP 测试是合成请求，不代表 OC/CC 人工验收。

## next-language（v2）执行命令

```sh
node playbook/mock2.mjs --playbook playbook/examples2/loop-import.md --compile   # 仅解析+编译检查
echo '<统一JSON>' | node playbook/mock2.mjs --playbook playbook/examples2/loop-import.md
node --test playbook/tests2/*.test.mjs                       # core/函数/缓存/外接协议等
node playbook/tests2/pi-e2e2.mjs                             # 真实 Pi + 本地 mock server 小 E2E
# 独立契约测试（GPT 交付的一次性集成副本；原文在 target/playbook-next-QiJ8sY/）
PLAYBOOK_ROOT=$PWD/playbook PLAYBOOK_COMPILE_COMMAND_JSON='["node","'$PWD'/playbook/mock2.mjs","--compile-observations","{playbook}"]' \
  npm --prefix playbook/tests2/independent run test:target   # 目标运行时与缓存
PLAYBOOK_ROOT=$PWD/playbook PLAYBOOK_COMPILE_COMMAND_JSON='["node","'$PWD'/playbook/mock2.mjs","--compile-observations","{playbook}"]' \
  npm --prefix playbook/tests2/independent run test:api      # 编译观察 IR 对齐
PLAYBOOK_ROOT=$PWD/playbook node playbook/tests2/independent/jobs/run-real-pi.mjs   # 原代表剧本真实 Pi 对偶
node playbook/tests2/independent/jobs/run-full-showcase-pi.mjs                      # showcase 六个真实 Pi 场景
```

---

# Markdown playbook mock

一个相对独立的 mock 模型剧本功能：用一份 Markdown 文件声明从上到下的有限
对话剧本，通过 mock-llm-server 既有脚本契约（stdin 统一 JSON → stdout
AssistantMessage / `{"error":{...}}`）挂载，真实 Pi（或其他 harness）执行
工具，本模块只负责解析、输入匹配与回复生成。不侵入 Rust 协议层。

## 块语法（v3：response 分组 + aggregator/segment 外接程序）

- 标题（`#`…`######`）与块外 prose：只给人读，用于解释与错误定位，
  **绝不**成为 assistant 输出。`<a id="ID"></a>` 整行是**锚点**声明
  （同样不输出），供 `pass.to` 跳转，规范形式为裸 ID（`to: 完成`），
  兼容写一个前导 `#`（`to: "#完成"`），其余形态解析期报错；锚点不能声明在
  response 组内部（组只能整组进入）。
- ` ```say `（别名 ` ```assistant `）：块内原文（fence 内逐字节）即
  assistant 文本。**空 say 透明**：解析期丢弃——不产出文本、不构成分组
  屏障、不生成空 assistant 消息（也不作为 user 块前的合法屏障）。
- ` ```call <toolName> `：块内 YAML mapping **直接**就是工具参数。工具名与
  参数名必须用宿主真实提供的名字（Pi 的 bash 工具：`command`，可选
  `timeout`）。
- ` ```response ` / ` ```/response `：单行标记，把中间的 say/call/expect/
  toolResult 块组成一个**显式 response 组**：组内 say 文本合并为消息文本，
  组内全部 call 合并成**同一条** assistant 消息的多个 toolCalls（全局
  `mdp_<序号>` id），每个 call 可带自己的 expect/toolResult matcher（与紧
  前同组 call 配对）。组必须至少含一个 call；旧式裸 call 仍是每消息一个
  调用（完全向后兼容，旧示例/旧测试不变）。
- ` ```expect `：检查**前一个** call 的真实 toolResult。键（可同时出现，
  同时出现取 AND）：`exit_code: <非负整数>` 精确等值；
  `contains: <字符串>` toolResult 文本包含该子串。
- ` ```user `：匹配**下一条新** user 输入。两种写法：
  - 旧便捷 mapping：`exact:` / `contains:` / `any: true` 三选一（无 pass），
    与 v1 完全兼容；
  - **case 列表**（YAML list）：每项一个 matcher 键
    `exact: <string>` / `contains: <string>` / `any: true` /
    `judge: <命令>`（别名 `judger:`）/ `otherwise: true`，
    可选 `pass: {to: <锚点ID>}`。
- ` ```toolResult `：**case 列表**匹配块，消费/判断**前一个** call 的真实
  toolResult（因此必须紧跟同组 call，与 expect 互斥地占用该位置）。
  列表协议与 user 完全一致；`exact`/`contains` 匹配的是 toolResult 文本。
- ` ```aggregator `：块体 YAML `{command: <命令>, cases: <case 列表>}`——
  批次必经汇合点（详见下文）。` ```segment `：同一块形态，跨多轮外接
  子对话处理者（详见下文）。
- ` ```end `：显式正常结束屏障，无块体。执行到 end 时本轮组终止、指针
  直达剧本末尾，**绝不落入后续分支**；终止后不再生成任何调用。
  end 必须紧跟 say/assistant 块或 toolResult 块。
- `reply` 已合并进 `say`，写出 `reply` 即解析报错。

## 多工具批次与整批结果（response 组）

- 一个 response 批次 = 两条 user 输入之间的剧本片段。response 组内的全部
  call 合并成一条 assistant 消息（text + 多 toolCalls，`stopReason:
  toolUse`）；宿主执行工具后逐条回传真实 toolResult，**到达顺序不限**，
  每条结果按 toolCall ID 关联到自己的 matcher（expect 或 toolResult case）。
- **整批结果到齐再决定后续，不能先到先跳**：某条 matcher 命中带 pass 的
  case 也只登记，等批内所有 pending call 都有结果才应用唯一跳转/继续；
  部分结果时宿主就发模型请求 ⇒ `playbook_state` 硬停，绝不提前回复。
- 任何失配（expect 不符 / case 全不匹配 / 未知 ID / 重复 ID / judge 错）
  都是即时硬停，不消费、不推进、不再发任何 toolCall。

## AFFINE 跳转权（编译期强制）

同一 response 批次内（两条 user 输入之间）：

- **无 aggregator**：最多只有**一个 toolResult 块**可以声明 `pass.to`——
  统计的是【持有 to 的块数】，不是去重跳转目标，也不限制块内 to 总数：
  两个不同 result 块即使跳同一目标也非法；一个 result 块内部互斥 cases
  可 `to` 不同 ID，完全合法。
- **有 aggregator**：所有局部 result 块禁止 `to`；本批不允许 segment；
  至多一个 aggregator；aggregator 之后不得再有 call；aggregator 之前不得
  出现 end（提前终结绕过汇合）；早于 aggregator 的任何 case 不得
  `pass.to` 到它之后（唯一例外是 aggregator 自己的 cases）。违反任一规则
  都在解析期拒绝（`playbook_invalid`，消息带块位置）。
- 普通 segment 不收走前面的跳转权（不计入上述统计），也可以被锚点跳过；
  user 块的 pass 不受影响（它开启新批次）。

## aggregator：批次必经汇合点

```aggregator
command: node programs/aggregate-report.mjs
cases:
  - exact: 全部就绪
    pass:
      to: 完成
  - otherwise: true
```

- 由播放器（本 mock 进程）在**批内全部工具结果到齐、流程走到它的位置**时
  执行一次：stdin 是 JSON envelope
  `{context:{messages:<前缀>}, results:[{callId,tool,text,verdict}…],
  location:{…}}`——results 按剧本 call 顺序携带每条调用的**原始结果文本**
  与**局部匹配结论**（verdict；expect 为 `"expect ok"`，case 块为命中项
  描述，无 matcher 为 null）。
- stdout 即聚合结果字符串（去掉恰好一个结尾换行），交给同一套 case 匹配
  （exact/contains/any/judge|judger/otherwise + pass.to）决定本批唯一跳转；
  全不匹配 ⇒ `playbook_aggregator_mismatch` 硬停。
- 命令非零退出/超时/无法启动 ⇒ `playbook_program_error` 硬停，绝不
  fallback；stderr 进入诊断。命令必须确定性、无副作用（框架逐请求重建
  历史会重跑，不保证恰好执行一次）。

## segment：跨多轮的外接子对话处理者

```segment
command: node programs/fuzz-segment.mjs
cases:
  - exact: 探测成功
    pass:
      to: 成功
  - otherwise: true
```

- 处理者不限 Markdown（可外接 Python/JS）。播放器在每次模型请求时以当前
  transcript 前缀调用它；程序必须是前缀的**确定性函数**（续行/返回位置
  从前缀重建，每请求新进程、无 daemon）。
- 输出协议严格区分两种意图（二选一，键精确）：
  - `{"assistant": {content:[…], stopReason:"toolUse"}}` —— 向宿主生成
    assistant 消息继续交互（必须含至少一个 toolCall，id 非空、不以保留前
    缀 `mdp_` 开头、消息内唯一；纯文本消息会结束模型回合，拒绝）；宿主
    真实执行工具，toolResult 回到 transcript，下一次调用程序据此继续。
  - `{"result": "<string>"}` —— 内部完成返回值，交给同一套 cases 匹配，
    **绝不泄露为 assistant 消息**。
- 历史重建 = 用同一程序对前缀逐点重放并逐字比对（content deepEqual；
  宿主回放的历史 assistant 不保留原 stopReason，与 v1 同口径只比对内容）；
  不一致 ⇒ `playbook_segment_drift`。segment 跨越单个 user 回合：中途
  到来的 user 输入 ⇒ 硬停（不支持段内向人提问）。
- 程序故障（非零退出/超时/输出不合法）⇒ `playbook_program_error` 硬停，
  不 fallback。超时与 judge/aggregator 共用 `--judge-timeout-ms`。

## CCA result_ref 领域 kit（examples/，只读适配、无通用特例）

`examples/programs/cca-result-ref.mjs`（适配器）、`examples/programs/
cca-fixture-page.mjs`（合成取页器）、`examples/programs/cca-scc-walk-
segment.mjs`（分页游程 segment）、`examples/judges/cca-members-final.mjs`
（终页 judger）、`examples/cca/`（公开合成 fixture）与示例剧本
`examples/cca-scc-walk.md`。语义对齐 CCA `scc-members` 契约：

- 工具结果可能是 `result_ref` 封套（`{"result_ref":{"path":…}}`）；
  适配器解引用完整 JSON 再判断（整段或末行 JSON 候选，与 CCA tool_json
  同形）；不带 `result_ref` 键的对象本身就是完整对象（现网样本形态）。
- 封套若带 `sha256`/`bytes` 则逐一验证（防“合法 JSON 被篡改”）；缺
  path/坏文件/坏 JSON/校验不符 ⇒ **硬错误**（非零退出，judge 语义下转
  `playbook_judge_error`，segment 语义下转 `playbook_program_error`），
  绝不 no-match、不摘要降级。通用 matcher 不含任何 result_ref 特例。
- 分页游程：每一页都是 segment 发出的**真实 bash 工具调用**（取页器按
  cursor 返回封套），游程逐页校验分页契约（`page_start` 连续、
  `page_size===members.length`、`total` 恒定、成员不重复、
  `next_after`===末成员 id、末页 `next_after` 为 null 且闭合 total），
  用真实 `next_after` 游标走完全部页后写成员清单文件再返回。合成 fixture
  由 `cca-make-fixtures.mjs` 生成，不含真实 CCA 私有路径；真实样本仅
  单页完整对象（total 19/start 0/next_after null），不作为多页证据。

## 有序 case 语义（user/toolResult/aggregator/segment 通用）

- 同一输入（user 文本 / toolResult 文本）**按声明顺序**依次尝试 case；
  **首个匹配即消费该输入**；匹配成功且无 `pass` ⇒ 执行**块之后**的剧本
  （不是试下一个 case）；不匹配 ⇒ 同一输入试下一个 case；全部不匹配且无
  `otherwise` ⇒ no-match（user 落 `playbook_user_mismatch`，toolResult 落
  `playbook_toolresult_mismatch`，均不消费输入、不推进、不再发调用）。
- `otherwise: true` 必须是最后一项且至多一次，匹配一切剩余输入。
- `pass: {to: <锚点ID>}`：匹配后**前向**跳转到锚点处继续执行（第一版只
  允许前向跳转；解析期查重复锚点/未知目标/不合法目标/后向跳转）。
- 历史重建的确定性：框架逐请求从 transcript 从头重放，历史 user/toolResult
  会按同一顺序重跑同一组 case —— 这要求 `judge` 命令**确定性**（同样输入
  同样结论）。框架不宣称 judge 恰好执行一次（exactly once）。

## judge 外接命令（由播放器执行，不是 Pi 工具）

`judge: <CMD>` 是**可信本地脚本**命令行，由本播放器进程（mock.mjs）以
`spawnSync(..., {shell: true})` 执行，绝不作为工具交给宿主模型。契约：

- **cwd** = 该剧本文件所在目录（相对 `judges/` 路径直接可用）。
- **stdin**：一个 JSON envelope：
  `{"message": <当前待处理消息 role=user|toolResult，原样>,
    "context": {"messages": [<到当前消息为止的前缀，绝不包含未来消息>]},
    "location": {"playbook", "step", "kind", "heading", "case", "anchor"},
    "targets": [<本块所有 case 的 pass.to 目标>]}`
  历史重建时对消息 m 求值只给 `messages[0..m]`——judger 永远看不到未来。
- **stdout**：恰好 `pass` 或 `fail`（trim 后逐字相等；boolean 语义，
  与 pass.to 分工明确：stdout 只表态匹配与否，跳转目标在剧本里声明）。
- **退出码 0** 必需；非零退出 / 超时 / stdout 非法 ⇒ `playbook_judge_error`
  **立即停止**，绝不 fall through 到其他 case 或其他剧本；stderr 理由进入
  诊断消息。
- **超时**：每个 judge 进程有限超时，默认 **10 秒**，挂载时可用
  `--judge-timeout-ms <n>` 覆盖（同一 flag 同时覆盖 aggregator/segment
  外接程序——同一类由播放器执行的外部程序；重复传同一 flag 响亮失败）
  （外部进程必需边界，本模块不建 sandbox）。
- **副作用要求**：judge 只判断、无业务副作用、不开网络、不调真模型、
  可重入（框架逐请求重建历史会重跑判断器）。示例 judger 见
  `examples/judges/`，全部只读 envelope。

## 多剧本路由（可重复 --playbook）

```sh
node mock.mjs --playbook a.md --playbook b.md [--judge-timeout-ms 5000]
```

- 挂载多剧本时**每份剧本必须以 user 块开头**（否则挂载即
  `playbook_invalid`），按显式 argv 顺序对**首条 user 输入**求值：
  首个明确 match 的剧本被选中；no-match 才尝试下一份；judge error 立即
  停止（不落到后续剧本）；全部 no-match ⇒ `playbook_no_match` 协议可见
  错误。各剧本的判定（含 judge）因此可能对同一输入执行多次，必须无副作用。
- **归属保持**：选中后同一会话始终属于该剧本。逐请求新进程模式下归属由
  transcript 的**首条 user 消息**确定性重建（每轮独立得出同一结论），
  不依赖任何进程内变量或持久 daemon。
- **已知限制（如实声明）**：会话被宿主 compaction 改写、首条 user 消息
  不在 transcript 里时，归属无法仅凭现有输入恢复 ⇒ 返回
  `playbook_routing_unknown` 可见错误，绝不静默改判；非确定 judge 同样
  可能导致归属漂移（见上：judge 必须确定性）。

## 语义（沿用 v1）

- 从上到下顺序执行，无 goto、无循环、无隐式 retry、无 eval；剧本耗尽
  （或跨过 end）后再来请求/输入得到 `playbook_exhausted` 错误。
- 相邻的 say（含多条，空行合并）+ 紧随的 call 组合成**一条** assistant
  消息（text + toolCall，`stopReason: toolUse`）。宿主执行工具并把真实
  toolResult 回传后，剧本继续（expect 复检或 toolResult case 分支）。
- say 后面直接跟 user（或 end/剧本结束）时，该 say-only 消息即本轮最终
  回复（`stopReason: stop`）；解析期强制 user 只能出现在开头、say 之后、
  或 end 之后（开启下一分支）。
- 框架对每个请求启动全新脚本进程：进度不靠进程状态，而是每次从 transcript
  从头确定性重建（历史 assistant 逐项核对文本/toolCall id/工具名/参数，
  历史 toolResult 与 pending call 的 id/工具名关联）。这保证新 user 消息
  不会拿历史 user 重复匹配、toolResult 不会被重复消费。
- 任何失配（user/toolResult 不符 / expect 不符 / judge error / transcript
  漂移 / 未声明工具 / 路由失败）都返回协议可见错误
  `{"error":{"status":422,"code":"playbook_*","message":…}}`，消息含
  expected / actual / 所在步骤与标题；**不消费错误输入、不推进、不再生成
  任何 toolCall**，因此不会产生后续副作用。宿主 CLI（pi）非零码退出并展示。
- 挂载后第一个请求若带 system `toolsAdded` 声明，剧本里每个 call 的工具
  名都会对照声明校验，不匹配即报 `playbook_tool_undeclared`。

## expect exit_code 适配：观测规则与边界（Pi 1.5.2，以真实 E2E 捕获实证校准）

Pi bash 工具（实源码 `dist/core/tools/bash.js`）的原生返回形状：

- 命令以 N≠0 退出：`content` 文本为 `<output>\n\nCommand exited with code N`，
  输出为空时 output 段是占位符 `(no output)`。
- 命令以 0 退出：文本只有输出本身，无状态行。
- `structuredContent.exit_code` 只对 codemode 程序化调用者可见；pi-ai 的
  `ToolResultMessage` 没有该字段，不会随模型请求发送。

关键宿主边界（真实 Pi E2E 捕获实证）：**openai-completions 的 tool 消息
在厂商线上不携带 isError**，本框架解码后该字段丢失归 `false` —— 因此
isError 在这条链路上不可作为精确退出码来源。适配器规则（观测规则，
非无条件可靠，边界见下）：

1. 文本末尾（最后一个 `\n\n` 之后）命中 `Command exited with code N` ⇒
   判 exit_code N（Pi 1.5.2 对非零退出必追加该状态行，是本链路上唯一的
   精确码器信号）；
2. 末尾是已知无码状态（`Command timed out after …` / `Command aborted` /
   `Command terminated without an exit code`）或 `isError=true` 且无状态行
   ⇒ 判“不可判定”并明确失败，不给出数字；
3. 其余（无状态行、无错误标记）⇒ 判 exit_code 0。

可能误判/无法判定的边界（如实列出，不要把本适配当成无条件的真值）：

- exit 0 的命令若自身输出恰好以同样的状态行结尾，会被误判成 N；
- 无码错误在 isError 被协议丢弃且文本不带已知状态时，会落入规则 3 判 0；
- 超时/中止只能判“不可判定”，拿不到真实码；
- 这些均源于厂商协议不回传结构化退出码，属观测通道限制。需要严格区分时
  改用保留 isError 的协议（如 pi-messages）或避免边界输出；升级 Pi 后
  需重跑 E2E 确认文本形状未变。

## YAML 与依赖

块体用标准 YAML 解析（yaml 包，支持块标量 `|` / `>`、嵌套 mapping/list、
引号转义、注释；重复键按 DUPLICATE_KEY 拒绝），多行命令直接写
`command: |`。expect/user/toolResult/case 列表的键约束（互斥/类型/次序）
由本模块在解析后校验，与 YAML 能力无关。

依赖变更声明：本模块引入唯一的模块局部依赖 `yaml`，版本在
`playbook/package.json` 中**精确锁定**为
`2.9.1`（`package-lock.json` 同步锁定，`node_modules/` 被仓库 .gitignore
排除，不入库）。安装方法：

```sh
cd playbook && npm ci   # 或 npm install
```

依赖是模块局部的（Node 从本模块目录向上解析 `node_modules`），不侵入
Rust server，也不给仓库顶层或框架其他测试新增全局依赖。未安装时本模块
单测会以“Cannot find package 'yaml'”**响亮失败**而非静默跳过。

## 挂载与用法（可直接复制运行）

```sh
REPO=$(pwd)
SERVER=$REPO/target/debug/mock-llm-server

# 例 1：单剧本（分支 + judger）挂载
$SERVER add \
  "node $REPO/playbook/mock.mjs --playbook $REPO/playbook/examples/report-case-flow.md" \
  --name mdpcase

# 例 2：多剧本路由挂载（argv 顺序：先时间问询，再报告流程）
$SERVER add \
  "node $REPO/playbook/mock.mjs --playbook $REPO/playbook/examples/route-first.md --playbook $REPO/playbook/examples/report-case-flow.md" \
  --name mdproute

# pi 侧 provider baseUrl 指向 http://127.0.0.1:18000/mdpcase/v1（按协议选择后缀）
# 例如：pi --print --model mdpcase/mock-m "帮我准备一下 status.md 报告"
```

- `examples/report-case-flow.md`（分支示例，中文注释）：
  启动 `1` 或 judger 宽松识别报告请求 → say + 真实 bash 检查 →
  toolResult judger 按“已有完整 / 缺失”分支跳转（完整 → 跳“完成”锚点
  收尾，不写文件；缺失 → 询问用户）→ user judger 接受“好/可以/请补齐”
  等确认，否则 otherwise 跳“取消” → 真实 bash 创建并验证 → 分支 end。
  附带只读 judger：`examples/judges/report-request.mjs`、
  `examples/judges/status-verdict.mjs`、`examples/judges/confirm-create.mjs`。
- `examples/route-first.md`（多剧本路由示例）：短剧本，输入含“几点”即接管。
- `examples/report-flow.md`：v1 线性示例（旧便捷写法），仍然可用。
- `examples/multi-call-aggregate.md`（v3，中文注释）：response 分组两 call
  同消息 + 局部 matcher 不持 to + `examples/programs/aggregate-report.mjs`
  汇合唯一跳转（AFFINE 正例）。
- `examples/segment-fuzz.md`（v3，中文注释）：跨轮外接 segment
  （`examples/programs/fuzz-segment.mjs`）发两轮真实工具探测后返回内部值，
  cases 选锚点。
- `examples/cca-scc-walk.md`（v3，中文注释）：CCA result_ref 分页游程
  （见上文 CCA kit 一节）。

## 测试

前置：先安装模块局部依赖（见上）。然后：

- 单元测试 64 个（v1 的 18 个用例保留不变；v2 case/锚点/end 18 个保留
  不变；v3 新增 18 个 affine/response/aggregator/segment + 10 个 CCA
  result_ref kit）：
  `node --test playbook/tests/*.test.mjs`
  （由仓库 `tests/markdown-playbook.test.mjs` 接入框架自动发现入口，
  `node --test --test-concurrency=1 tests/markdown-playbook.test.mjs`）。
  覆盖：affine 反例（两个 result 块同/异目标均非法、一个块两个互斥 to
  合法、aggregator 批局部 to 非法、普通 segment 可被跳过）、多 call 按
  ID 关联与结果乱序、等全结果不先跳、aggregator 必经且看到原始+局部
  结果、程序故障硬停不 fallback、segment 跨进程重建/漂移/段内 user 拒绝、
  空 say 透明、judger 别名、flag 冲突响亮失败、CCA 封套解引用/防篡改/
  游标契约/篡改硬停。
- 真实 Pi E2E（随 `node tests/harness-e2e.mjs pi` 运行，需要 `pi` CLI 与
  构建好的 server；证据落 `target/test-artifacts/markdown-playbook/`）：
  v1 happy path + 错误路径无副作用；v2 四场景：缺失→问人→自然语言确认→
  创建、已有报告直接跳完成不写文件、拒绝取消、多剧本首选与跨进程归属；
  v3 五场景：多 call+aggregator（真实双探测文件、一条消息双 toolCall、
  唯一跳转）、跨轮 segment 两轮真实工具往返、segment 程序故障硬停无副作用、
  affine 非法剧本挂载即拒、CCA result_ref 分页游程（三页真实取页、游标
  =末成员 id、真实清单文件）。

## 限制（如实声明）

- 内容块 + 锚点 + response 分组/aggregator/segment；无循环/goto（锚点跳转
  仅 case 匹配后的前向 `pass.to`）；不支持 fenced 块嵌套（块内不能出现
  ``` 开头的行）。fuzz 循环/全局变量/通用 import 仍属需求讨论，未另造 DSL：
  有限 fuzz/跨轮操作由外接 segment 承接（segment 内部自定控制流，返回值
  回到外层 cases）。
- 未显式分组的旧式相邻 call 仍是每消息一个调用（兼容优先）；response 组
  才合并多 toolCall。segment 跨越单个 user 回合（段内向人提问不支持，
  硬停）；segment/aggregator/judge 之外的跨步骤数据传递没有可变全局语言，
  数据从 transcript 前缀或 envelope（如 aggregator results）取得。
- user 匹配只看文本块（string 或 text blocks join `\n`），图片块忽略；
  toolResult case 匹配的是工具结果文本（同 expect contains 的文本口径）。
- judge/aggregator/segment 程序必须确定性且无副作用（框架逐请求重建历史
  会重跑，不宣称 exactly once；重放成本随轮次线性增长）；多剧本归属依赖
  transcript 首条 user 消息，compaction 后以 `playbook_routing_unknown`
  显式失败（见“多剧本路由”一节）。segment 历史重建逐字比对 content，
  stopReason 不参与（宿主不保留）。
- 依赖 Pi 1.5.2 的 bash toolResult 文本形状（状态行 + isError 契约 +
  空输出占位符 `(no output)`）；升级 Pi 需重跑 E2E 确认。其他宿主的
  bash 工具若无相同状态行约定，非零精确退出码将按“不可判定”明确失败
  而不是猜。CCA kit 只在合成 fixture 与真实 Pi bash 上验证，未接入完整
  CCA/OClane 环境（不虚报）；封套 sha256/bytes 仅在封套提供时校验
  （现网 CCA 封套目前只带 path，适配器不伪造校验）。
