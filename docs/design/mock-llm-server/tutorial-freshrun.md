# Mock LLM Server hands-on tutorial：新用户实跑记录

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 范围与结论

本记录只以 `hands-on-tutorial.md` 为操作说明；没有查阅教程之外的项目文档或源码。命令与输出均为本次实际执行，输出中的 ANSI 控制码已省略或保留可读文本。实验文件放在 `/tmp/mock-pi-e2e`。教程提供的目录在本次执行前并非干净：mount 配置和 capture 文件已存在，导致挂载生命周期无法按新鲜环境安全完整重演。

**结论：** 构建、pi 的 completions 多轮/工具/错误、pi 的 responses 与 pi-messages、OpenCode 的 completions、专属端口以及 wire 级 tool 往返均成功。挂载新增命令因已存在的 mount 返回 409；生命周期的 remove/重启/恢复链路没有执行，因为会删除本次开始前已有的 mount。另有一次 OpenCode 命令未在教程指定目录执行，以及一次我抄录脚本漏括号，均已如实记录并重试。

## 按教程顺序的实际操作

### 1. 构建和临时目录

执行：

```sh
cargo build
```

实际输出：

```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.07s
```

结论：成功。随后执行教程的目录创建命令：

```sh
mkdir -p /tmp/mock-pi-e2e/{agent/extensions/round-probe,pi-proj,oc-proj,cap,sessions}
```

实际输出为空，退出成功。

**新手第一反应：** `mkdir -p` 不会清理旧文件；教程没有先说明这个临时目录若已存在，后续状态文件和 capture 会延续/混杂。我启动服务后才发现 mount 文件中已经有多项配置。

### 2. 启动 server 与挂载脚本

用教程参数启动 server（为保留后台进程真实输出，日志重定向到 `/tmp/mock-pi-e2e/server.log`）：

```sh
./target/debug/mock-llm-server --port 18000 --capture-dir /tmp/mock-pi-e2e/cap --mounts-file /tmp/mock-pi-e2e/mounts.json > /tmp/mock-pi-e2e/server.log 2>&1 &
```

shell 返回 PID：

```text
7421
```

服务日志：

```text
mock-llm-server listening on http://127.0.0.1:18000
```

监听检查显示：

```text
mock-llm- 7421 <user> ... TCP 127.0.0.1:18000 (LISTEN)
```

分别照教程执行三条 `add`（下面为第一条；另两条命令分别是教程的 `roundtool`、`failtest`）：

```sh
./target/debug/mock-llm-server add "node <repo>/scripts/mock-scripts/round-counter.mjs" --name roundtext
```

```text
HTTP 409: {"error":{"code":"mount_exists","message":"mount roundtext already exists"}}
Command exited with code 1
```

另两条返回：

```text
HTTP 409: {"error":{"code":"mount_exists","message":"mount roundtool already exists"}}
Command exited with code 1
```

```text
HTTP 409: {"error":{"code":"mount_exists","message":"mount failtest already exists"}}
Command exited with code 1
```

按教程查看 `list`，实际输出中的 mount 名称为：

```text
failtest, lifecycle, roundtext, roundtool
```

`/tmp/mock-pi-e2e/mounts.json` 实际已有如下配置（命令为完整 JSON）：

```json
{
  "failtest": "node <repo>/scripts/mock-scripts/failing.mjs",
  "lifecycle": "node <repo>/scripts/mock-scripts/round-counter.mjs",
  "roundtext": "node <repo>/scripts/mock-scripts/round-counter.mjs",
  "roundtool": "node <repo>/scripts/mock-scripts/round-counter.mjs --mode=tool"
}
```

**困惑与结论：** 教程把目录称为临时工作目录，但直接重用目录时会遇到已挂载错误。server 本身启动成功；我没有删除/覆盖已有配置，也没有改用其它端口绕开，因为这会改变教程场景。继续使用现存 mount 执行后面的非破坏性请求。

### 3. pi × completions：text 多轮

按 §3.0 写入教程所示五个 provider 的 `/tmp/mock-pi-e2e/agent/models.json`，并运行教程的 pi 命令。首轮输出：

```text
ROUND-1: 1
```

我误把共享同一个 session 的第二轮和第三轮命令并行启动，二者实际都输出：

```text
ROUND-2: 2
```

这是我执行时的顺序错误，不是教程按顺序执行的结果。随后按顺序再运行第三轮命令，输出：

