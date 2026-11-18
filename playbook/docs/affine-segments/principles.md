# principles — 本专项的 Q.I / Q.A / Q.E

## Q.I（用户确认的意图，规范方向）

- **可读 mock**：剧本用 Markdown+YAML 写、给人读；标题/prose/锚点绝不
  进入模型输出；语义可从文件直接推断（无隐式状态）。
- **真实宿主**：本模块只解析、匹配与生成回复；工具由真实宿主（Pi 等）
  执行，副作用是真实的并被测试核实；每请求新进程，从 transcript 确定性
  重建进度，不建 daemon。
- **可嵌代码**：判定与聚合可外接本地程序（judge/judger、aggregator、
  segment；不限于 Markdown），协议用框架 stdin/stdout 统一 Message 契约；
  明确区分「向宿主生成 assistant 消息继续交互」与「内部完成返回值」，
  内部值不泄露为 assistant。
- **AFFINE 跳转权**（用户最新纠正，最重要）：同一 response 批次内若没有
  aggregator，最多只有【一个 tool result block】可以声明 `to`；统计持有
  to 权限的**块数**，不是去重目标，也不是限制块内 to 总数（块内互斥
  cases 可 to 不同 ID）。有 aggregator 的批次所有局部 result block 禁止
  to，跳转由 aggregator 输出后的 case matcher 统一决定。违反规则必须在
  语法/编译期拒绝。
- （承接）有序 case 语义、旧 role matcher、say/call/user/expect 示例与
  旧 36 单测 + 旧真实 Pi E2E 兼容；先保持前向 goto 范围，不另造循环
  DSL / 全局变量 / 通用 import（fuzz 循环与 import 仍属需求讨论）。
- （用户追加授权）承接 CCA 的具体 Mock 需求：`scc-members` 返回
  result_ref 封套时，判断器必须解引用完整 JSON 再判断 members 与
  next_after；缺失/损坏引用是 hard error，不 no-match、不摘要降级；分页
  使用真实 next_after 继续，不能只看首/末页。

## Q.A（认知前提，不自行产生规范方向）

- mock-llm-server 脚本契约：每请求一个新脚本进程，stdin 统一 JSON、
  stdout AssistantMessage 或 `{"error":{...}}`；错误协议可见（422
  `playbook_*`），宿主 CLI 非零退出。
- Pi 1.5.2 bash toolResult 文本形状：非零退出带状态行
  `Command exited with code N`；空输出有占位符 `(no output)`；
  openai-completions 链路不回传 isError；宿主回放的历史 assistant 不保留
  原 stopReason（与 v1 checkAssistant 同口径：内容比对，不比 stopReason）。
- CCA 契约事实（只读借鉴本仓外源码）：`result_ref.path` 封套缺 path 时
  外层即完整对象（`mock_results.py::_dereference` 现状只读 JSON/path，
  未校验 sha256/bytes——本模块不声称它校验）；`scc_query.py::scc_members`
  分页契约 `page_start=start, page_size=len(page), next_after=page[-1]`
  当还有更多成员，否则 null。当前真实样本
  `9461bced….json` 是被引用的单页完整对象（total 19/start 0/size 19/
  members 非空/next_after null），**不是多页证据**，且含私有路径不入库。

## Q.E（实际用于论证的经验/证据）

- v1/v2 轮已验证：真实 Pi E2E 的文件副作用、跨进程归属、exit_code 文本
  适配边界、judge 重跑无未来泄漏（见模块 README 与既有测试）。
- 本轮新增证据（命令与退出码见发布报告）：
  - 单测 64/64（旧 36 一字不改全绿 + 新 28），含 AFFINE 四类反例/正例、
    结果乱序、等全结果、aggregator envelope dump（原始+局部结果、剧本
    顺序）、程序故障硬停、segment 跨进程重建/漂移/段内 user 拒绝、
    CCA 解引用/防篡改/游标契约。
  - 真实 Pi E2E EXIT=0：多 call+aggregator（一条消息双 toolCall、两个
    真实探测文件、唯一跳转）、跨轮 segment 两轮真实工具往返与清单文件、
    故障硬停无副作用、非法 affine 挂载即拒、CCA 三页真实取页
    （游标 m03/m06 出现在真实 toolCall 命令里）与清单文件核实。
