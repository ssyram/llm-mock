# 最后四红：逐例定性与处置

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 结论

- 主矩阵保持 **828 案：824 绿 / 4 红**。四个原始失败全部保留，**0 转绿、0 新红**；不删案、不换输入、不把预期拒绝算成功。
- 四案已完成定性：**3 个锁定 pi-ai 客户端 ByteString 外部边界 + 1 个本仓库 Rust 标量字符串定义域明确拒收**。处置完成不等于无损兼容性已修复。
- 完整复跑：duality **824/828**（exit 1）；fuzz **16000/16000**（exit 0，800 seeds × 十协议 × 双向）；property **1110/1238，128 findings**（exit 1，completed）。fuzz 独立重算校验通过；property 不借 fuzz 全绿销账。
- Rust **133/133**、Node **100/100**；新增 **5** 项边界测试均通过。没有改 `src/**`、canonical、生成器、四个原始案例或矩阵比较规则；只补接纳域声明和独立回归证据。
- 锁定根 `<pi-mono>/packages/ai/src` 的 **243 文件 SHA256 不变**。接纳域处置已经 supervisor 批准；独立 reviewer gate 仍待执行，本文不是自批准。

## 1. 三方证据与逐例账本

以下 TS 路径均相对上述锁定根；冻结定义路径相对本文目录。原始四红、前置哈希见 `tests/final-four-before.json`；最终原始结果仍在 `tests/matrix-ten-results.json`。

| 原始矩阵主键 | 冻结定义 | 锁定 pi-ai 源码及实测 | 本仓库实现与处置 |
|---|---|---|---|
| `openai-responses/req/w06-unicode-session` | `api/openai-responses.md:26–30`：默认头使用原始 session，body key 才截 64 码点；不得换 ASCII 或全局忽略 session | `api/openai-responses.ts:157–172,277–298,334`：session 传入 OpenAI SDK `defaultHeaders`，无编码。原 `"😀".repeat(70)` 报 ByteString，**fetch=0、HTTP=0** | 服务端无请求可处理；不是请求体 UTF-8 解码缺陷。**外部边界：锁定客户端头值域拒绝**；原红保留 |
| `openai-codex-responses/req/w06-unicode-session` | `api/family-variants.md:12`、atlas I23：头与 body 均为前 64 code points；截码点不是 ByteString 编码 | `api/openai-codex-responses.ts:276–296,1664–1700`：先 clamp，再构造 SSE/WS Headers，之后才选 transport。截后仍含 emoji，`Headers.set` 当场失败；**fetch=0、HTTP=0** | 发生在压缩/网络之前，SSE/WS 切换不能补救。**外部边界**；不做服务端 lossy、不改只读客户端；原红保留 |
| `mistral-conversations/req/w06-unicode-session` | `api/mistral.md:13,67`：缓存启用且 session truthy 时自动发 `x-affinity`；显式覆盖是另一输入条件 | `api/mistral-conversations.ts:307–318,350–379,546–552`：`buildMistralHeaders` 在 fetch 前直接 `headers.set("x-affinity", options.sessionId)`；**fetch=0、HTTP=0** | 无到达服务器的字节，不能由 body decoder 容错。**外部边界**；不以缓存关闭/覆盖亲和头冒充原案修复；原红保留 |
| `openai-codex-responses/req/w06-surrogate-order` | `api/family-variants.md:35` 与 Q Unicode 行：Codex instructions 不经普通文本 sanitize；atlas I24 仅限实际 sanitize 调用点。`api/openai-responses.md:181` 明确 Rust 不能表示不等于 JS 无该输入 | `api/openai-codex-responses.ts:543–558,293,377–405`：原 system=`"s\ud800x"` 进入顶层 instructions，JSON.stringify 发出 `"instructions":"s\ud800x"`，实际 zstd 且 fetch=1 | `src/mounts/request_body.rs:9–16` 解压后的 ASCII JSON 转义可以通过 UTF-8；`src/api/openai_responses/decode.rs:14–15` 的 serde_json 解码失败，`src/mounts/routing.rs:61–63` 返回 **HTTP 400**、无 capture。**本地标量字符串定义域拒收**；非外部边界、非协议不可逆；原红保留 |

三个 ByteString 案的共同原始异常为：

