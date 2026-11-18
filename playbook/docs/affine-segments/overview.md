# markdown-playbook 专项：AFFINE 跳转权、aggregator/segment 与 CCA result_ref kit

> **历史标记（2026-11-17）**：本文档描述的 v1 affine 语义（user-span 批次边界、
> aggregator 回合禁 segment/其后禁 call 等限制）已由 `../next-language/`
> （按单 Response 的 affine、统一外接程序）**取代**；v1 运行时继续原样服务
> 旧挂载。以下原文事实不作改动，仅作历史参考。

功能归属目录：`playbook`（本模块完整拥有剧本
mock 能力，范围最小的稳定责任边界；不写入仓库根 `docs/` 或
`docs/design/mock-llm-server/`——那是 mock-llm-server 框架根架构的归属，
本专项不污染它）。旧路径 `scripts/mock-scripts/markdown-playbook/` 仅余
薄 wrapper `mock.mjs` 供既有挂载命令兼容，实现已整体迁至本目录。

任务性质：专项任务（模块内一次能力扩展 + 一个领域适配 kit）。

文档根：`playbook/docs/affine-segments/`。

选择依据：既有模块以模块根 `README.md` 承载用户文档、模块内 `tests/`
承载测试；本专项是模块内功能，按 QPDI 第 8/9 步落在模块自有 `docs/`
专项目录，owner=markdown-playbook。

## 范围（overview）

本轮在 v2（七块 + 锚点 + case 匹配 + judger + 多剧本路由）之上新增：

1. **response 分组与多工具批次**：` ```response `/` ```/response ` 显式
   分组，一条 assistant 消息携带文本 + 多个 toolCalls；每个 call 可带
   matcher，按 toolCall ID 关联真实结果；整批结果到齐再决定。
2. **AFFINE 跳转权**（编译期强制）：批次内至多一个 toolResult 块持有
   `pass.to`（统计块数，不去重目标）；aggregator 批次局部禁 to。
3. **aggregator / segment 共用外接程序机制**：command → 一个结果 →
   同一套 cases；aggregator 是批次必经汇合点；segment 跨多轮、真实工具
   往返、内部返回值不泄露。
4. **CCA result_ref 领域 kit**：封套解引用、sha256/bytes 防篡改、分页
   游标契约、终页 judger 与分页游程 segment（公开合成 fixture）。

入口：`parse-markdown.mjs`、`affine-analysis.mjs`、`plan-unit.mjs`、
`program-exec.mjs`、`program-runtime.mjs`、`playbook-runtime.mjs`、
`examples/programs/*`、`examples/judges/cca-members-final.mjs`、
`examples/cca/`。用户级文档见模块 `README.md`；本目录只承载 Q/D 论证。

边界：不改 mock-llm-server Rust 协议层、不改 CCA 仓 / OC / FSM、不建
daemon、不动共享 tmux。
