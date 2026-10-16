# 统一 Message 语料捕获

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 如何继续找实验用例（原方法与离线复用）

### 来源与现有文档判断

原构建 session 为 `01a139a8-b5d1-7662-8f93-ad9dbbc5f7d7`，header 时间 `2026-10-14T09:05:20.337Z`；本地定位：`<pi-sessions>/<project-bucket>/2026-10-14T09-05-20-337Z_01a139a8-b5d1-7662-8f93-ad9dbbc5f7d7.jsonl`。以下是 JSONL 物理行与 entry ID，仅引用方法，不公开原对话正文：

| 定位 | 方法依据 |
| --- | --- |
| L12 `16085e00` | 原始 Mock 架构委托，确认这是构建本项目的 session |
| L250 `a64c66c1` | 用户要求真实 Pi session 单挂载验证采集扩展 |
| L357 `030f2d00`；L358 `55e35bb4` | 用户纠正“等对应 provider 才能采某种协议语料”：统一 Message 可跨 API 再编码 |
| L368 `a49b2979` | 用户要求实际 request/reply、多模型 thinking 来源；同时提出直接 fuzzing 构造 Message |
| L446 `d188a0d2` | 用户再次概括：从可用模型拿 Message 语料，再全面测试各 pi-ai API |
| L453 `eacc8ab0`；L711 `6c3c4c00` | 实际采用的扩充维度：可用模型 × 工具/推理；长 thinking、多工具、isError、中英混合、代码生成 |

方法主体已分别存在于本文的扩展/存储契约、[batch 3](corpus-batch3.md)、[batch 4](corpus-batch4.md)、[fuzz](fuzz.md) 和 [fuzz-expand](fuzz-expand.md)。教程讲 Mock 端到端运行，不是新语料发现清单。原缺项是这些步骤的来源链、离线找回与安全交付步骤；本节补足，不另建同义方法文档，也不把下面的安全流程说成原用户逐字指令。

### 可操作步骤

1. **先选真实来源，再按形状挑选。** 已授权本地 `.tmp-corpus-*/real-session/.pi/mock-corpus/capture-*.jsonl` 优先；每行取 `message`。从 batch 表按场次编号查找目录，只汇总 role、content.type、stopReason、isError、签名载体与工具数，不打印原文。缺捕获时，可只读本项目相关原生 Pi session 的 `type=message` 条目；这叫历史转录提取，不冒充扩展捕获或新模型请求。
2. **保留序列与来源差别。** extension JSONL 保留 `capturedAt` 包装；原生 session 提取只保留 `message`，不伪造 system 或 capturedAt。沿 `parentId` 验证选中消息同链，跳过非 Message 的 custom 元数据。优先完整工具往返；若只是连续片段，标明没有开场/收尾，不能自称完整请求上下文。不要拼接分支、补写模型答案或漏配工具结果。
3. **按原先维度扩充，而非为每个协议重新付费。** 对比 `tests/corpus.mjs` 与现有 fixtures，挑 thinking 在工具前/后、混合 text/thinking/toolCall、多轮异构工具、工具错误、provider 错误等差异。历史批次已记录但未分发的形状，应称“新增可交付样本”，不能称首次发现。图片/音频等没有真实来源时标缺口；按原建议构造的 fuzz 输入必须独立标成合成，不能算真实捕获。
4. **先脱敏，再落交付目录。** 原始文件只读；自由正文全部替换，而非只靠密钥正则。provider/model、路径/命令、账号、URL、调用与响应标识、时间及签名载荷一并替换；相同工具 ID 保持同一映射。保留 role/type、字段/数组形状、工具名和参数键、块顺序、stopReason/isError、错误分类；签名 JSON 仍是相同结构的 JSON 字符串，但不保留真实加密载荷。不要 `git add -f` 私有原始捕获。
5. **素材验证与协议验证分开。** 逐行解析、形状对比、配对、脱敏白名单、输出哈希与可重复导出是素材验证。接入对偶矩阵后，仍用锁定适配器分别验证 request/reply；同一 Message 能再编码不保证跨 API 签名有效。不得为了语料让 canonical/失败期待变绿。