```text
Cannot convert argument to a ByteString because the character at index 0 has a value of 55357 which is greater than 255.
```

55357 是 emoji 的 UTF-16 高代理项数值；该异常约束的是 Headers 的 ByteString 参数，不是 JSON 请求体仅支持 Latin-1。capture=0 单独不足以证明客户端失败，本轮补了 fetch 调用计数和真实本地 HTTP listener 的到达计数，两者均为零。

## 2. ByteString 与 Unicode 请求体反证

源命名测试：`tests/final-four.test.mjs` 的前三项。直接复用 `w06RequestCases` 原输入，不复制替代原案；注入的 fetch 仅计数并委托真实 `globalThis.fetch`，不编码头、不改 payload。

| 适配器 | 原 Unicode session：fetch / HTTP | 对照：ASCII session + `body 😀 中文`：fetch / HTTP | 对照实际 session 头长 / 编码 |
|---|---:|---:|---|
| Responses | 0 / 0 | 1 / 1 | 70 / identity |
| Codex | 0 / 0 | 1 / 1 | 64 / zstd |
| Mistral | 0 / 0 | 1 / 1 | 70 / identity |

对照 listener 故意回复 HTTP 400 `final-four-wire-probe-arrived`；断言的是请求真实到达、反序列化后的 Unicode body 保持，不把这个 400 算内容对偶通过。它同时证明 fetch 计数器和 HTTP 计数器确实工作，而非探针失灵。最终完整记录见 `tests/final-four-node-all-final.log`。

服务器无法 lossy 转换尚未发送的 header。调用方可以另行选择 ASCII session、关闭缓存或显式覆盖头，但那是不同输入，未用于替换本矩阵案例，也不作为本次修复。

## 3. zstd 暴露的内容域：明确拒收，不伪称协议无载体

`src/model/message.rs:18–20,32–33` 的 system 文本使用 `String`，表示 Unicode 标量序列，不能持有孤立 UTF-16 surrogate。原 wire 上却有完整 JSON 转义，JS `JSON.parse` 可恢复原码元。故它不是协议丢弃信息，也不能算 atlas I24 中“客户端已删除”的对象。

处置选择：**保留现有 HTTP 400 拒收语义，并在权威家族页 `api/family-variants.md` 明示本仓库接纳域**；未修改冻结内容投影方程或统一模型。当前标量模型下无损接纳不可行；把 `\ud800` 替换为 U+FFFD、删除或存成字面反斜杠都会静默改变内容，不能宣称修好了原案。本轮不做 lossy，不演进 UTF-16/原始码元模型；将来若要求这类输入无损互通，仍需单独批准模型演进。

新增测试分两层：

- 第四项直接运行锁定 Codex 原案，用测试 fetch 观察真实适配器产出的 zstd 请求体，解压后断言 instructions 仍为 `s\ud800x`、fetch=1。此层 fetch 返回模拟 400，只证明适配器序列化与发起行为，不冒充服务器通过。
- 第五项真实启动本仓库服务器，分别发送 identity/zstd；带真实测试认证头，合法 JSON 代理对以 `\ud83d\ude00` 转义发送，正向断言 capture 内容逐字相等。

| instructions / wire 内容 | identity | zstd | 每次新增 capture |
|---|---|---|---:|
| 孤立高代理项 `s\ud800x` | 400 `invalid_request_error` | 同左 | 0 |
| 孤立低代理项 `s\udc00x` | 400 `invalid_request_error` | 同左 | 0 |
| 实际 U+FFFD：`s�x` | 200，原样保留 | 同左 | 1 |
| 合法代理对转义 `s\ud83d\ude00x` → `s😀x` | 200，原样保留 | 同左 | 1 |
| 字面反斜杠文本，JSON 为 `"s\\ud800x"` | 200，原样保留 | 同左 | 1 |

两种编码均在 JSON 内容域拒收孤立 surrogate，不是 zstd 解压失败；错误消息包含 `invalid JSON body` 与 `hex escape`/`surrogate`。完整错误和 capture 增量在最终 Node 日志中。

## 4. 完整复跑与不能混算的分母

最终一轮原始时间：duality 2000-01-01 至 00:00:00；fuzz 00:00:00 至 00:00:00；property 00:00:00 至 00:00:00。运行均 completed，无硬超时。

