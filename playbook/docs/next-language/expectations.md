# 简化契约与实验要求

本清单定义 `mock2.mjs` 的验收义务。测试运行、业务终态和对偶结论分别报告。

## 必须能观察的语义

1. 管理 IR 只有 RV、User、Segment。label 是属性，aggregation 是 Validation 内部处理者；别名和控制动作不能伪装出额外管理节点。
2. 首行 `$label` 不进入正文/工具参数；两种 call 形式产生同一调用，原生名为 tool 的参数不与工具名混淆。RV 内部 label、未知/重复/跨函数目标被明确拒绝。
3. 空 say 保留实际批边界；相邻工具同一 Response；省略预测仍接真实回执；乱序按 ID 归属，缺失/重复/未知回执不能提前推进。
4. 纯 say 自然停；其后 Segment 不偷跑，新用户才激活。重发相同 prefix、cache restore 或工具回执不充当新用户。
5. User 不是 Validation。纯 say 后 User 不多发空回复；工具批之后 User 必要时空回复停止；连续 User 各需新的输入。函数首 User 不多要求一轮启动。
6. Segment 整单元入口与 Aggregation 首次 Validation 入口不同。Aggregation 可以继续后续完整单元；普通函数/跳转仍不能进入 RV 内部。本批后继权与局部结果不可冲突。
7. 文件调用、参数默认值、局部隔离、EOF 返回和循环有效；计算走外接，存取不 eval。整体引用保结构值，混合文本是替换；预算能结束死循环。
8. 全文输入按一次请求写只读 JSON，小 envelope 传文件与实际阅读位置；10MB 特殊字符/结构数据不丢失。返回 pointer 改变真实消费；省略保持；外接拿不到执行栈/PC 通道。
9. result/values/pointer 可用于内部处理；assistant 统一遵循有无工具的自然 turn 语义。没有 cases 就不做额外匹配，不强迫 otherwise；坏进程或协议输出仍硬停。两类外接入口不互换成同一种执行语义。
10. 普通 match 可直接 atomic，也可 translation→atomic；system/compaction 是数据源，没有新控制节点。Translation 数据与 predicate 真假不能混淆。
11. 缓存冷暖/重复/分叉可观察结果一致；必须实际观察产品 restore，不能把传 cache-dir 当命中。保留真实可见元数据，volatile、TTL、存活请求租约与独立清理不退化。

## 实验以多项为主体，不把所有机制堆进主例

用少数正反场景承接以上义务；主例只呈现业务顺序，帧/reader/cache 自检放对应测试。实验者先写预期，再对接实现 API；静态 IR 只观察真实结构，不能按样本名分流或推算外部结果。

统一使用已有 `playbook/tests2/run-local-suite.mjs` 完整入口。实际选中的文件/命令/用例、排除理由、退出码、计数、时长及原始失败必须记录。空集合拒绝，失败不阻止余用例运行；不能缩小选择或把 import 错误叫不可用来造绿。

### 真实 Pi 对偶

运行隔离 Pi + 本地 Mock，读取真实 session JSONL 和每次 provider capture。对每个真实 request frontier，比较独立业务期望、实际历史及实际下一 Response。保留各次完整 system/tools/options，不用第一份请求覆盖后续。

分别测试修复、保留、自然输入和非法启动等分支；检查真实工具、批边界、唯一 ID 和产物，不只比最终状态。独立变造正文、参数、ID、结果，须被明确拒绝且不执行变造工具。所有失败先保存原始请求/回复及进程状态，再访问工具字段，不能只留下 undefined.arguments。

宿主确实丢失的时间/usage/空 text 块/toolName 等投影须逐项有证；不能删除正文、参数或 ID 来比较。功能对偶与 cache 机制分项记录，不将 cache miss 谎报成输出不一致，也不因它失败就跳过其它分支。

### CCA 代表性目标

最新版范式以 `.pi/moc18a/` 的完整原生 OC 实验为代表性目标，而不是只做玩具对话。Playbook 应读取外部合法有限 callgraph，不写死 N、图形或 seed，跑完全量 Analysis→EqClass 与最终交付；开局解析 `para:XX`。用户已裁定：未提供或小于 1 时不额外传 `--para`，使用配置中的有限默认并发；默认配置为 2。显式正整数才覆盖配置。不能把小于 1 翻译成无限并发、0/负数下传，或静默钳成 1/2。

测试须实际执行生成的命令并检查 `--para` 是否出现。用一个非 2 的配置默认值证明继承行为，避免把硬编码 2 误报为沿用配置；同时断言真实调度响应中的已解析并发值。该策略只涉及业务参数适配，不增加语言节点或引擎专用语法。

对偶是可观察行为的双模拟，不是 JSON 状态逐字段相等。从对应初态出发，两侧的派发、接受/拒绝、图变更及理由、阶段门和交付应能相互匹配，且匹配后仍处于对应状态。运行 ID、内部重放、实际耗时和不影响业务的调度顺序不比相等。固定输入时禁用随机加点、加边，固定请求等待 0.5 秒；随机运行只验证各自的业务完成与不变量。最终产物一致本身不能证明全轨迹双模拟。

新测试另建 lane/socket/端口/workspace，经真正 OC TUI 输入 start 触发，不用后台 prompt_async 代跑；仍使用真实 FSM/子 session/生成门禁命令，worker 独立等待 0.5–3 秒。旧 ready TUI、旧服务与证据只读，OC/FSM/冻结产品/共享系统不改。

## 历史与当前结果

旧版完整基线为 `target/test-artifacts/playbook-local-suite/suite-NXb4ae/results.json`：语法、29 个模块入口和三条既有真实 Pi 入口通过，full-showcase 入口失败；不能把它说成新三单元版本通过。

新隔离副本经父线程直接运行 `product-contract.test.mjs`、`dataflow-contract.test.mjs`、`static-ir.test.mjs`，16/16、零跳过、exit 0；包括 10MiB 文件与 pipe 路径、实际阅读推进和手写 IR 预期。Aggregation 夹具原先排除当前指针的结果，已修正并保留实读后续结果的断言。此短测本身不等于长全套或真实 Pi/OC 目标已通过。

父线程随后执行新版完整入口：`implementation/target/test-artifacts/playbook-local-suite/suite-r1JIV4/results.json` 实际选择并记录 35 个入口，34 通过、1 失败。六个真实 Pi 场景全部通过；五个正例各有 10 个 frontier、30 次重放、19 次真实缓存命中，四类变造均拒绝且工作区不变。剩余失败为 v1 篡改页用例，外接错误摘要在根因前截断，须保完整 stderr 后判断，不能只改断言。另一次误排的重复运行已取消，部分工件不计作完整验证，见任务工件 `parent-core-suite-receipt.json`。

[CCA 原生 OC 实验](../../integrations/cca/moc18a/README.md)已有固定输入实跑：六节点三边，两侧完成两阶段，9 个 worker 全部接受，最终图、接受目标、Mock 选择记录与 10 份交付物一致。新侧采集器缺部分时间线；未由本次数据证明双模拟或任意图规模。

原 resultEntry 普通跳转、独立 end/label/match 块、装饰性 opaque reader、只准工具型 assistant、有 result 必须 cases 等旧约束不再定义新语义。测试应以新裁决承接原能力或反例，明确说明预期变化，不偷偷删除守卫。v1 的历史测试仍按 v1 规则执行。