如未来另获真实模型调用授权，继续使用本文加载方式及 batch 3/4 的短会话命令，先查可用模型/认证，分别采工具与推理形态；凭据不 ready 则记录并跳过。**本次仅离线复用，无收费模型请求、认证读取、外部账号或全局配置改动。** 已采素材也不代表原生目标协议的 wire 捕获。

### 本次新增脱敏材料与直接验证

目录：`tests/fixtures/corpus-discovery/`，共 **5 个 JSONL、25 条 Message、9 组完整工具配对**，另有 `manifest.json` 记录匿名批次位置/原 session 行号及交付文件 SHA-256。这些是**真实历史结构＋合成替换正文**，不是逐字原始捕获，也不是重新采样。

| 文件 | 来源 | 行数 | 相对现有交付的增量 |
| --- | --- | ---: | --- |
| `post-tool-thinking.jsonl` | batch 3 场次 5 | 5 | 工具成功后收尾包含 thinking＋text；历史已记载，现成为公开可解析样本 |
| `thinking-tool-success.jsonl` | batch 3 场次 9 | 5 | thinking＋toolCall 后接成功 toolResult，与 batch 4 的 thinking＋工具错误形成素材区分 |
| `provider-model-not-found.jsonl` | batch 3 场次 11 | 3 | HTTP 404 / model_not_found，空 content 的 error assistant；不当成成功回答 |
| `provider-thinking-rejected.jsonl` | batch 3 场次 13 | 3 | HTTP 400 / 1210，thinking 级别被拒；原失败保留，不补写成功结果 |
| `native-mixed-tool-rounds.jsonl` | 原 session L25–29、L33–36 | 9 | 连续两轮 thinking＋text＋3/4 个混合 bash/read，含 2 个 isError=true、5 个成功结果，保留 toolResult.details、JSON thinkingSignature/textSignature；比 batch 4 单轮两个 read 增加异构参数、混合成功/失败和连续工具轮次 |

原生片段 assistant entry 分别为 `c3c87937`、`3aa9baa3`；L30–32 是 custom 元数据而非统一 Message。该片段起于 assistant、止于工具结果，所有工具配对完整，但没有 user/system/最终回答，**不应直接作为完整对话或完整 request case**。原生 session 格式按实际保留，不声称这些消息由捕获扩展产生。

首次素材交付只建立独立文件；现已由 `tests/discovered-corpora.mjs` 校验manifest哈希并加载，经 `loadAllCorpora()` 进入十协议request/reply矩阵、transport和四根property。5份均以片段标识和provenance保留原顺序，不补写user/system或宣称完整会话；8条assistant也逐条作为reply素材。18场私有加载的缺失/损坏规则不变。batch 3四场的“新增”指可分发素材与组合，不声称首次发现形状。参照固定为官方 `vendor/pi-mono` v1.2.0 / `06a466935536f8c9bcacb2d5efc0fc021be1bdff`；下文历史采集版本记录保留。

在仓库根目录执行：

```sh
# 只读私有源并重现已脱敏内容；没有这些本地私有源的 clone 不跑这条
python3 scripts/export-corpus-materials.py --check
# 首次授权本地导出使用同一脚本、不传 --check；脚本从不输出原文
# 公开文件的解析、哈希、工具配对、具体形状及脱敏白名单测试，无私有源也可跑
node --test tests/corpus-materials.test.mjs tests/corpus.test.mjs
```

首次交付的素材检查实际通过：`CHECK: 5 sanitized excerpts, 25 messages; source shapes match`；当时Node为9/9（素材6项＋既有加载3项），这只证明素材。接入后的请求/回复及property结果由 `target/test-artifacts/` 本轮实际输出单独统计；`tests/discovered-corpora.test.mjs` 另外断言所有公开片段和assistant均进入构建器，不能以素材检查替代对偶。

