# 外接处理统一 segment：变更规约与论证

> 历史实施记录：本文只规定当时旧运行版及其证据，不再定义最新三管理单元语义。当前规范见 `../language.md`、`../runtime.md` 和 `../external-program-protocol.md`。历史 reader/resultEntry/end 规则不得反向约束新实现，修前失败与修后实测原样保留。

## 归属、来源和顺序

功能 owner 为 `playbook/`；本专项属于既有外接处理机制，契约根为
`docs/next-language/`。用户已裁决：删去独立 internal 概念，以 segment
统一计算与交互；reader 可以不消费，省略即原位；栈/PC 永不开放。先前
internal 禁止输出的设计是被该裁决替代的局部设计，不是新增 Q；v1 历史事实
不变。本次先检查过运行现场、既有 spec 与源码，随后为保护人工会话进行了
运行输入快照和薄入口切换，再写此规约，尚未进行语言产品实现改动。这里的
expectations 依据用户裁决与原协议抽取，不声称是在阅读源码之前编写。

## P：可判定性质

1. 解析时 `internal` 输入别名立即归一为 `segment`；编译 IR、envelope
   `role`、校验和执行路径均相同，无额外模式或来源字段。
2. `result` 是字符串，交本块有序 cases；`values` 经 save 写当前 vars；
   `reader` 仅在该键返回时替换。它们可组合；只返回 values 或 reader 也可
   完成，不拿缺失的 result 进行 matcher 匹配。纯计算不必发 assistant。
3. segment 可返回 assistant 交宿主执行并在后续请求续行；assistant 可与
   values/reader 组合，它们与本次回复一起生效；assistant 与 result 互斥。
4. aggregator 仍挂在 Response、等齐真实回执后裁决；它不是普通 segment，
   本批局部 toolResult 禁止 pass.to，现有 affine/匹配/故障规则不变。
5. 外接程序只能读协议 envelope、返回允许字段；continuation、帧栈、执行 PC
   既不作为 envelope 字段提供，也不能由输出字段接管。
6. 已开放的三路人工验收共享同一旧快照，不重启、不注入输入、不修改历史；
   后续新启动的无 pin 运行使用产品源码。

## 数据及状态契约

`ProgramBlock` 为 `{kind: segment|aggregator, command, with, save, cases?,
volatile, line, index}`；consumer 为 response 分组、编译检查、缓存依赖
版本与解释器。别名不进入枚举。`cases` 未声明时可以只返回 values/reader 或
assistant；一旦程序实际返回 result 而没有 cases，运行时以
`playbook_invalid` 硬停（外部返回值不能在静态编译时预测）。

程序输出为 JSON mapping，只允许 `result:string`、`values:mapping`、
`reader:JSON`、`assistant:Response`；result 与 assistant 互斥，assistant 只
允许 segment 且遵守既有 toolCall 约束。存在 values 时 save 所需字段必须
存在；无 values 则不做 save。`reader` 可为 null，是完整替换而非增量。
输入 `reader` 是独立的不透明值，不是 `readerPos`、`pc` 或 `frames`。
`readerPos` 由解释器消费宿主历史；`pc` 与 `frames` 由控制流维护。

## M/R：组件协作与函数规约

- `parseBlocks/makeBlock`：pre 为合法 fence 文本；把旧拼写规范为 segment
  后解析公共字段。错误映射/非法字段照旧抛 `PlaybookError`。分组、静态
  pass 目标、save、引用和 volatile 均只见规范 kind，故别名不能绕过检查。
  逐行/逐键循环索引单调增长且输入有限，终止。
- `parseProgramOutput/runProgram`：pre 为外接进程返回；callee 要求成功退出
  且 stdout 是单 JSON。post 为允许字段或 `playbook_program_error`；禁止
  状态键、非法类型和 result+assistant 的故障不降级。字段循环有限。
- `runSegment/runProgramBlock`：pre 为已编译 block、当前帧及可见前缀；
  `safeRefs` 错误直接返回，`runProgram` 故障直接返回；先应用返回的 reader
  与 values/save，再分派 assistant 或 result。无 result 的 values/reader 不
  裁决 cases；空对象沿用旧的缺失值匹配，保持旧故障行为；有 result 时要求
  cases 并调用 `evaluateCases`：首匹配可跳转，
  全不匹配/裁判故障硬停；无 assistant 则完成当前块。save 只针对声明字段、
  reader 替换不接触帧和 PC；引用与 save 循环均遍历有限 mapping。
