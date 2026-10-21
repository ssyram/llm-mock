# Architecture — mock-llm-server

## 目标与当前参照

上游 Q 见 [principles.md](principles.md)：Q.I 是 pi-ai / pi-messages 协议的对偶实现，使脚本开发只处理统一内容而不处理厂商封装。本文件承接这一意图及已经明确的使用、开发约束，不以当前实现或测试样本改写 Q。

任意受支持协议的客户端把 baseURL 指到本地 Mock。服务端解码请求为统一 Message，交给脚本，再把脚本的 AssistantMessage 编为相应协议；脚本不必理解厂商 wire。

参照是官方 `https://github.com/earendil-works/pi.git` 的 Git submodule `vendor/pi-mono`，v1.2.0 commit `06a466935536f8c9bcacb2d5efc0fc021be1bdff`。pi-messages 与其他适配器随同一 gitlink 固定；npm 依赖由 submodule 的 lockfile 固定。准备脚本在npm ci与telemetry构建后生成绑定commit/lock的安装清单；验证在加载SDK前重新比对实际node_modules（含嵌套依赖）及编译产物内容，漂移不能仅凭包名或import成功冒充同一参照。清单用于检测受信准备后的漂移，不是对有权限伪造环境的宿主作密码学证明。旧 fork `371cc25` 的历史结果不能替这个参照背书。

## 正确性合同

- 请求：`decode(convert(C)) == canonical(C)`。
- 回复：`parse(encode(A)) == providerFill(A)`。
- canonical/providerFill 逐协议声明于 `api/`，明确有损、默认值、客户端注入与拒绝边界，不把 wire 有字段而实现漏读叫信息论丢失。
- Rust 单测证明本地断言；真实锁定客户端与 Rust HTTP 的对偶证明对应样本，不互相替代。性质合成规则见 [property-tests.md](property-tests.md)；不由单轮等价推出帧或重复投影天然不动。
- 明确的客户端前置拒绝要实际验证原因、无请求/无capture，单列 expected-rejection，不算成功对偶；缺测试环境才 skip，内容错误不得 skip。
- 可执行定义统一入口为 `tests/contracts/` 的十个 typed provider 实例；各自声明的精确 options 操作参与实际 canonical 生成，不从 fixture 暗补默认值。独立字段扰动、流分片/中断及小域工具轨迹见 [duality-experiments.md](duality-experiments.md)，不以定义与实现自洽代替外部观测。

## D.root：必须满足的性质

下表是设计义务，不是“已经由全部测试证明”的结论。作用域中的下层设计须承接相应性质；共同规则不能只留在某个测试或某个 provider 的局部说明。

| P | 可判定性质 | 来源与承接 |
|---|---|---|
| P.ref | 对偶验证使用确定的官方源码和依赖快照；参照不符或受检源码被改不能冒充同一版本通过。升级后重新取得对应证据。 | 确定参照的 Q.A 与用户锁版本要求；由 gitlink、依赖锁文件和开发测试入口落实，不要求普通服务运行时安装源码。 |
| P.dual | 每个声明支持 API 在协议规格定义的输入域中满足上述请求、回复两条等式。字段保留、精确变换、运行时注入和拒绝都有依据；不得从 wire 已发却未读反推“不可逆”。 | Q.I；分配给 decoder、encoder、统一模型与独立 canonical/providerFill。输入域不能仅等于现有 fixture 清单。 |
| P.script | 脚本只需统一请求、RequestInfo 和统一回复/错误，不必解析厂商封装；路由、model、keyId、session 信号及结果不能在组合接线中错配或漏传。 | 根源目的及现行脚本协议；分配给路由、M2/M4/M5 接线。legacy 恰一匹配规则只约束 legacy 分支，不扩张为挂载必须认证。 |
| P.errors | 既定的无匹配、歧义、脚本失败、非法输入及不支持内容等条件按所属接口显式处理，不静默降级；预期拒绝须按实际原因分账。 | Q.I 所需的稳定行为与现行逐接口协议；各错误必须绑定其实际层级，不能一概当客户端拒绝。 |
| P.workflow | 普通 Rust/Cargo 构建使用不依赖开发 Node/pi-ai/CLI 环境；开发验证统一自动运行所有条件具备的组。缺项仅跳受影响组且标明未验证，损坏和真实失败不能跳过。 | 用户既有明确约束；分别约束生产依赖与开发测试入口，不把 Node 测试本身的依赖禁止掉。 |
| P.evidence | 支持对偶的证据能够追溯到固定参照、具体协议性质和实际断言；比较器不能任意忽略可观察字段，错误 oracle 不得靠与错误实现一致自证。 | P.dual 的验证义务及历史纠正；由逐字段依据、测试设计、故障检出与真实执行记录承接。缺证据不自动证明实现错误，也不取消原义务。 |

## 请求与回复流程

```text
客户端的原生协议请求
 → 路径/挂载选择、认证头与KeyID提取
 → HTTP解压及JSON解码，或Codex WebSocket输入/续接恢复
 → per-API decoder：UnifiedRequest + session信号
 → 挂载脚本，或legacy KeyID/matcher恰一命中
 → 脚本stdin {api,keyId,model,sessionSignal,request}
 → AssistantMessage 或 MockError
 → per-API encoder
 → 客户端真实parser
```

- `src/model/`：统一消息、内容块、工具、options与错误。
- `src/api/<api>/`：纯协议decoder/encoder及其直接测试；API之间按家族复用。
- `src/mounts/`：挂载CRUD、持久化、路由、CLI、压缩与Codex WebSocket。
- `src/registry/`：legacy KeyID匹配及脚本/文件执行。
- `src/server.rs`：HTTP接线、capture、脚本输入与错误封装。

