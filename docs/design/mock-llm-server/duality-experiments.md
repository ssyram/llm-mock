# 可执行定义与增强对偶实验

## 合同与参照

参照固定为官方 `vendor/pi-mono` 的 pi-ai v1.2.0，commit `06a466935536f8c9bcacb2d5efc0fc021be1bdff`，包括 pi-messages。请求检查 `decode(convert(C)) == canonical(C)`，回复检查 `parse(encode(A)) == providerFill(A)`；逐协议规范在 `api/`，性质合成合同见 [property-tests.md](property-tests.md)。不把未知字段默认为丢失，不修改官方参照或扩大投影以求绿。

测试层 `tests/contracts/` 的十个 `ProviderContract` 实例统一提供 `request`、`reply`、完整投影 `definition` 及标量字段 `behavior` 查询。主矩阵、transport 和 property 的 canonical 入口均经这些实例。Rust 生产实现不导入测试 oracle。

行为是 TypeScript 判别联合：`preserve`、`drop`、`transform`、`inject`、`reject`。确定变换含精确操作：常量、truthy 省略、nullish 缺省、最低预算、码点前缀、查表、模型末段、Unicode 净化及关联的可执行程序。操作分派穷尽检查；十个 provider 各自声明全部公共 options 字段，共享层仅求值，不能漏字段后隐式丢弃。例：Responses在无最终sampling覆盖时的有效输出预算为 `minimum-truthy(16)`，最终覆盖优先；Codex 不发送该预算；Anthropic 缺省取模型预算。

复杂 Message 组装继续关联已有独立可执行算法，并非把整个协议展开成了形式化 DSL。标量查询只覆盖代码明确声明的字段；未知查询报错，应查看完整投影，不能反推未知字段不存在。模型/API 必须一致；native stream、streamSimple、payload 改写和 transport 是不同前提。