```text
ROUND-3: 3
```

结论：最终按顺序得到 `ROUND-1: 1`、`ROUND-2: 2`、`ROUND-3: 3`。首轮之后两条并发续跑结果不应当被当作独立轮次证据。

### 4. pi × completions：工具往返

按教程写入 `/tmp/mock-pi-e2e/agent/extensions/round-probe/index.ts`，运行 `pi --tools round_probe`，实际输出：

```text
ROUND-2: 2
```

结论：成功，符合教程预期。

### 5. pi × completions：错误路径

教程的 failing provider 命令实际打印：

```text
429: {"code":"mock_failure","message":"intentional mock failure","type":"invalid_request_error"}
Command exited with code 1
```

直连 wire 的 `curl -sS -i` 实际响应：

```text
HTTP/1.1 429 Too Many Requests
content-type: application/json
content-length: 101

date: Sat, 01 Jan 2000 00:00:00 GMT

{"error":{"code":"mock_failure","message":"intentional mock failure","type":"invalid_request_error"}}
```

结论：协议错误与教程所述一致；pi 命令失败退出（教程预期的错误路径）。

### 6. pi × openai-responses

第一轮实际输出：

```text
ROUND-1: 1
```

顺序续跑第二轮实际输出：

```text
ROUND-2: 2
```

结论：成功。

### 7. pi × pi-messages

第一轮实际输出：

```text
ROUND-1: 1
```

顺序续跑第二轮实际输出：

```text
ROUND-2: 2
```

结论：成功。

### 8. OpenCode × completions

按教程写入 `/tmp/mock-pi-e2e/oc-proj/opencode.json`。我第一次漏掉教程中的 `cd /tmp/mock-pi-e2e/oc-proj`，在默认目录直接运行，实际得到：

```text
Error: {
  "name": "UnknownError",
  "data": {
    "message": "Unexpected server error. Check server logs for details.",
    "ref": "err_synthetic_009"
  }
}
Command exited with code 1
```

这次失败是我没有遵守教程的工作目录步骤，不作为教程运行结果。切换到教程指定目录重跑后，第一轮输出：

```text
> build · mock-m
ROUND-1: 1
```

续跑第二轮输出：

```text
> build · mock-m
ROUND-2: 2
```

结论：在教程指定目录中成功。新手需要注意配置文件依赖当前目录；忘记 `cd` 时错误没有直接指出配置文件未被读取。

### 9. 挂载生命周期

教程预期先新增 `lifecycle` mount。我实际执行：

```sh
./target/debug/mock-llm-server add "node <repo>/scripts/mock-scripts/round-counter.mjs" --name lifecycle
```

输出：

```text
HTTP 409: {"error":{"code":"mount_exists","message":"mount lifecycle already exists"}}
Command exited with code 1
```

对已存在的 mount 执行教程的生命周期首个请求，实际输出：

```text
data: {"choices":[{"delta":{"content":"ROUND-1: 1"},"index":0}]}
data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}]}
data: {"choices":[],"usage":{"completion_tokens":1,"prompt_tokens":1,"prompt_tokens_details":{"cached_tokens":0}}}
data: [DONE]
```

**结论：** 已有 mount 可以响应，但 `add → remove → 404 → 重启 → 恢复` 不能在这次状态上安全复现。因为该 mount 在我操作前已存在，我没有按教程删除它，也没有验证 remove 后 404 或重启恢复。该生命周期场景：**部分执行，整体未验证**。

### 10. 专属端口兜底

新增本次实验独有的 `pinned` mount，实际输出：

```json
{"name":"pinned","command":"node <repo>/scripts/mock-scripts/round-counter.mjs","port":18200,"url":"http://127.0.0.1:18000/pinned","port_url":"http://127.0.0.1:18200"}
```

`curl` 请求 `http://127.0.0.1:18200/v1/chat/completions` 的响应：

```text
data: {"choices":[{"delta":{"content":"ROUND-1: 1"},"index":0}]}
data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}]}
data: {"choices":[],"usage":{"completion_tokens":1,"prompt_tokens":1,"prompt_tokens_details":{"cached_tokens":0}}}
data: [DONE]
```

我移除刚才由本次操作新增的 `pinned`，实际输出：

```json
{"removed":"pinned"}
```

结论：专属端口调用成功，移除命令成功。教程的 `lsof` 验证端口释放也已检查：18200 无监听输出，命令退出码为 1（没有匹配监听进程）。

