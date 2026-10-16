# Property：逐次 canonical 合成一致性

现行参照是官方 pi-ai v1.2.0 的固定 submodule；运行 `cargo test` 或 `node tests/property.mjs`。本页规定通过条件；每次实际结果、完整差异与帧写入 `target/test-artifacts/property-results.json` 和 `property-tests.md`，不覆盖设计文档。

## 定义

固定模型与选项。`Q=D∘convert` 是真实客户端请求经 Rust 解码，`K` 是独立请求 canonical，`P=parse∘encode` 是 Rust 回复经真实客户端解析，`R` 是独立 providerFill。`B` 只为 Rust 无标签 text/image 补 TS 判别字段，不重写身份、ID、签名或值。

| 项 | 必须成立的断言 |
|---|---|
| P1 | `X=Q(C)`；再次请求 `Q(B(X)) == K(B(X))`。保留 `Q(B(X)) == X` 的原始差异作为观察，不假定有损转换天然幂等。 |
| P2 | `E=P(A)` 必须等于 `R(A)`；再次编码真实 E，要求 `P(E) == R(E)`。两次解析均逐字段独立断言，不复制待比较结果；时间和真实生成ID按各自客户端规则验证。 |
| P3 | `Q(C) == K(C)`，且 `K(B(Q(C))) == K(B(K(C)))`。先检查第一轮，不能用闭包掩盖共同错误。 |
| P4 | `X=Q_p(C)`，要求 `Y=Q_q(B(X)) == K_q(B(X))`；再次目标请求要求 `Q_q(B(Y)) == K_q(B(K_q(B(X))))`。两次目标投影分别检查，不要求丢失的信息重新出现。 |

### 不动点观察不是另一份协议合同

客户端可能合并相邻文本块、补零 usage 字段、重新生成ID，或在再次转换时按解码后的身份继续投影。因此“再次编码后的帧完全不变”和“第二次目标转换等于第一次目标转换”不是单轮 canonical 等价的推论。

所有原始帧、`rawFrameStable/rawFrameDiffs`、`rawStable/rawStabilityDiffs` 均保留，报告单列非稳定观察。没有删帧、usage、签名、工具ID或身份字段以求相等；改变第二次解析结果仍必须失败。旧 71 项帧差异和9项再次投影差异不再被误报成协议等价失败，但其反例证据继续生成。

## 拒绝、前提不成立与失败

- HTTP Header 非 ByteString 等可独立预测的客户端拒绝：实际执行，断言明确原因、无 fetch 和无 capture，再单列 `expected-rejection`，不算成功等价。
- Google canonical 没有任何可发送的非 system 内容时：真实 SDK 必须以 `contents are required` 在 fetch 前拒绝；错误原因、请求计数不符仍报失败。
- 源请求已按上述断言被拒绝时，依赖其解码值的后续性质明确标记 `not-applicable`，说明前提不存在，不冒充性质成立。
- 未预测的拒绝、HTTP/capture错误、oracle异常或任意字段差异均失败。执行未完成、输入/环境在执行时改变也失败。

## 素材与范围

使用公开脱敏片段、可选私有语料、合成固定用例与固定种子。片段来源与“不完整对话”标识保留，不伪造 user/system 来补完整会话。性质覆盖四根及12条有向跨根路径；十协议直接对偶另由 `duality.mjs` 运行，不外推覆盖。

历史运行快照可在提交 `27b57ea` 的同名文件及 `tests/property-p1-counterexamples.json` 找到。旧快照的失败数字不作为现行通过率；当前运行不得把 expected-rejection、not-applicable 或非稳定观察混成 matched。