加载某份素材可直接使用 `readFileSync(file, "utf8").trimEnd().split("\n").map(line => JSON.parse(line).message)`；manifest 的 source.kind 区分两种包装。导出脚本只匹配上述场次及固定原 session，不遍历导出所有历史，未知结构/枚举立即停止；`--check` 不写任何文件，并逐份比较脱敏字节与源/产物 JSON 形状。无需安装依赖、启动服务或运行付费模型。

脱敏保留字段存在性、JSON 值类型、数组长度、消息/块/工具顺序、工具参数键、ID 等价关系、时间大小关系、签名 JSON 载体形状及错误分类；普通数值/usage/cost 置零，时间映射为合成递增毫秒，所有非空自由字符串改为稳定编号（空串/纯空白保留）。因此损失原文语言/长度/推理含义、真实路径/命令、真实身份/时间/用量/费用和签名有效性，不能据此重现真实工具执行、账单或密码学校验，也不能把素材齐全当成协议正确证明。manifest 只保留用户要求的原方法 session 定位标识，不分发各捕获的私有 session UUID 或原始文件哈希。

## 捕获边界与 API 依据

`extensions/llm-corpus-capture.ts` 是 Pi 扩展，默认导出接收 `ExtensionAPI` 的工厂，通过 `pi.on("message_end", ...)` 观察最终化的统一 Message。仅接受 pi-ai 的 `system`、`user`、`assistant`、`toolResult` 四种 role，不采集 Pi 专用的 custom/bash/compaction 包装消息。

权威文档实际路径为 `<pi-mono>/packages/coding-agent/docs/extensions.md`，不是任务背景中的顶层 `docs/extensions.md`：

- 文档第 15–38 行：默认工厂及 `pi --extension ./hello.ts` 加载方式；Pi 通过 jiti 加载 TypeScript。
- 文档第 98–106 行：`pi.on()` 生命周期事件与 `message_end` 可替换最终消息的契约。本扩展不返回替换结果。
- `packages/coding-agent/src/core/extensions/types.ts:1088–1091`：`MessageEndEvent = { type: "message_end"; message: AgentMessage }`。
- `packages/agent/src/types.ts:523–527`：message lifecycle 明确覆盖 system/user/assistant/toolResult；只有 assistant 的流式过程发出 `message_update`。
- `packages/agent/src/agent-loop.ts:119–121`：初始统一消息逐条发出 `message_start`、`message_end`；工具结果同样发出完成事件（第 946–948 行）。系统提示/工具集变更也会作为真正的 system Message 发出，插件不构造或伪造 system 消息。
- `packages/ai/src/types.ts:541` 起定义统一 Message，包括 system 的 `sections`、`toolsAdded`、`toolsRemoved`，以及内联 `role`/`type`、camelCase 字段。

这里捕获的是会话转录层，不监听 `provider_stream_event`、HTTP、SSE 或请求 payload，也不借用 `context`/`context_with_system` 重复捕获历史消息。锁定的 pi-ai 适配器可以从统一 Message 再生目标厂商 wire，对偶测试使用该再生路径，语料本身无需绑定某个 wire 协议。

## 加载方式

从待捕获会话的项目目录运行：

```sh
pi --extension <repo>/extensions/llm-corpus-capture.ts
```

扩展本身不自动启用；也可以由使用者配置 Pi 的扩展加载路径。安装依赖使用 Pi 的 `@earendil-works/pi-coding-agent`、`@earendil-works/pi-ai` 类型；运行时仅导入 Node 的文件系统与路径模块。无需改动 Rust 服务。

## 存储格式

目标目录是事件上下文 `ctx.cwd` 下的 `.pi/mock-corpus/`，会话 ID 来自 `ctx.sessionManager.getSessionId()`：

- `capture-<sessionId>.jsonl`：一行一条最终化统一 Message，严格为 `{"capturedAt": <Unix ms>, "message": <Message JSON>}`；不混入元数据行。
- `capture-<sessionId>.meta.json`：包含 `sessionId`、初次捕获时的 `provider`、`model`（model ID）、`api`、`startedAt`（会话 header 开始时间，Unix ms）、`captureStartedAt`。没有选中模型时模型三字段为 null。
- `capture-<sessionId>.errors.jsonl`：尽力记录写入/序列化错误，每行包含 `loggedAt`、错误 `name`、文件系统错误 `code`；不记录消息正文或异常文本，避免凭据/语料进入错误日志。