| 命令 | exit | 最终证据与结果 |
|---|---:|---|
| `cargo check --locked` | 0 | `tests/final-four-cargo-check.log` |
| `cargo build --locked` | 0 | `tests/final-four-cargo-build.log` |
| `cargo test --locked` | 0 | `tests/final-four-cargo-test.log`：133 passed，0 failed |
| `node --check tests/final-four.test.mjs` | 0 | `tests/final-four-node-check-final.log` |
| `node --test --test-concurrency=1 tests/*.test.mjs` | 0 | `tests/final-four-node-all-final.log`：100 passed，0 failed，含新增 5 项 |
| `node tests/duality.mjs` | **1** | `tests/final-four-duality-final.log`、`tests/matrix-ten-results.json`：824 绿 / 4 红，828 唯一主键，原四红一致 |
| `node tests/fuzz.mjs 800` | 0 | `tests/final-four-fuzz-final.log`、`tests/fuzz-expand-summary.json`、`tests/fuzz-expand-results.jsonl.gz`：16000 绿，0 外部边界，0 finding，0 crash |
| `node tests/fuzz-expand-verify.mjs` | 0 | `tests/final-four-fuzz-verify-final.log`、`tests/fuzz-expand-validation.json`：16000 唯一主键、320 个形状/方向/视觉桶各 50 案；重新生成每个 source/expected 并比较 actual |
| `node tests/property.mjs` | **1** | `tests/final-four-property-final.log`、`tests/property-results.json`：1110 绿 / 128 findings，1238 案；changedInputs/changedEnvironment 均空 |

property 全量四根明细：

| 性质 | 绿 / 总数 | findings |
|---|---:|---:|
| P1 | 202 / 203 | 1 |
| P2 | 122 / 223 | 101 |
| P3 | 202 / 203 | 1 |
| P4 | 584 / 609 | 25 |
| 合计 | **1110 / 1238** | **128** |

P1/P3 各保留一个 Responses Unicode-session finding；P4/P2 其余失败照原始证据保留，不扩大本次修复范围。历史 `tests/f4-p1-property-final.log` 同样为 1110/1238、128 findings；这里只证明数量一致，不声称对所有失败逐案重审。fuzz 生成域不含本次非法 surrogate / Unicode session 原向量，16000 全绿不是四红消失的证据。既有 fuzz/property 报告由原 runner 自动更新，本文是本轮权威处置结论。

## 5. 变更、验收与限制

- 直接修改：`tests/final-four.test.mjs`（5 项回归）、本文件、`api/family-variants.md`（本地接纳域声明）、`transport-unblock.md`（链接本轮结论，保留历史数字）。
- 自动再生：主矩阵、fuzz/property 结果与报告；全部 Node 测试还自动刷新 `tests/canonical-o18-results.json`、`tests/canonical-o18-wire-results.json`。这些是测试副产物，不是新增修复。
- 运行命令/退出码/耗时在 `tests/final-four-build-validation.json`、`tests/final-four-final-run-validation.json`；前后哈希、完整 changed/added/deleted 清单、四红账本、只读证明在 `tests/final-four-validation.json`。所有写入限于 `tests/**`、`docs/**`，没有源文件、锁文件或项目外修改。
- 初轮新测试 4/5 通过，正向夹具因漏带认证头返回 400，日志 `tests/final-four-node.log` 保留；补齐认证后 5/5，通过后又补了显式合法代理对转义并全量重跑，最终日志为上述 `*-final.log`。没有删弱失败断言。
- 工作目录没有 Git 元数据：`git status --short` exit 128，`git diff --cached --name-only` exit 129；未执行 `git add`/commit，但**无法独立认证 no-staged-files**，不将此证据缺口写成已通过。
- 剩余兼容风险明确保留：锁定客户端的三个未发送请求、当前模型拒收的一个已发送请求、property 128 findings；没有把它们隐藏到“不可逆协议丢失”名下。WS/ADC 专项未在本轮额外复跑；既有专项证据在 `transport-unblock.md`，不冒充本轮新结果。
- 下一步：独立 reviewer 核对原四红主键/异常、网络计数、标量域拒收及哈希清单，再决定验收；不需要为获得绿色数字而改动原案例。