## D.root：组合论证与实现承接

协议反向转换由 `src/api/` 承接 P.dual，路由/挂载/registry 承接请求选择，`src/server.rs` 连接统一请求、脚本与回复，`src/model/` 定义脚本面对的内容边界。当前组件与接口的 operational model 就是上面的完整流程，而不只是 decoder、encoder 两个孤立函数。

若锁定客户端构造的请求经 decoder 得到声明的 canonical，且脚本实际收到该统一请求和正确 RequestInfo，脚本产出的 AssistantMessage 经 encoder 后再由锁定 parser 解析应等于 providerFill。由此组成脚本无需处理厂商封装的调用；但两条 codec 等式本身不证明路由、元数据接线、脚本执行次数或错误路径正确，这些仍由 P.script/P.errors 单独约束并在整体往返中检查。

确定参照使这些关系可重现，逐协议有损与注入规则使比较对象明确；开发测试入口使后续脚本/实现修改能快速重复验证。该组合的必要性来自一个统一脚本要服务不同厂商封装；不要求每个脚本复制 adapter，不要求生产服务携带 Node 或参照源码。

I 分别是上述模块、挂载与注册配置、测试入口和各具体断言。对 P 的证据应沿这条设计承接核对；已有测试绿色不等于组合已满足全部义务，也不能用某个子分支的限制默默收窄根保证。需要改变对上保证时应在拥有该保证的设计层明确披露，不能改写 Q.I 或只改测试期待。

请求中的原始身份和时间只在 wire 携带时保留。多数厂商历史消息不携带 timestamp，重建为0；**pi-messages保留传入时间、sections顺序及已上wire的记录JSON与cacheRetention**。有序JSON入口、IndexMap模型和脚本输出必须共同保序，而不是只换最后一个map。回复的客户端身份、时钟、部分usage等按各parser重新盖章。

session信号和 `request.options.sessionId` 分开：脚本接收decoder选择的信号，例如Anthropic可在无session头时回退到 `metadata.user_id`；该回退不伪造options中的session头。显式头优先。

Codex顶层instructions始终先于input中的system更新，工具声明附在初始system；只对该字段的未配对surrogate按已声明canonical净化。其他JSON字段仍严格解析，HTTP identity/zstd和WebSocket共用规则。

## 路由、认证与transport

- 通用挂载以 `/{name}/...` 直绑脚本，KeyID为可选脚本输入，不要求认证；legacy registry根路由缺KeyID返回401。
- Completions/Mistral共享路径以显式prefer优先，后用局部wire特征判断；不靠模型名称猜。
- Vertex接纳 `/v1[beta]/.../publishers/{publisher}/models/{model}:streamGenerateContent`；publisher不限定google。资源前缀按协议声明投影，request.model取模型末段。
- OpenAI/Responses/Anthropic/Google及家族变体主要使用SSE；Codex还支持WebSocket。
- Bedrock独立根路由 `/model/{id}/converse-stream` 使用AWS二进制EventStream，不是SSE；当前不属于通用挂载API列表。
- 错误保留协议形态与状态。内容不支持明确报错，不静默回退。

挂载的端口、保留名、选择优先级、持久化与CLI边界见 [mount-routing.md](mount-routing.md)。注册表与挂载表支持各自admin变更，不再采用MVP“启动后永不变”假设。

## 开发、使用与自动测试

普通Rust构建不要求Node、参照源码、Pi或OpenCode。用户脚本的解释器、zstd压缩路径的系统CLI等有各自依赖，不隐含成核心Rust测试前提。

开发推荐Node24 LTS和 `git clone --recursive`，`sh tests/setup.sh` 准备锁定参照依赖。`cargo test` 自动运行核心Rust、独立Python组、Node单测、十协议对偶、transport、完整fuzz、property及具备条件的真实Pi/OpenCode往返。测试不自动安装依赖或下载submodule。

- 缺少某组依赖：明确WARNING/SKIP及NOT VERIFIED，只跳对应组。缺系统zstd只排除Codex压缩HTTP，不跳其他协议的对偶/fuzz/字段/工具/取消，也不跳不走压缩的WS/ADC；Node原生压缩能力另行门控。选择范围与skippedProtocols一同落盘。
- 版本不符、受检参照源码被改、已装工具损坏、断言或加载失败：失败，不降格为skip。
- 日志和生成证据写 `target/test-artifacts/`，不覆盖历史报告。
- 脱敏公开片段和合成用例始终参与相应矩阵；私有捕获缺失可跳，损坏不可跳。来源和片段边界不伪造，见 [corpus-capture.md](corpus-capture.md)。

## 边界与证据归属

脚本叶子合同现已明确：完成输入传递及取得输出后，有效MockError沿用其模拟状态；其他非零退出为HTTP500/script_failed，合法成功JSON不能掩盖进程失败。HTTP开流前复用原生协议错误体，已连接WS使用原生error帧；客户端最终表现为error而非done，具体code/message展示仍遵守锁定parser。细节与回归见 [mock-scripts.md](mock-scripts.md#进程退出与错误通道现行)。这不新增脚本逐token输出，也不声称覆盖任意已开HTTP流后的异常。

服务/admin绑定loopback，脚本为调用者信任的本地代码；不是对不可信远端提供的沙箱。真实签名有效性、云端账号/网络、未枚举compat分支不由本地Mock样本自动证明。

本目录的批次、freeze、release、final-four等历史记录保留其当时版本和观察范围；不能让旧“通过”数字或旧待裁定叙述覆盖现行合同。最新运行以实际命令/退出码、固定参照及当前生成证据为准，不以文档齐全、agent自述或多轮无异议作证明。