### 11. wire 级 tool 往返

首次抄写教程脚本时我漏了一个右花括号，实际运行出现语法错误：

```text
SyntaxError: Unexpected token ']'
Command exited with code 1
```

对照教程原文补上遗漏的括号后，`node /tmp/mock-pi-e2e/tool-roundtrip.mjs` 实际输出：

```text
round1 status: 200
round1 frame: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\"round\":1}","name":"round_probe"},"id":"call_round_1","index":0,"type":"function"}]}],"index":0}]}
round1 frame: {"choices":[{"delta":{},"finish_reason":"tool_calls","index":0}]}
round1 frame: {"choices":[],"usage":{"completion_tokens":1,"prompt_tokens":2,"prompt_tokens_details":{"cached_tokens":0}}}
round1 frame: [DONE]
tool_call received: {"function":{"arguments":"{\"round\":1}","name":"round_probe"},"id":"call_round_1","index":0,"type":"function"}
round2 status: 200
round2 frame: {"choices":[{"delta":{"content":"ROUND-2: 2"},"index":0}]}
round2 frame: {"choices":[{"delta":{},"finish_reason":"stop","index":0}]}
round2 frame: {"choices":[],"usage":{"completion_tokens":1,"prompt_tokens":3,"prompt_tokens_details":{"cached_tokens":0}}}
round2 frame: [DONE]
```

结论：校正抄录后往返成功；首次报错是我的抄录失误。

### 12. 收尾与现场限制

我只停止本次启动的进程 `7421`。之后 `lsof -nP -iTCP:18000 -sTCP:LISTEN` 与 `lsof -nP -iTCP:18200 -sTCP:LISTEN` 均无输出（无监听进程）。

capture 目录执行 `ls -1 /tmp/mock-pi-e2e/cap` 时已有从 `req-000001` 到 `req-000022` 的文件，且多个编号同时出现不同 API 后缀。这说明目录并非空白；本次请求的 capture 与旧文件混在一起，不能据文件名可靠判断哪些 capture 属于本轮，也不能复现教程声称的干净计数序列。教程的 F3 提醒重启会覆盖同名 capture，但未覆盖“实验启动前 capture 目录已经有内容”的处理办法：**教程未覆盖**。

## 其他可用性观察

- 原始教程使用本机固定路径；发布版已改为 `<repo>` 占位，执行前仍需替换为实际仓库位置。
- 教程给出了 `opencode` 的工作目录，且只有进入目录配置才被读取；第一次使用者容易漏掉 `cd`，实际错误只显示通用 `Unexpected server error`。
- 本次教程目录不是全新状态，三条初始 mount 命令全部 409。教程没有要求启动前检查或清理 `/tmp/mock-pi-e2e`。我没有自行清理，所以生命周期测试受阻。
- 教程未描述如何证明 mount 文件、capture 目录及 session 目录确实是新建空目录：**教程未覆盖**。
- 尝试 `git status --short` 以及 `git -C <repo> status --short` 均得到 `fatal: not a git repository (or any of the parent directories): .git`。因此本次无法用 Git 确认 staged 状态或精确识别除报告外的工作区变化。

## 总体结果

| 场景 | 本次结果 |
|---|---|
| `cargo build` | 成功 |
| pi completions 文本多轮 | 成功；两条同 session 续跑曾被我错误并行执行，补做顺序第三轮后得到 1/2/3 |
| pi completions 工具往返 | 成功 |
| pi completions 错误路径 | pi 退出码 1；wire HTTP 429，成功验证错误透传 |
| pi openai-responses | 两轮成功 |
| pi pi-messages | 两轮成功 |
| OpenCode completions | 第一次未进入配置目录失败；按教程目录重跑后两轮成功 |
| mount lifecycle | 已存在 mount 可调用；完整 add/remove/404/restart/restore 未验证，避免删除预存配置 |
| 专属端口 | 请求成功；本次新增 mount 已移除，端口释放 |
| wire tool 往返 | 脚本抄录修正后两轮成功 |

**总体判断：** 教程主要端到端用法可执行，成功路径输出与教程一致。新用户可用性最明显的问题是教程默认 `/tmp/mock-pi-e2e` 全新，但没有给出如何识别旧状态/处理冲突的说明；本次这直接阻断了生命周期全流程。教程未覆盖部分已明确标出，没有尝试自创步骤补齐。
