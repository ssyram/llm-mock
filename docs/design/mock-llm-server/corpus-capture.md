# 统一 Message 语料捕获

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

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
