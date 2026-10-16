# Architecture — mock-llm-server

## 目标与当前参照

任意受支持协议的客户端把 baseURL 指到本地 Mock。服务端解码请求为统一 Message，交给脚本，再把脚本的 AssistantMessage 编为相应协议；脚本不必理解厂商 wire。

参照是官方 `https://github.com/earendil-works/pi.git` 的 Git submodule `vendor/pi-mono`，v1.2.0 commit `06a466935536f8c9bcacb2d5efc0fc021be1bdff`。pi-messages 与其他适配器随同一 gitlink 固定；npm 依赖由 submodule 的 lockfile 固定。旧 fork `371cc25` 的历史结果不能替这个参照背书。

## 正确性合同

- 请求：`decode(convert(C)) == canonical(C)`。
- 回复：`parse(encode(A)) == providerFill(A)`。
- canonical/providerFill 逐协议声明于 `api/`，明确有损、默认值、客户端注入与拒绝边界，不把 wire 有字段而实现漏读叫信息论丢失。
- Rust 单测证明本地断言；真实锁定客户端与 Rust HTTP 的对偶证明对应样本，不互相替代。性质合成规则见 [property-tests.md](property-tests.md)；不由单轮等价推出帧或重复投影天然不动。
- 明确的客户端前置拒绝要实际验证原因、无请求/无capture，单列 expected-rejection，不算成功对偶；缺测试环境才 skip，内容错误不得 skip。
- 可执行定义统一入口为 `tests/contracts/` 的十个 typed provider 实例；各自声明的精确 options 操作参与实际 canonical 生成，不从 fixture 暗补默认值。独立字段扰动、流分片/中断及小域工具轨迹见 [duality-experiments.md](duality-experiments.md)，不以定义与实现自洽代替外部观测。

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

请求中的原始身份和时间只在 wire 携带时保留。多数厂商历史消息不携带 timestamp，重建为0；**pi-messages保留传入时间**。回复的客户端身份、时钟、部分usage等按各parser重新盖章。

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

- 缺少某组依赖：明确WARNING/SKIP及NOT VERIFIED，只跳对应组。
- 版本不符、受检参照源码被改、已装工具损坏、断言或加载失败：失败，不降格为skip。
- 日志和生成证据写 `target/test-artifacts/`，不覆盖历史报告。
- 脱敏公开片段和合成用例始终参与相应矩阵；私有捕获缺失可跳，损坏不可跳。来源和片段边界不伪造，见 [corpus-capture.md](corpus-capture.md)。

## 边界与证据归属

服务/admin绑定loopback，脚本为调用者信任的本地代码；不是对不可信远端提供的沙箱。真实签名有效性、云端账号/网络、未枚举compat分支不由本地Mock样本自动证明。

本目录的批次、freeze、release、final-four等历史记录保留其当时版本和观察范围；不能让旧“通过”数字或旧待裁定叙述覆盖现行合同。最新运行以实际命令/退出码、固定参照及当前生成证据为准，不以文档齐全、agent自述或多轮无异议作证明。