- `advance/handleRequest`：segment 产 assistant 时保留该块为活动位置，
  宿主回显和真实 toolResult 被读取后再次调用；完成时清活动标记并前进或
  采用 cases 跳转。aggregator 仍依赖已完成的 `lastBatch`，按原有一次性
  消费；缺批硬停。`advance` 步数与 import 深度上限不变，故死循环终止。
- `keySpaceOf` 仅把规范 segment/aggregator 识别为外接依赖；别名解析前不
  有独立执行语义。缓存仍按内容和程序版本隔离，checkpoint 不开放给程序。

组合论证：词法归一让所有消费者获得相同 IR，因此无别名专属分支；输出字段
按各自作用域处理，结果判定只在存在 result 时触发，因此既能纯算亦能交互，
reader 的缺省与 PC/帧独立性保持。aggregator 另保分组/批次/affine 不变量，
不会因统一普通外接块而失去汇合职责。没有引入计算器、表达式或只读权限。

## 事前 expectations 与更新清单

- 规范拼写与旧别名：相同命令体有相同 IR、编译拒绝面、envelope role、行为；
  包含别名返回 assistant、volatile 与非法 pass/save/refs。
- 纯 result 和纯 values：不凭程序输出产生 assistant；reader 未返回则不变。
  values-only 与 reader-only 不触发 result matcher；空对象维持旧 matcher 行为，
  不将既有失配降为成功；明确 reader 可替换为对象
  或 null。result 无 cases 硬停；case 不匹配、坏 JSON/非法字段仍硬停。
- assistant、values、reader 组合：首回复实际含工具调用、值与 reader 写回，
  续行见相同 reader、再以 result 正常完成；回显与真实工具回执不得伪造。
- reader 的可控修改不会改变执行 PC、帧栈或 transcript readerPos；输出栈、
  PC、continuation 等协议外字段必须故障。
- agg 局部 to 禁止、真实整批回执、默认 toolResult、空 say、有序 matcher、
  动态 ID、import 作用域、volatile 等旧回归均保留；静态 IR 不臆测外部结果。
- 拟更新：`overview.md`、`language.md`、`runtime.md`、
  `external-program-protocol.md`、`expectations.md`、`playbook/README.md`；
  `lang2/parse-blocks.mjs`、`advance.mjs`、`program-steps.mjs`、
  `external.mjs`、`compile-checks.mjs`、`cache-space.mjs`；`examples2/` 和
  `tests2/`（仅产品集成的 independent 预期，保留旧别名正例）。
- 独立来源 `target/playbook-next-QiJ8sY/independent-tests/` 不修改；本轮不提交。

## 后续实测失败：外接进程输入关闭竞态（修复设计）

原实现自述 target 31/31 是当时的事实，不代表最终复验：parent 随后在其并行
运行中执行 `PLAYBOOK_ROOT=.../playbook TMPDIR=.../target/test-artifacts/segment-unification-tmp npm --prefix .../playbook/tests2/independent run test:target`，实际 exit 1，29/31。dependency-version 第二次报告 `spawnSync /bin/sh EPIPE`；其原工件
`target-cache-rework-1794916449972-31312/dependency-version/dependency-observation.json`
已有 `["v1","v2"]`，脚本从不读取 stdin。另一个 value-reference 失败只保留
`calls(reply)[0]` 缺失的 TypeError，未保存原始 reply，不能把它断言为 EPIPE。

修复前的受控实测见 `target/playbook-three-harness-ZXUCNo/segment-unification-recovery/`：
真实 dependency 脚本副本与 structured-value 脚本分别在 4 MiB envelope 下均有
`error.code=EPIPE, status=0, signal=null`、合法 stdout、空 stderr；独立
value-reference 完整请求用文件 stdin 也记录到程序 EPIPE 错误 JSON。原始
127 字节 value-reference 输入以并发 4、60 次复跑全部成功，故 parent 的第二项
原始失败根因仍未实证。另一次向 `mock2` 管道送 4 MiB 触发独立的 stdin EAGAIN，
该人工放大输入问题不作为 parent 失败证据，不纳入本次修复。