消息对象只经 `JSON.stringify`，不投影、不重命名、不删减字段、不修改原消息。JSON 本身会省略 undefined 等非 JSON 值；保留 content、toolCall、toolCallId、thinking/signature、usage、timestamp、diagnostics 等对象已有的可序列化字段。数据文件和日志以 0600 创建，目录以 0700 创建；已存在目录/文件的权限不改变。

会话开始时建立 sidecar；独占创建（`wx`）防止 resume/reload 覆盖原始元数据。消息文件以追加方式打开。工厂内的 Promise 队列串行化写入，处理器等待当前写入完成，shutdown 等待队列结束。不同 session ID 分开存储；切换会话从事件上下文重新取得目标与元数据。任何序列化或写入失败均不向 Pi 抛出，不返回改变会话的结果。

## 已知限制与假设

- 仅保存挂载后实际收到的最终化消息；不回填已存在的历史、不保存流式 partial。中断/报错的 assistant 如果 Pi 发出 `message_end`，也会原样保留 stopReason 等状态。
- 默认假设一条会话只有一个捕获进程。resume/reload 继续追加，但没有跨进程文件锁或全局去重。分支切换、重试、重复用户内容均按实际事件保留；文件是事件历史，不自动重构某个分支的有效上下文。
- sidecar 描述首次捕获的模型，不是所有后续模型切换记录。assistant 本身保留实际 provider/model/api；system/user/toolResult 通常不携带模型身份。
- `message_end` 按扩展加载顺序执行。如果之后的其他扩展替换消息，本插件观察到的版本可能不是最终持久化版本；建议把捕获扩展放在消息转换扩展之后。本次测试仅挂载捕获插件。
- 纯观察表示不修改输入、不调用模型、不调用工具、不改变会话状态。等待磁盘写入仍有少量延迟；没有后台无限缓冲。
- 没有 fsync、断电恢复、轮转、大小上限或自动脱敏；进程硬退出可能留下不完整行。工具输出、提示、签名和图片等可能包含敏感信息，应人工审查后才分享语料。
- 文件系统完全不可写/磁盘满时日志也可能写不了；二次日志错误被吞掉以不打断会话，不承诺错误日志必达。
- 这里保存原始 JSON，并不等同于 mock server 对偶 canonical form；校验方仍需遵循锁定适配器/canonical 规则。本机 Pi 与只读 pi-mono 版本可能不同。

## 实测记录

### 环境与凭据检查

- 只读参考 pi-mono commit：`371cc25eb28d862d8ac7f218cbc315eaeccd669c`。
- 本机 `pi --version`：`1.0.3`；已安装 coding-agent/pi-ai 均为 `1.0.3`。TypeScript 严格检查针对本机安装的声明进行，实际运行也是此版本；不声称真实样本生成于锁定 pi-ai 1.2.0。
- 使用 `pi --list-models glm-5.3-flash` 确认可选模型，再执行以下不输出凭据的 readiness 检查：

```sh
pi auth check --provider provider-unavailable-1 --model glm-5.3-flash --json
pi auth check --provider provider-unavailable-2 --model glm-5.3-flash --json
pi auth check --provider provider-unavailable-3 --model glm-5.3-flash --json
pi auth check --provider provider-b --model glm-5.3-flash --json
```

前三个检查退出码 2，返回 `status: invalid, reason: invalid_state`；最后一个退出码 0，返回 `{"status":"ready","provider":"provider-b","authType":"api_key"}`。因此实际使用 **provider `provider-b` / model `glm-5.3-flash` / api `openai-completions`**，未尝试用失败的 provider 发付费请求，也未读取或输出凭据。

### 真实会话命令

测试目录全部位于本仓库内的 `.tmp-corpus-capture-sample/`；没有写入 pi-mono。`real-session/corpus-probe.txt` 预先写入 `synthetic capture probe: example payload`。

