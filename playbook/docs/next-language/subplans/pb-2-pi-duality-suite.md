# 真实 Pi 多用例对偶与 playbook 本地测试入口

> 旧版基线与测试入口记录：本文的固定剧本和调用数属于当时版本，不规定最新简化版必须保持相同写法或工具数量。真实请求/轨迹对照和变造拒绝义务继续有效，新管理结构与目标见 `../runtime.md`、`../expectations.md`。旧版完整基线实际结果为 `target/test-artifacts/playbook-local-suite/suite-NXb4ae/results.json`，总体失败，不能报作新版通过。

## 归属与边界

本专项属于 `playbook/docs/next-language/`：不改变语言语义、运行时或三个人工
宿主。自动化只使用仓内 `target/` 的独立 HOME、配置、临时目录、缓存、Pi
session 和工作目录，以及随机端口本地 mock；不连接真实 provider，不读写
人工 session/服务/缓存，也不新建运行时快照或 pin。固定 `bash` 工具自动化的
`--approve` 仅用于独立 headless Pi，实际 argv 必须记录。OC/CC 仍为人工验收；
三种挂载的 HTTP 测试只是合成接线，不是三宿主自动验收。

## 输入、预期及匹配位置

被测主文件是物理路径 `examples2/full-showcase/showcase.md`，导入原始
`functions/round.md` 和原始 `programs/`；不得复制另一份剧本替代。输入包括
真实 Pi session JSONL、mock 对每个实际 provider 请求记录的完整原始 capture，
以及独立编写的情景预期。预期直接来自主文件和外接程序契约，不从被测
parser、runtime 或两次运行的相互比较推导。以下两轮情景均以 `1` 开始：

| 第二轮输入 | 预期分支 | 最终 sample/status |
|---|---|---|
| `2` | 修复 | `sample=FIXED\n` / `status=FIXED\n` |
| `3` | 保留 | `sample=buggy\n` / `status=KEPT\n` |
| `请帮我修复` | 自然语言修复 | FIXED / FIXED |
| `不要修复` | 否定优先，保留 | buggy / KEPT |
| `暂停` | otherwise 保留 | buggy / KEPT |

非法首输入 `invalid` 必须得到明确的 `playbook_mismatch`，真实 Pi 非零退出，
不产生工具调用或工作目录产物；不能将程序/判断器故障解释为入口 no-match。
有效情景每轮真实 Pi exit 0 并完成其预期文字和产物。对每个输入，首批是一条
assistant Response 中两个 `bash` 调用，分别写基线和 `tee` 有缺陷样本；aggregator
只在两个真实回执后完成。此后独立函数帧顺序写 trace 的 0、1、2 三轮（每轮
`frame=seen-N|payload=case-N`），空 say 后另批写边界；普通 segment 的 skip
跳过不可执行块；交互 segment `segment-read-1` 实际读取基线、样本、三轮 trace，
返回 reader 后由另一个 segment 核验。之后询问第二轮；选定分支的 bash 写
sample/status，再由单独空 say 批调用 `cat` 真实读取五个文件并通过最终 judge，
才给完成文字。有效情景恰有九个不同工具 ID：`p2_1`…`p2_6`、
`segment-read-1`、`p2_7`、`p2_8`；不得因为空 say 丢失而合并批次。
实际命令、完整文字、顺序和结果敏感标记须由测试侧明列并逐事件验证。

## 对偶、失败及生命周期

逐个 provider capture，原样保留当次 `api/keyId/request` 全部字段（包括
system、tools、options），与 session 的相应真实前缀严格关联；下一条必须是
真实下一条 Pi assistant 且也匹配独立预期。只有工具批的所有回执归属齐全才
是可请求 frontier；一条回执的批前缀为 `waiting`，不可宣称完整通过，若真有
这样的请求则按 `playbook_state` 检查。任一请求不存在下一条真实 assistant、
捕获缺失或 session 尚未完成时标 partial/waiting，不能假报完整对偶。

允许的投影仅限宿主实证丢失的 timestamp、usage/cost、空 text 块、toolResult
的空 toolName 和未传输的 isError；非空说话、工具名/参数/ID、回执正文、用户
轮次和消息/批边界不得忽略。相同原始请求在独立 `--no-cache` 和一个共享
cache 上重放，并重复前缀；回复均与该真实 Pi 下一 assistant 一致。cache hit
必须有可检查的 continuation 记录中已存在键的 `usedAt` 更新、`savedAt` 不变等
实证，而非仅传 flag；外接程序观察计数不构成 exactly-once 承诺。

每个正例分别变造先前 assistant 非空文字、tool 参数、tool ID 和结果敏感正文，
以独立结构化错误代码拒绝，四次均检查真实工作目录快照不变；绝不执行变造
后产生的宿主工具命令。每次进程先落输入、stdout、stderr、status、signal 及
原始 reply，然后才读取工具调用或断言；故障不降级、不用 undefined.arguments
覆盖原错误。真实失败与超时记录原始证据，进程及独立 server 由其所有者关闭。
EPIPE 仅在 status 为整数且 signal 为 null 时按实际退出状态处理；非零、超时、
坏 JSON 和非法 judge 不因重放降级。此前 parent 29/31 的第二项原始 reply 缺失，
不能推断其根因为 EPIPE。