此问题源于共享外接执行器早于本次 segment 统一既有的错误分类：当进程成功
退出、输出有效，但自己提前关闭 stdin 时，`spawnSync` 仍可报告写端 EPIPE；
现有代码把任意 `result.error` 当启动失败。用户未改变外接协议或 Q。最小
P/M/R：`program-exec.mjs:runExternalProgram` 与 `judge-exec.mjs:runJudgeCommand`
只有 `error.code === EPIPE ∧ status` 为已知整数 `∧ signal === null` 才按
已取得的退出状态分类：`status === 0` 继续既有输出处理，非零立即按退出码
故障；所有其他 error、超时/信号仍故障。v2 JSON 与 v1 segment
JSON 仍由各自 parser 校验，judge 仍只接受 pass/fail，v1 aggregator 仍按既有
自由文本协议处理。无重试、不改脚本/fixture、不保证脚本实际消费全部输入。

正确性：成功退出和无信号是受控允许输出处理的条件；已知非零状态以退出码
硬停，未知状态、信号及其他错误沿原错误路径。成功时只忽略对已关闭 stdin
的写端错误，仍经过各调用方原有输出校验和状态处理，
故不会放过非零/超时、坏 JSON、judge 非法结果或其他 spawn 错误。回归必须
覆盖真实不读 stdin 程序/判断器、非零、超时、坏输出及 v1/v2 调用面，且
保留 parent 两项测试的原断言。完整 target 仍须在并行负载下重新执行；
测试结果在修复后追加，不覆盖历史或 parent 的失败记录。

## 首次实施时的历史对照与证据（未提交，非 parent 后续复验结论）

| 范围 | 本次实际更新 | 验证 |
|---|---|---|
| 解析/编译/缓存 | `parse-blocks.mjs` 归一别名，`compile-checks.mjs` 只检查规范 kind 并处理可省略的 aggregator cases，`cache-space.mjs` 追踪规范 kind | 新聚焦 27 例、独立 IR 37 例、target 31 例 |
| 外接/续行 | `program-steps.mjs` 共用外接调用及写回；`advance.mjs` 删除独立分支；`external.mjs` 沿用字段和角色校验 | 新聚焦覆盖冷热续行、values/reader/空对象、故障、完整聚合批；core 等共 50 例 |
| 样例和适配 | `examples2/loop-import.md`、`full-showcase/showcase.md`、`functions/round.md` 使用 segment；现有三路仅按 cache pin 经薄入口读取同一旧快照，无 pin 使用新版 | showcase/adapter 本地 24 例；非真实三宿主验收 |
| 独立预期 | 产品集成副本 `contract/expected-static-ir.json` 等把旧 kind 规范为 segment；`oracle/project-static-ir.mjs` 不再认可独立 internal IR；原输入别名与动态义务保留 | 独立 IR 37、target 31、reference 19；原交付目录不改 |
| 文档 | 本文件及 `overview.md`、`language.md`、`runtime.md`、`external-program-protocol.md`、`expectations.md`、`playbook/README.md`、showcase README | 与本文件 P、实现和测试反向逐项归并；v1 主体不改 |

首次实施时下列命令退出码均为 0；parent 后来实际测得 target 29/31 的
exit 1 见上节，该新结果不能用此历史记录覆盖。首次完整输出位于
`target/playbook-three-harness-ZXUCNo/segment-unification-tests/`：

- `node --test playbook/tests2/{segment-unification,core,functions,cache,judge-envelope}.test.mjs`：50/50。
- `npm --prefix playbook/tests2/independent run test:api`：37/37；设置
  `PLAYBOOK_ROOT` 与 `PLAYBOOK_COMPILE_COMMAND_JSON` 指向本仓 `mock2.mjs`。
- 同一环境 `npm --prefix playbook/tests2/independent run test:target`：31/31。
- `npm --prefix playbook/tests2/independent test`：19/19。
- `node --test playbook/examples2/full-showcase/tests/*.test.mjs`：24/24，本地模拟。
- `node --test playbook/tests/*.test.mjs`：v1 64/64。

