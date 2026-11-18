# design — D-frame：P / M / R

## P（本层设计必须满足的可判定性质）

- P.1 批次构成：一个 response 批次 = 两条 user 输入之间的剧本片段；
  显式 response 组内 say 文本合并 + 全部 call 合并为一条 assistant 消息
  的多 toolCalls；旧式裸 call 行为不变（兼容 P.7）。
- P.2 ID 关联：批内每条真实 toolResult 按 toolCallId 关联到对应 call 的
  matcher；到达顺序不影响判定；未知/重复 ID 即硬停。
- P.3 整批语义：批内全部 call 都有结果前不产生任何后续决定（不先到先
  跳、不提前回复）；部分结果时模型请求 ⇒ playbook_state。
- P.4 AFFINE：无 aggregator 批次 ≤1 个 toolResult 块持有 pass.to（按块
  计数）；aggregator 批次局部 toolResult 块禁止 to、禁 segment、≤1 个
  aggregator、aggregator 后无 call、aggregator 前无 end、早于 aggregator
  的 case 不得跳过它（其自身 cases 除外）。全部在编译期拒绝。
- P.5 汇合：aggregator 在批内全部结果到齐后恰好执行于其剧本位置；
  envelope.results 按剧本 call 顺序携带原始文本与局部结论；其 case 决定
  本批唯一跳转；无匹配 ⇒ mismatch 硬停；程序故障 ⇒ program_error 硬停。
- P.6 段处理者：segment 程序是 transcript 前缀的确定性函数；assistant
  输出必须含 toolCall（内部完成走 result，绝不泄露为 assistant）；历史
  重建逐字比对 content；段内 user 输入即硬停；程序故障硬停不 fallback。
- P.7 兼容：v1/v2 语法、旧 36 单测、旧真实 Pi E2E 行为不变；空 say 透明
  （不屏障、不生成空 assistant）。
- P.8 领域适配（CCA）：封套解引用与游标校验只存在于领域程序
  （examples/programs、examples/judges），通用 matcher 无 result_ref
  特例；缺 path/坏文件/坏 JSON/校验不符为硬错误；分页用真实 next_after
  游标走完全部页（下一页必须经 segment 发出的真实工具调用取得）。

## M（operational model：component D 与组合）

- parse-markdown（fence 扫描 + response 组标记 + 空 say 丢弃 + 锚点）
- parse-cases / parse-programs（case 列表与 {command, cases} 块体；
  judger 为 judge 别名）
- affine-analysis（批次划分与 P.4 全部检查）
- plan-unit（assistant 单元规划：文本合并 + call 区段 + matcher 配对）
- playbook-runtime（逐消息重放；pending 批表；held-pass；batchResults）
- program-exec / program-runtime（aggregator/segment 外接程序契约与
  运行；pass through judge-exec 供 judger case）
- transcript-check（多 call 内容比对；deepEqual）
- 领域 kit：cca-result-ref（解引用+完整性）、cca-make-fixtures /
  cca-fixture-page（合成分页）、cca-scc-walk-segment（游程+契约校验）、
  cca-members-final（终页 judger）
- 组合：解析期（parse→resolve→validate→analyzeAffine）全部拒绝条件先
  于任何执行；执行期每请求从 transcript 从头重放，aggregator/segment/judge
  在重放路径上以同一输入重跑（确定性要求，不承诺 exactly-once）。

## R（为什么 M ⊨ P）

- P.1/P.3：planUnit 把组内 call 收进一个单元；runtime 只在 pending 表
  清空后应用 held-pass/继续（单测：结果乱序、部分结果 playbook_state、
  held-pass 延迟应用）。
- P.2：pending 表以 toolCallId 为键；未知/重复 ID 在关联层即报
  （单测：unknown/duplicate id 硬停）。
- P.4：affine-analysis 在 spans（user 边界）上静态计数与结构检查；
  反例各有一条单测（含“两个块跳同一目标也非法”），正例“一个块两个互斥
  to”运行双分支可达。运行时无需重复检查——所有路径（线性 + 前向跳）的
  目标都在编译期解析，不存在绕过窗口（向后跳本就非法）。
- P.5：aggregator 只在流到达其位置时执行（重放与 live 同一入口）；
  envelope 由 pending 清空时已固化的 batchResults（含 verdict）按
  ordinals 排序生成（单测 dump 断言原始文本+verdict+剧本顺序+前缀无未来）。
- P.6：runSegment 是纯函数驱动的重放器：程序输出与历史逐字比对，
  toolResult 只认 pending 的 seg id；协议校验（toolUse、≥1 toolCall、
  非 mdp_ 前缀 id、二选一 JSON 键）在 program-exec；故障码
  playbook_program_error（单测：漂移/段内 user/故障/跨进程重建）。
- P.7：旧 36 单测一字不改通过；空 say 在解析期丢弃；旧式相邻 call 不合并
  （合并只发生在显式组内）。
- P.8：领域 kit 单测覆盖封套/完整对象两形态、sha256/bytes 篡改拒绝、
  CLI 退出码、未知游标、judger 故障不 fallthrough（playbook_judge_error
  而非 otherwise）、游程 3 页真实 bash 取页（游标=末成员 id）、篡改
  fixture 硬停；真实 Pi E2E 用公开合成 fixture 走完整链路。
  未接入完整 CCA/OClane 环境——这是如实声明的边界，不是已验证结论。

## 最少必要反例（裁定 AFFINE 规则的排除力）

1. 同批两个 toolResult 块都声明 to（即使 to 同一目标）⇒ 编译期拒绝
   （统计块数，非去重目标）。
2. 同批一个 toolResult 块内部两个互斥 cases to 不同 ID ⇒ 合法，运行时
   两个分支都可达（块内互斥不扩权）。
3. 有 aggregator 的批次里任何局部 toolResult 块声明 to ⇒ 编译期拒绝
   （跳转权整体移交汇合点）。
4. 普通 segment 不计入 AFFINE 统计、不收走前面跳转权，且可被 user
   pass.to 跳过（跳过时程序零调用，单测以 marker 文件核实）。

## Optimality 边界

- 显式 ` ```response ` 分组而非“相邻 call 自动合并”：后者会改变 v2 既有
  E2E/单测的 transcripts 语义（破坏 P.7）；显式语法同时给出可读分组。
- aggregator/segment 复用 judge 的 spawn 执行与 case 匹配，只新增
  “程序产出结果”契约，不建 daemon、不加新依赖。
- 未引入数据绑定 DSL：跨步骤数据一律走 transcript 前缀或 envelope
  （results）；这是本轮的最小承接，扩大为可变全局语言需新的 Q.I 授权。