```sh
cd <repo>/.tmp-corpus-capture-sample/real-session
pi --provider provider-b --model glm-5.3-flash --thinking off \
  --no-extensions \
  --extension <repo>/extensions/llm-corpus-capture.ts \
  --no-skills --no-prompt-templates --no-context-files --tools read \
  --session-dir ./sessions --mode json --print \
  'Read corpus-probe.txt once, then summarize the result. (Synthetic equivalent prompt.)' \
  > pi-output.jsonl 2> pi-stderr.log
```

退出码 0；`--no-extensions` 禁用自动发现和内置扩展，显式 `--extension` 仍加载。单次用户输入，恰好一次 `read` 调用，两次模型回复（工具调用与最终总结），无其他工具调用。最终输出为 `Synthetic probe result.`，stderr 为 0 字节。

会话 ID：`00000000-0000-4000-8000-000000000001`。生成：

```text
real-session/.pi/mock-corpus/capture-00000000-0000-4000-8000-000000000001.jsonl
real-session/.pi/mock-corpus/capture-00000000-0000-4000-8000-000000000001.meta.json
real-session/sessions/2000-01-01T00-00-00-000Z_00000000-0000-4000-8000-000000000001.jsonl
```

时间取自本机 Pi 会话时钟，不校准墙钟。sidecar 的 `startedAt = 946684800508`、`captureStartedAt = 946684800591`，与会话 header 开始时间一致。

### 结果与独立复验

在仓库根目录执行：

```sh
node .tmp-corpus-capture-sample/verify-real-capture.mjs
node --test .tmp-corpus-capture-sample/capture.test.mjs
node <pi-mono>/node_modules/typescript/bin/tsc \
  -p .tmp-corpus-capture-sample/tsconfig.json
```

以上均退出码 0。第一条断言式验证的输出摘要：

```json
{
  "rows": 5,
  "messageEndEvents": 5,
  "persistedMessages": 5,
  "roles": {"system": 1, "user": 1, "assistant": 2, "toolResult": 1},
  "toolCalls": 1,
  "provider": "provider-b",
  "model": "glm-5.3-flash",
  "api": "openai-completions",
  "inputTokens": 876,
  "outputTokens": 54,
  "reportedCost": 0,
  "finalText": "Synthetic probe result.",
  "exactMessageEquality": true,
  "errors": 0
}
```

`reportedCost` 是 provider 返回的 usage 汇总，不代表真实账单为零；只运行这一次短会话。

验证不只数行：JSONL 每行可解析，顶层只有 `capturedAt`、`message`；四种 role 齐全，timestamp/capturedAt 是整数，内容块使用内联 `type`。assistant 带 provider/model/api/usage；恰好一个 `toolCall`，其 id 与 toolResult 的 `toolCallId` 一致，工具名都是 `read`，`isError` 为 false，输出包含测试文件原文。system 原样保留 `content`、`sections`、`toolsAdded`。最重要的是：捕获的五个 `message` 对象与 CLI 的五个 `message_end.message`、原生会话文件的五个 `message` 条目逐对象深度相等，无投影或字段重写。没有生成错误日志。

第二条为 6 项 Node 测试，6 pass / 0 fail：四种 role 原样保存并忽略 Pi 专用 role；并发回调有序且在异步 I/O 前固定 JSON 快照；重新创建扩展工厂后 metadata 不覆盖且继续追加，切换 session 独立存储；append 失败记录文件系统错误且不外抛；序列化失败不影响后续捕获；捕获目录与错误日志都不可创建时也不外抛。测试与复验脚本保留在临时目录，不增加生产依赖。

本仓库根目录没有 `.git`，`git status --short` 返回 not a git repository，无法提供 Git diff 或 index 审核；`test ! -e .git` 成功。没有执行任何暂存命令。交付文件仅新增扩展与本设计文档，其余写入均在上述临时测试目录，未修改 src/scripts/Cargo.toml/api/architecture.md。独立 reviewer 的验收仍需由上层安排。