测试临时目录设置在仓内 `target/test-artifacts/segment-unification-tmp`。本轮
`try_load_skill_or_prompt` 无法解析 `/qpdi`、`/workflow`，因此直接完整读取
本机已安装的 `prompts/current/{qpdi,workflow}.md`；无额外审查链。既有工作树
含他人 staged/dirty 内容，本轮没有 stage、commit 或 push。

三路当前旧主剧本为
`target/playbook-three-harness-ZXUCNo/frozen-showcase-common/playbook/examples2/full-showcase/showcase.md`，
SHA-256 `b7d86a264d409e052e5a548270816b7d8f1f1ad6d93fa0facee2ca842ae87024`。
快照只读，借逻辑路径映射保持旧缓存 key 与 continuation 路径；旧→快照缓存
命中曾在独立 scratch 缓存实证。真实三宿主人工验收未运行，不能由上述本地
结果推断通过。

## 后续修复与复测实录（未提交）

- 源码仅修 `program-exec.mjs:runExternalProgram`、
  `judge-exec.mjs:runJudgeCommand` 的 EPIPE/退出码分类；新增
  `tests2/external-stdin-epipe.test.mjs`；同步本专项、外接协议与本 expectations。
- 新回归的修复前版本实际 2/7、exit 1，记录在
  `target/playbook-three-harness-ZXUCNo/segment-unification-recovery/regression-before.log`；
  修复后扩展为 8/8、exit 0，见 `regression-final.log`。反例保留非零 7、超时、
  信号、输出上限、启动失败、坏 JSON 和 judge 非法输出；同时覆盖 v1/v2。
- 修后与另外四组本地 suite 同时并行：parent 同入口的完整 `test:target`
  exit 0、31/31；core+新旧回归 58/58、IR 37/37、本地 showcase 24/24、v1
  64/64；全部 exit 0，逐组输出为同目录 `parallel-*.log`；这是实现者的复测，
  不替代下节父线程实际运行记录。
- `probe-value-reference-pre-fix.json` 保存了受控完整请求错误 JSON、进程
  status/signal/stdout/stderr；`probe-value-reference-after.json` 保存相同
  4 MiB 条件下修后的成功回复。父运行第二项原始 reply 不存在，所以其根因
  仍不可回填断言为 EPIPE。
- 旧快照中的 `program-exec.mjs`、`judge-exec.mjs`、主剧本和三个 pin 的
  SHA-256 在修复前后相同；未修改它们，也未操作三路人工 TUI。因而当前三路
  冻结运行仍有旧 EPIPE 竞态风险，修复只对产品新版/后续未 pin 运行生效。

## 父线程最终实跑

父线程亲读统一解析、共用执行器和新增用例后，同批并行执行以下五组本地
测试；全部退出 0，没有通过缩小选择、串行化或修改原断言覆盖此前失败。
`PLAYBOOK_ROOT` 指向本仓 `playbook`，适用测试的 `TMPDIR` 为仓内
`target/test-artifacts/segment-unification-tmp`；实际命令使用绝对路径。

| 入口（仓根相对路径简写） | 实际结果 |
|---|---|
| `npm --prefix playbook/tests2/independent run test:target` | 31/31，exit 0 |
| `node --test playbook/tests2/{segment-unification,external-stdin-epipe,core,functions,cache,judge-envelope}.test.mjs` | 58/58，exit 0 |
| `npm --prefix playbook/tests2/independent run test:api` | 37/37，exit 0 |
| `node --test playbook/examples2/full-showcase/tests/{showcase,host-binding,language-edges}.test.mjs` | 24/24，exit 0；本地合成宿主 |
| `node --test --test-concurrency=1 tests/markdown-playbook.test.mjs` | 64/64，exit 0；v1 |

`git diff --check -- playbook` 同样退出 0。这完成本次统一与执行器修复的本地
交付验证，不代表三宿主人工验收通过，不闭合缺失原始回复的第二项旧失败
归因。三个已有 cache pin 由父线程读取确认为同一旧快照入口；父线程没有
向 TUI 输入、重启或应用新版，当前旧快照风险仍按上节保留。未 commit/push。