## 覆盖与全套入口

完整本地入口预先列出文件、命令、用例和排除项；动态发现活动测试目录中的
`*.test.mjs`，包含新增文件，不把 fixtures、helpers、retired、历史快照或
artifacts 当测试。至少执行 v1 64、tests2 58、独立 oracle 19/API 37/target 31、
showcase 24 及三挂载合成 HTTP，v1 真实 Pi 的 report→case→affine→walk 链、
v2 `pi-e2e2.mjs`、既有 representative Pi 对偶、新多情景 Pi 对偶，以及新入口/
checker 自身的选择和失败传播测试及静态语法检查。v1 子场景由单入口调用，
不得重复计算；不纳入根 Rust 或不相关协议 suite、CCA 业务矩阵和真实 provider。
缺少真正外部依赖须列明确 preflight unavailable；import 错误、测试失败、空
集合不得伪装 unavailable。逐项结果保存 exit/signal/count/skip 理由、时长及
stdout/stderr，任一失败整体非零。脚本运行目录、实际选集、排除原因、各 case
的 session/captures/replay/mutations 和 run.json 为证据，不以启动代替完成。

## 预期到测试映射

- 分支、导入、聚合、批次、reader、九 ID、真实文件 → 独立情景预期和每个
  真实 Pi session 的逐事件 oracle；五个正例和一个非法入口独立记录。
- 完整/部分批、逐真实 frontier、每次原始上下文、下一真实 assistant →
  通用 session/captures/expected checker；合成单元反例覆盖只收到一条回执。
- 冷/热/重复及可观察命中 → 每一 capture 的冷重放、共享热重放和重复；
  记录 cache entry 前后变化。
- 文本/参数/ID/回执篡改及无后续宿主副作用 → 每个正例各四次变造和快照。
- 错误分类、选择与空集合拒绝、失败传播 → runner/checker 自身单元及已有
  external-stdin-epipe、target-errors、language-edges 测试；旧守卫不删减。

## 本次实现与已观察结果

`node playbook/tests2/run-local-suite.mjs --list` 在执行前显示所有选择、命令、
用例和排除项；无参数运行全套并生成逐项 `results.json`。既有 pin 兼容测试
完整保留：它只在本次测试新建的独占目录创建合成夹具，不创建人工验收 pin、
不引用旧快照，也不修改任何正在运行的服务。synthetic HTTP 测试从历史临时
探针迁入 owner 测试源，使用本仓 schema fixture 和随机端口，不再依赖本轮
`target/` 脚本路径。

本轮先期隔离实测：v1 64/64、tests2 58/58、独立 oracle 19/19、API 37/37、
target 31/31、原 showcase 本地 24/24 加 synthetic HTTP 1/1、
frontier/runner/evidence 自测 13/13。v1 真实 Pi report→case→affine→walk
入口、v2 真实 Pi E2E 与既有 representative 真实 Pi 对偶均 exit 0。
`invalid-first` 真实 Pi 单例的测试进程 exit 0，被测 Pi 本身因
`playbook_mismatch` 非零退出且无工具/工作区产物。

`exact-fix` 两轮 Pi 均 exit 0，10 个真实请求 frontier、九 ID、所有
冷/共享/重复回复均匹配，四种变造分别得到三个 `playbook_segment_drift`
和一个 `playbook_mismatch`、工作区快照均不变；但总 case exit 1：共享
缓存没有观察到真正恢复，因而没有将它报告为完整对偶通过。包括逐请求回放和
四种变造的原始工件为 `target/test-artifacts/playbook-pi/full-showcase-yxERq1/exact-fix/`；
首轮缓存定位工件为 `target/test-artifacts/playbook-pi/full-showcase-isAVCG/exact-fix/`。

缓存缺口的直接原因是缓存保存 assistant 前缀仅含 `{role,content}`，真实 Pi
后续 provider request 的同一 assistant 还带有 api/provider/model/usage/
stopReason/timestamp，空 say 的空文本也可丢失，导致缓存键不等；这不改变
冷重建的回复，但不能把传入 cache flag 叫做命中。本轮仅在独立 target 工作
副本试验规范化 assistant key，原始 10 frontier 冷/热/重复仍匹配且记录 18
次既有 entry `usedAt` 刷新、`savedAt` 不变。该副本不是产品修复或真实人工
运行：为不扰动正在验收的服务，产品 `lang2/cache.mjs` 未修改，完整 runner
应据产品实际结果如实失败，不能以副本的命中替代。完整套件结果以其实际
`results.json` 为准，不能从先期子集推断其他 Pi 用例已通过。