缺省输入不从 fixture 偷补 `maxTokens=64`、`sessionId=d-s1`；用例需要时由 `streamOptions` 显式提供。新增缺省探针发现旧 Bedrock oracle 漏项：仅 Claude ID/name 分支未传预算时取 `model.maxTokens`，其他模型省略。规则已写入 `tests/contracts/bedrock.ts`，依据固定源码 `api/bedrock-converse-stream.ts:263,852–861`，与 [Bedrock §4](api/bedrock.md#4-canonical-form) 一致；不是 Rust 接收缺陷。

## 独立字段实验

`tests/contract-field-probes.test.mjs` 不只检查定义与实现自洽：

- 十协议时间戳 11/12 成对请求，同时观察真实客户端 wire 和 Rust 解码；pi-messages 精确保留，其余不在历史消息 wire 携带，按声明重建。
- 十协议预算 `undefined,0,1,15,16,17`；比较真实 wire、解码结果和操作求值。另测 Bedrock 非 Claude ID/name 不补预算、仅 name 为 Claude 的 profile 补预算。
- 十协议全部 8 种 api/provider/model 身份匹配组合；独立检查签名/工具 ID 见证在 wire 的出现及向解码输出的传递，不只调用同一个 canonical。
- 故意同时破坏 Pi 回复工具 ID 和其期待值，证明普通相等可以被共同错误遮蔽，而独立精确保留断言仍检出。

完整依赖时共163次本地客户端请求（含共同遮错反例）；缺压缩依赖时按实际可运行协议记录，不把缺Codex扩大成整组缺失。这些是列出字段、值与模型配置的证据，不是所有 compat、header 和高级选项的穷举。

## 分片与中断

`stream-sse.test.mjs`、`stream-codex.test.mjs`、`stream-bedrock.test.mjs` 捕获 Rust 真实响应。每协议各两条：文本 `界😀`，以及文本后接带 Unicode 参数的工具调用。先以真实 pi-ai 检查完整回复符合独立 providerFill，再枚举：

- 整体输入、所有单切点、一字节分片。
- 记录窗口内所有双切点组合；窗口边界、字节数、分片执行数逐响应记录，不宣称全流双切点穷举。
- SSE 精确控制 `Response` 字节流交付边界；Bedrock 将相同字节交给锁定 AWS SDK EventStream marshaller，比较解码事件序列。Bedrock 每种完整回复另有真实 pi-ai 基线，不把 SDK 分片实验伪称每次都重跑了整个 Pi parser。

每协议选择空、半长、少一字节前缀，比较整体与逐字节交付。EOF 的终态按锁定 parser 实际行为观察，不统一假设“截断必报错”；这不使截断成为合法完整编码。Bedrock 比较事件及错误类别，保留错误文本供观察。SSE 另测字节流内取消，Bedrock 另测响应交付前取消。

`stream-transport-cancel.test.mjs` 覆盖十 API 的真实 HTTP 中途取消：代理发送至首个文本 delta 所在完整记录，保持响应未结束；实际 pi-ai 观察到文本 delta 后取消。断言为 aborted、没有后续工具事件/工具块，并在测试清理强关连接之前等到未完成响应关闭。取消不是由超时冒充；此证据针对客户端—代理连接，不证明任意用户脚本进程可被中止。

故障检查包含九种 SSE 文本 wire 篡改与两种 Bedrock 响应的 CRC 破坏，均须被对应检查检出；不改正常实现或官方 parser。

## 有界工具轨迹

`trace-language.mjs` 定义恰好 35 个场景：0 调用；1 个 echo 调用的两种成功/失败结果；2 调用时首个 echo、第二个 echo/other，相同/不同 ID，4 种结果状态，2 种完成顺序。执行器用真实完成屏障决定结果顺序，并检查实际执行次数及参数。

十 API 运行全部场景，Google/Vertex 各加旧式与 Gemini 3 ID 模式，共 420 条；另对十协议所有 90 条有向 provider 转换运行同名不同参数、逆序完成、混合成功/失败场景，共 510 条。每次模型请求/回复实际走锁定 pi-ai 与 Rust，并逐次比较独立 canonical/providerFill、结果回传与正常终止。脚本另写独立receipt，验收api/model/keyId/sessionSignal及完整request，不借parser盖章或capture替代脚本边界；四个字段单独或同时损坏均须失败。

碰撞 ID 按各协议声明的合并/生成等投影检查，产物同时保留源调用数、解析调用数、执行数、完成顺序及解码结果数，不声称源 ID 非唯一时仍可恢复唯一关联。不删除 ID、参数或错误结果来凑相等。

故障分别真实重复调用受控执行器、让测试脚本漏回一个结果，必须检出。这是受控 SDK 驱动与确定工具执行器，不冒充原生 Pi agent-core 的调度证明；原生 Pi/OpenCode 的工具往返由既有 CLI harness 另行覆盖。

## 运行与产物

统一入口仍为 `cargo test`，或只跑可选 Node 开发组：

```sh
cargo test --test optional_suites -- node
```

`sh tests/setup.sh`在所有安装/构建结束后记录受检安装内容；缺准备清单标明未验证，已准备的SDK版本、同版本代码、传递依赖或编译产物变化均失败。初始化后的tracked关键源码缺失不是“未初始化”。缺系统zstd时继续其他协议、WS/ADC及仅需Node原生压缩的缺CLI错误测试；产物记录skippedProtocols。独立子测试启动清除NODE_TEST_CONTEXT，且以实际产物计数验证没有空跑。

编译器准备好时自动运行 `contract-types`；Node、参照、TypeScript 编译器、zstd、CLI 等按各组需要探测，缺项明确 `SKIP / NOT VERIFIED`，已装损坏或内容失败不能降格为跳过。测试不安装依赖；开发准备仍用 Node 24 LTS 和 `sh tests/setup.sh`。依赖条件不变为普通 Rust 使用依赖。

证据写 `target/test-artifacts/`：`stream-<api>.json`、`stream-transport-cancel.json`、`tool-traces.json`、`provider-transitions.json`，记录实际参照 commit/version、Node 版本、有限边界和执行计数。Node/Cargo 日志给出退出码和通过/失败/跳过，流 JSON 额外保留前缀观测及已检出的故障数。字段探针的范围由上述固定循环及运行日志给出。

本轮完整运行（2026-10-16）：`cargo test` 退出 0，日志 `target/cargo-test-duality-experiments.log`。Rust 137 通过，Python 2 通过，Node 167 通过／1 项私有 O18 replay 跳过；可选组 11 通过／0 失败／0 组跳过。十协议 495 matched／3 expected-rejection；transport 103 matched／1 expected-rejection；fuzz 16000 green／0 finding／0 crash；property 857 matched／5 expected-rejection／4 not-applicable／0 failed，输入和环境运行中未变。真实 Pi/OpenCode harness 均通过。

新增实验实际执行 14908 次完整流分片重放、30 个截断前缀的对比、10 种真实 HTTP 取消、420 条本协议工具轨迹及90条跨 provider 轨迹；14 个特定故障检查均检出。分片数是所列两条响应的执行数，不是任意响应覆盖率；30个前缀各比较整体与逐字节两种交付。

以上是c3ff59b快照，不是下列原则审查修复后的最终验收。全单切点、小语法穷举和该批14个特定故障检查只支持所列对象；不构成任意 Rust 分支的 mutation 覆盖率。未知 compat、真实云端、密码学签名和无限输入域仍不由此证明。任何新红项都先按固定源码、现行协议和真实 wire 判断属于实现、oracle 或前提错误，按根因统一修复，不以弱化断言代替。

## 2026-10-21 原则审查后的落实

本轮只做一次独立审查，依据用户确认的 [principles.md](principles.md) 与根性质；原报告保留于本地 `.pi/test-principles-review.md`，对应被审快照c3ff59b。之后是实现职责内的修复与直接功能测试，没有追加审查轮次。

| 原发现 | 统一修复及直接回归 |
|---|---|
| F1 比较器遮错 | 仅定点移除AssistantMessage顶层时钟；工具业务timestamp/durationMs完整比较。JSON签名语义归一只命中已声明内容块路径，不误用到业务同名字符串。独立负向敏感性断言及十协议实际回复业务参数用例均参与入口。 |
| F2/F7 有序内容与已发字段 | JSON入口启用preserve_order，System.sections使用IndexMap；record JSON与cacheRetention传到统一脚本，修正“不发送”注释。原始值/entries/渲染顺序与真实SDK→wire→capture→脚本收据分别验收，不用受限模型再次过滤期待。 |
| F3 原生options | 按模型/compat、native thinking/effort、最终sampling覆盖、当前工具集合计算目标槽位；补AM affinity与thinking、Responses/Azure/Codex/Completions reasoning、Google/Vertex level/budget/VALIDATED、Bedrock none不发toolConfig；33个原生配置用例独立核wire和decode。 |
| F4 脚本接线 | 510轨迹每次检查实际脚本receipt；api/model/keyId/sessionSignal单独与共同损坏都失败。额外取证命名/独立端口的无认证HTTP/WS、forced WS及Vertex ADC实际出站token，不以parser重盖身份代替。 |
| F5 门控过宽 | CLI压缩与Node原生能力分开；缺CLI时其余协议矩阵/fuzz/字段/工具/取消与WS/ADC继续，混合identity/zstd测试也只跳实际压缩分支。隔离PATH实跑385本协议、72转换、9取消以及矩阵/单seed fuzz/特殊transport；产物验证避免嵌套Node测试空跑。 |
| F6 参照前提 | 初始化后的tracked源码缺失失败；显式npm ci/构建结束后生成commit/lock绑定清单，加载SDK前复核实际依赖和编译内容。隔离副本验证包版本、同版本代码、传递依赖、构建产物的修改/删除均失败；未破坏实际参照作反例。 |
| F8 拒绝分账 | AM/Completions真实会话头条件进入同一已知边界分类；仍执行真实客户端、精确原因、fetch=0/capture=0断言，不将任意异常宽免为预期拒绝。 |
| D1 文档来源 | Google当前参照改锚官方commit和具名函数，旧fork/旧数字索引及历史待修表明确归历史；pi-messages当前规则移除已修排序和字段删除投影，不倒写旧批次。 |

最终运行：`cargo test`退出0，日志 `target/cargo-test-principles-fixes-final.log`。Rust138、Python2、Node215通过，Node内1项私有O18 replay缺语料跳过；14个可选组通过、0失败、0组跳过。十协议505 matched/3 expected-rejection；transport105 matched/1 expected-rejection；fuzz16000 green/0 finding/0 crash；property861 matched/5 expected-rejection/4 not-applicable/0 failed，84个原始帧变化与35个投影变化保留为观测，输入/环境未在运行中改变。真实Pi/OpenCode harness均通过。

类型检查、变更源语法/200有效行限制、文档链接及diff检查通过；clippy退出0，仍报告既有large_enum_variant及useless_conversion告警，未为消除告警追加无关重构。仅缺CLI的隔离集成本轮也被统一入口实际运行，不从环境齐全的绿色推断降级路径正确。

该批交付时尚未闭合的是脚本exit/stdout优先级；随后用户指定普通stream error处理，现已在mock-scripts.md明确并落实：有效MockError照常传播，其他非零退出为script_failed，只有exit 0接受成功回复。HTTP开流前为原生错误JSON/状态，已连接WS为原生error帧；锁定Codex仍可将429文案标准化，不反过来改wire。该后续修复有单独运行日志，不倒写上一批验证范围，也不改变Q.I。

后续执行结果：registry定向14项Rust回归（含新增3项退出规则）及5项直接HTTP/WS/parser回归通过；默认完整 `cargo test` 最终退出0（target/cargo-test-script-exit-final.log），Rust141、Node219、Python2通过，Node内1项私有回放跳过，14个可选组通过。首次完整执行曾由未修改的端口测试AddrInUse及继发锁中毒中断，端口用例单独和默认全量重跑通过；target/script-exit-port-failure.md保留该观察，不把重跑通过冒充端口竞争已修。clippy退出0仍有既有两类告警。
