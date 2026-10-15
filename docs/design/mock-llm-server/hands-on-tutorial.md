# Mock Server 上手走查（hands-on tutorial）

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

日期：2000-01-01（UTC）。环境：macOS（Apple Silicon）、`cargo` 1.x、`node` v26.8.1、`pi` 1.0.3、`opencode` 1.18.31-fmv3-beta.14。仓库：`<repo>`。

本文是第一次使用者的全程走查：原始记录来自实际执行；本发布版已脱敏。执行前将 `<repo>` 替换为本仓库绝对路径、`<pi-mono>` 替换为同级参照仓库路径；示例输出中的匿名值无需照填。E2E 矩阵结果先行：

| # | 场景 | 结果 |
|---|---|---|
| ①a | pi × completions × text × 多轮（3 轮） | ✅ `ROUND-1: 1` → `ROUND-2: 2` → `ROUND-3: 3` |
| ①b | pi × completions × tool 往返（真实工具执行） | ✅ `ROUND-2: 2`（第 1 轮 toolCall，pi 执行 `round_probe`，第 2 轮收尾） |
| ①c | pi × completions × 错误路径（failing 脚本） | ✅ pi 报 `429: mock_failure`，exit=1；wire 级 HTTP 429 |
| ② | pi × openai-responses 格式（真 harness） | ✅ `ROUND-1: 1` / `ROUND-2: 2`，capture 佐证 |
| ③ | pi × pi-messages 格式 | ✅ `ROUND-1: 1` / `ROUND-2: 2`，capture 佐证 |
| ④ | OpenCode × completions（复刻 ROUND-1/2） | ✅ `ROUND-1: 1` / `ROUND-2: 2` |
| ⑤ | 挂载生命周期 add→打→remove→404→重启→恢复→再打通 | ✅ 全链路成立 |
| ⑥ | 专属端口兜底 | ✅ `:18200/v1/chat/completions` 直达 200 |

Findings（真实发现，未绕过）：pi 对 429 自动重试 4 次；OpenCode 每次 run 先发一个"标题生成"小请求；`--capture-dir` 计数器在 server 重启后归零并覆盖同名文件（见 §11）。

---

## 1. 构建与准备

```sh
$ cd <repo>
$ cargo build
   Compiling mock-llm-server v0.1.0 (<repo>)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.24s
```

工作目录（教程全程使用，pi 的 agentDir 与项目隔离，不动你自己的 `~/.pi`）：

```sh
$ mkdir -p /tmp/mock-pi-e2e/{agent/extensions/round-probe,pi-proj,oc-proj,cap,sessions}
```

### 1.1 现场检查：识别旧状态

`mkdir -p` 不会清理旧文件。若这台机器之前跑过本教程（或别的实验用过同名目录），`/tmp/mock-pi-e2e` 会残留旧状态——挂载表、capture、session 全部延续/混杂，后面的 `add` 会直接撞 409。动手前先自查：

```sh
$ ls /tmp/mock-pi-e2e                          # 目录已存在且 mounts.json / cap / sessions 非空 ⇒ 不是全新环境
$ cat /tmp/mock-pi-e2e/mounts.json             # 残留的挂载表（server 没跑也能看）
$ lsof -nP -iTCP:18000 -sTCP:LISTEN | tail -1  # 旧 server 是否还在监听
$ ./target/debug/mock-llm-server list          # （server 在跑时）当前实际挂载了哪些 mount
```

若 `add` 时已经撞到 409（`{"error":{"code":"mount_exists","message":"mount <name> already exists"}}`），就是碰上了旧状态，二选一处置：

- **换全新目录重走**（推荐）：`mkdir -p` 一个新目录（如 `/tmp/mock-pi-e2e-2`），把后文命令里的 `/tmp/mock-pi-e2e` 全部替换成它再走。不碰旧状态，零风险。
- **`list` 确认后 `remove`**：先用 `list` 逐个核对现存 mount 确实是自己此前所建（name、命令都对得上），再 `./target/debug/mock-llm-server remove <name>` 清掉要重演的几个，重新 `add`。认不出来源的 mount 不要删——尤其 §7 生命周期演练只应在**自己新建的目录/mount** 上执行（见 §7 开头提醒）。

## 2. 起常驻 server 并挂载脚本

server 的挂载表默认写 `./mounts.json`；本走查用 `--mounts-file` 指到 /tmp，避免污染仓库文件（教程若在空目录跑可省略该参数）。

```sh
$ ./target/debug/mock-llm-server --port 18000 --capture-dir /tmp/mock-pi-e2e/cap --mounts-file /tmp/mock-pi-e2e/mounts.json &
mock-llm-server listening on http://127.0.0.1:18000
$ lsof -nP -iTCP:18000 -sTCP:LISTEN | tail -1
mock-llm- 94816 <user>    6u  IPv4 0x0000000000000000      0t0  TCP 127.0.0.1:18000 (LISTEN)
```

挂载三个脚本（同一 server 上三个独立 mount）：

```sh
$ ./target/debug/mock-llm-server add "node <repo>/scripts/mock-scripts/round-counter.mjs" --name roundtext
{"name":"roundtext","command":"node <repo>/scripts/mock-scripts/round-counter.mjs","port":null,"url":"http://127.0.0.1:18000/roundtext","port_url":null}

$ ./target/debug/mock-llm-server add "node <repo>/scripts/mock-scripts/round-counter.mjs --mode=tool" --name roundtool
{"name":"roundtool","command":"node <repo>/scripts/mock-scripts/round-counter.mjs --mode=tool","port":null,"url":"http://127.0.0.1:18000/roundtool","port_url":null}

$ ./target/debug/mock-llm-server add "node <repo>/scripts/mock-scripts/failing.mjs" --name failtest
{"name":"failtest","command":"node <repo>/scripts/mock-scripts/failing.mjs","port":null,"url":"http://127.0.0.1:18000/failtest","port_url":null}

$ ./target/debug/mock-llm-server list | python3 -c "import json,sys; print([s['name'] for s in json.load(sys.stdin)['scripts']])"
['failtest', 'roundtext', 'roundtool']
```

## 3. pi 接入（①：completions 格式 × text/tool/错误 × 多轮）

### 3.0 自建 provider（models.json）

pi 1.0.3 只读 **agentDir** 的 `models.json`（不读项目 `.pi/models.json`），用 `PI_CODING_AGENT_DIR` 重定向到隔离目录。写入 `/tmp/mock-pi-e2e/agent/models.json`（同时备好后面 ②③ 要用的两个 provider）：

```json
{
  "providers": {
    "roundtext": {
      "baseUrl": "http://127.0.0.1:18000/roundtext/v1",
      "api": "openai-completions",
      "apiKey": "roundtext",
      "models": [{ "id": "mock-m", "contextWindow": 100000, "maxTokens": 1024 }]
    },
    "roundtool": {
      "baseUrl": "http://127.0.0.1:18000/roundtool/v1",
      "api": "openai-completions",
      "apiKey": "roundtool",
      "models": [{ "id": "mock-m", "contextWindow": 100000, "maxTokens": 1024 }]
    },
    "failtest": {
      "baseUrl": "http://127.0.0.1:18000/failtest/v1",
      "api": "openai-completions",
      "apiKey": "failtest",
      "models": [{ "id": "mock-m", "contextWindow": 100000, "maxTokens": 1024 }]
    },
    "respmock": {
      "baseUrl": "http://127.0.0.1:18000/roundtext/v1",
      "api": "openai-responses",
      "apiKey": "respmock",
      "models": [{ "id": "mock-m", "contextWindow": 100000, "maxTokens": 1024 }]
    },
    "pimock": {
      "baseUrl": "http://127.0.0.1:18000/roundtext",
      "api": "pi-messages",
      "apiKey": "pimock",
      "models": [{ "id": "mock-m", "contextWindow": 100000, "maxTokens": 1024 }]
    }
  }
}
```

要点：`baseUrl` 指到 `http://127.0.0.1:18000/<name>/v1`（挂载前缀路由），`apiKey` 随便填（server 原样透传为 `keyId`）。

### 3.1 text 多轮（ROUND-1 → ROUND-2 → ROUND-3）

```sh
$ cd /tmp/mock-pi-e2e/pi-proj
$ PI_CODING_AGENT_DIR=/tmp/mock-pi-e2e/agent pi --print --offline --approve --no-tools \
    --model roundtext/mock-m --session-dir /tmp/mock-pi-e2e/sessions "first question: what round is it?"
ROUND-1: 1

$ PI_CODING_AGENT_DIR=/tmp/mock-pi-e2e/agent pi --print --offline --approve --no-tools \
    --model roundtext/mock-m --session-dir /tmp/mock-pi-e2e/sessions -c "second question: what round is it now?"
ROUND-2: 2

$ PI_CODING_AGENT_DIR=/tmp/mock-pi-e2e/agent pi --print --offline --approve --no-tools \
    --model roundtext/mock-m --session-dir /tmp/mock-pi-e2e/sessions -c "third question: and now?"
ROUND-3: 3
```

三轮全部正确（均 exit=0）。`--capture-dir` 落盘的解码请求佐证无状态范式（第 3 轮请求含 2 条 assistant）：

```text
req-000004-openai-completions.json api=openai-completions keyId='roundtext'
  roles=['system','user','assistant','user','assistant','user']
```

### 3.2 tool 往返（真 harness 真工具执行）

mock 第 1 轮回 `toolCall`，需要 harness 真的有一个叫 `round_probe` 的工具。写 pi 扩展 `/tmp/mock-pi-e2e/agent/extensions/round-probe/index.ts`：

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "round_probe",
    label: "Round Probe",
    description: "Echoes back the round number passed by the model.",
    promptSnippet: "Call round_probe whenever asked to probe the round.",
    parameters: Type.Object({ round: Type.Number() }),
    execute: async (_id, params) => ({
      content: [{ type: "text", text: `probe-ok:${params.round}` }],
      details: params,
    }),
  });
}
```

用 `--tools round_probe` 只启用这一个工具再跑（不加 `--no-tools`）：

```sh
$ PI_CODING_AGENT_DIR=/tmp/mock-pi-e2e/agent pi --print --offline --approve --tools round_probe \
    --model roundtool/mock-m --session-dir /tmp/mock-pi-e2e/sessions "please probe the round"
ROUND-2: 2
```

过程（capture 佐证，运行当时检查）：

```text
req-000003: keyId=roundtool roles=[system, user]                          # 第1轮 → mock 回 toolCall
req-000004: keyId=roundtool roles=[system, user, assistant, toolResult]
  assistant toolCall: round_probe {'round': 1}
  toolResult: call_round_1  content: [{'text': 'probe-ok:1'}]             # pi 扩展真执行了工具
```

即：mock 回 `toolCall(round_probe, {"round":1})` → pi 执行扩展工具得 `probe-ok:1` → 第 2 轮 transcript 回传 → mock 收尾 `ROUND-2: 2`。（注意：这两个 capture 文件后被重启后的新请求覆盖，见 §11 F3；摘录为覆盖前当场检查所得。）

wire 级对照（自写脚本，见 §10）：第 1 轮 SSE 回 `tool_calls` 帧（`finish_reason":"tool_calls"`），第 2 轮回填 `role:"tool"` 消息后收 `ROUND-2: 2`——与 pi 行为逐帧一致。

### 3.3 错误路径（failing 脚本 → 协议内可见错误）

```sh
$ PI_CODING_AGENT_DIR=/tmp/mock-pi-e2e/agent pi --print --offline --approve --no-tools \
    --model failtest/mock-m --session-dir /tmp/mock-pi-e2e/sessions "trigger the intentional failure"
429: {"code":"mock_failure","message":"intentional mock failure","type":"invalid_request_error"}
$ echo $?
1
```

wire 级（curl 直打，无认证头也能到脚本，keyId 为空串）：

```sh
$ curl -sS -i -X POST http://127.0.0.1:18000/failtest/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -d '{"model":"mock-m","messages":[{"role":"user","content":"trigger failure"}],"stream":false}'
HTTP/1.1 429 Too Many Requests
content-type: application/json
content-length: 101

{"error":{"code":"mock_failure","message":"intentional mock failure","type":"invalid_request_error"}}
```

脚本声明的 `429/mock_failure` 原样透传（历史 F2 bug——恒变 500 `script_error_invalid`——已修复）。

## 4. pi × openai-responses 格式（②）

provider `respmock`（见 §3.0）：`api:"openai-responses"`、`baseUrl` 仍指 `.../roundtext/v1`（同一挂载，另一协议路径 `/v1/responses`）。

```sh
$ PI_CODING_AGENT_DIR=/tmp/mock-pi-e2e/agent pi --print --offline --approve --no-tools \
    --model respmock/mock-m --session-dir /tmp/mock-pi-e2e/sessions "responses-format round one"
ROUND-1: 1

$ PI_CODING_AGENT_DIR=/tmp/mock-pi-e2e/agent pi --print --offline --approve --no-tools \
    --model respmock/mock-m --session-dir /tmp/mock-pi-e2e/sessions -c "responses-format round two"
ROUND-2: 2
```

capture 佐证（走的是 openai-responses 解码器）：

```text
req-000009-openai-responses.json keyId='respmock' roles=['system', 'user']
req-000010-openai-responses.json keyId='respmock' roles=['system', 'user', 'assistant', 'user']
```

## 5. pi × pi-messages 格式（③）

provider `pimock`：`api:"pi-messages"`、**baseUrl 不带 `/v1`**（客户端会 POST 到 `baseUrl + /messages`）：

```sh
$ PI_CODING_AGENT_DIR=/tmp/mock-pi-e2e/agent pi --print --offline --approve --no-tools \
    --model pimock/mock-m --session-dir /tmp/mock-pi-e2e/sessions "pi-messages round one"
ROUND-1: 1

$ PI_CODING_AGENT_DIR=/tmp/mock-pi-e2e/agent pi --print --offline --approve --no-tools \
    --model pimock/mock-m --session-dir /tmp/mock-pi-e2e/sessions -c "pi-messages round two"
ROUND-2: 2
```

capture 佐证：

```text
req-000011-pi-messages.json keyId='pimock' roles=['system', 'user']
req-000012-pi-messages.json keyId='pimock' roles=['system', 'user', 'assistant', 'user']
```

## 6. OpenCode × completions（④，复刻 ROUND-1/2）

写 `/tmp/mock-pi-e2e/oc-proj/opencode.json`（`@ai-sdk/openai-compatible`，`apiKey` 放 options 里）：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "mockpi": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Mock Pi",
      "options": {
        "baseURL": "http://127.0.0.1:18000/roundtext/v1",
        "apiKey": "mockpi-key"
      },
      "models": { "mock-m": { "name": "Mock Model" } }
    }
  }
}
```

**先 `cd` 再运行**：OpenCode 按**当前目录**读取 `opencode.json` 配置，必须先进项目目录再跑。忘记 `cd` 时配置读不到，典型报错是通用错误 `Error: {"name":"UnknownError","data":{"message":"Unexpected server error. Check server logs for details.","ref":"err_…"}}`（exit=1）——报错不会提示“配置未加载”，别误判为 server 故障。

```sh
$ cd /tmp/mock-pi-e2e/oc-proj
$ opencode run -m mockpi/mock-m "opencode round one: what round is it?"
> build · mock-m
ROUND-1: 1

$ opencode run -m mockpi/mock-m -c "opencode round two: what round is it now?"
> build · mock-m
ROUND-2: 2
```

capture 佐证（keyId=`mockpi-key` 即 options.apiKey）：

```text
req-000013 roles=['system','user','user']        # OpenCode 先发的"标题生成"小请求（见 F2）
req-000014 roles=['system','user']               # 第 1 轮正式对话
req-000015 roles=['system','user','assistant','user']  # -c 续跑，assistant 轮（ROUND-1: 1）在 transcript 里
```

第二轮 assistant 计数=1 → `ROUND-2: 2`，与 pi 行为一致。

## 7. 挂载生命周期（⑤：add→打→remove→404→重启→恢复→再打通）

前置提醒：本节会 `remove` mount、杀 server 再重启，**只应在自己本次新建的目录/mount 上执行**；对实验开始前就已存在的 mount（§1.1 检出的旧状态）执行 `remove` 会删掉不属于本次实验的配置。现场不干净时先回 §1.1 处置。

```sh
$ ./target/debug/mock-llm-server add "node .../round-counter.mjs" --name lifecycle
{"name":"lifecycle","command":"node .../round-counter.mjs","port":null,"url":"http://127.0.0.1:18000/lifecycle","port_url":null}

$ cat /tmp/mock-pi-e2e/mounts.json | python3 -m json.tool | head -8   # add 即时落盘
{
    "failtest": "node .../failing.mjs",
    "lifecycle": "node .../round-counter.mjs",
    "roundtext": "node .../round-counter.mjs",
    "roundtool": "node .../round-counter.mjs --mode=tool"
}

$ curl -sS -X POST http://127.0.0.1:18000/lifecycle/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -d '{"model":"mock-m","messages":[{"role":"user","content":"lifecycle round one"}],"stream":false}'
data: {"choices":[{"delta":{"content":"ROUND-1: 1"},"index":0}]}
data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}]}
data: {"choices":[],"usage":{"completion_tokens":1,"prompt_tokens":1,"prompt_tokens_details":{"cached_tokens":0}}}
data: [DONE]

$ ./target/debug/mock-llm-server remove lifecycle
{"removed":"lifecycle"}

$ curl -sS -X POST http://127.0.0.1:18000/lifecycle/v1/chat/completions ...   # 同上请求
{"error":{"code":"mount_not_found","message":"unknown mount"}}                # HTTP 404
```

重新挂载 → 杀 server → 用同一 `--mounts-file` 重启 → 恢复：

```sh
$ ./target/debug/mock-llm-server add "node .../round-counter.mjs" --name lifecycle   # 重新挂载（写盘）
$ kill 94816 && sleep 1
$ lsof -nP -iTCP:18000 -sTCP:LISTEN | wc -l
0

$ ./target/debug/mock-llm-server --port 18000 --capture-dir /tmp/mock-pi-e2e/cap --mounts-file /tmp/mock-pi-e2e/mounts.json &
mock-llm-server listening on http://127.0.0.1:18000

$ ./target/debug/mock-llm-server list | python3 -c "import json,sys; print([s['name'] for s in json.load(sys.stdin)['scripts']])"
['failtest', 'lifecycle', 'roundtext', 'roundtool']        # mounts.json 全量恢复

$ curl -sS -X POST http://127.0.0.1:18000/lifecycle/v1/chat/completions ...   # 再打通
data: {"choices":[{"delta":{"content":"ROUND-1: 1"},"index":0}]}
```

## 8. 专属端口兜底（⑥）

个别 SDK 会剥路径前缀；`--port` 给挂载钉死一个专属端口，该端口上协议路径**不带 name 前缀**：

```sh
$ ./target/debug/mock-llm-server add "node .../round-counter.mjs" --name pinned --port 18200
{"name":"pinned","command":"node .../round-counter.mjs","port":18200,"url":"http://127.0.0.1:18000/pinned","port_url":"http://127.0.0.1:18200"}

$ lsof -nP -iTCP:18200 -sTCP:LISTEN | tail -1
mock-llm- 96046 <user>    8u  IPv4 0x0000000000000000   0t0  TCP 127.0.0.1:18200 (LISTEN)

$ curl -sS -X POST http://127.0.0.1:18200/v1/chat/completions \
    -H 'Content-Type: application/json' -H 'Authorization: Bearer any' \
    -d '{"model":"mock-m","messages":[{"role":"user","content":"dedicated port round one"}],"stream":false}'
data: {"choices":[{"delta":{"content":"ROUND-1: 1"},"index":0}]}
data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}]}
data: {"choices":[],"usage":{"completion_tokens":1,"prompt_tokens":1,"prompt_tokens_details":{"cached_tokens":0}}}
data: [DONE]

$ ./target/debug/mock-llm-server remove pinned
{"removed":"pinned"}
$ lsof -nP -iTCP:18200 -sTCP:LISTEN | wc -l     # 端口随 remove 立即释放
0
```

## 9. 收尾

```sh
$ kill <server-pid> && sleep 1
$ lsof -nP -iTCP:18000 -sTCP:LISTEN | wc -l
0
```

## 10. 附：自写 wire 级脚本（tool 往返，不经任何 harness）

`/tmp/mock-pi-e2e/tool-roundtrip.mjs` 直打 completions wire（完整脚本随文，可照抄）：

```js
#!/usr/bin/env node
const BASE = "http://127.0.0.1:18000/roundtool/v1/chat/completions";

async function post(body) {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer selftest" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const frames = text.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6));
  return { status: res.status, frames };
}

const r1 = await post({
  model: "mock-m",
  stream: true,
  tools: [{ type: "function", function: { name: "round_probe", description: "echo round",
    parameters: { type: "object", properties: { round: { type: "number" } }, required: ["round"] } } }],
  messages: [{ role: "user", content: "probe the round" }],
});
console.log("round1 status:", r1.status);
for (const f of r1.frames) console.log("round1 frame:", f);

const toolCall = r1.frames.filter((f) => f !== "[DONE]").map((f) => JSON.parse(f))
  .flatMap((c) => c.choices ?? []).flatMap((c) => c.delta?.tool_calls ?? [])[0];
console.log("tool_call received:", JSON.stringify(toolCall));

const r2 = await post({
  model: "mock-m",
  stream: true,
  messages: [
    { role: "user", content: "probe the round" },
    { role: "assistant", content: null, tool_calls: [
      { id: toolCall.id, type: "function", function: { name: toolCall.function.name, arguments: toolCall.function.arguments } } ] },
    { role: "tool", tool_call_id: toolCall.id, content: "probe-ok:1" },
  ],
});
console.log("round2 status:", r2.status);
for (const f of r2.frames) console.log("round2 frame:", f);
```

真实输出：

```text
$ node /tmp/mock-pi-e2e/tool-roundtrip.mjs
round1 status: 200
round1 frame: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\"round\":1}","name":"round_probe"},"id":"call_round_1","index":0,"type":"function"}]},"index":0}]}
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

## 11. Findings（真实发现，不造假）

- **F1｜pi 对 429 自动重试**：failtest 一次 `pi --print` 产生了 4 条 capture（`req-000005..000008`，keyId 均为 `failtest`，roles 均为 `[system,user]`）——pi 客户端对 429 自动重试约 4 次后才把错误透给用户。写错误路径测试时预期会看到多次请求，不是 bug。
- **F2｜OpenCode 的"标题生成"额外请求**：`opencode run` 每个新会话先发一个 system 提示为 "You are a title generator" 的小请求（`req-000013`，roles `[system,user,user]`），它也会打到 mock 上。断言 capture 时要把它与正式对话区分开。
- **F3｜capture 计数器重启归零、覆盖旧文件**：`--capture-dir` 的 `req-NNNNNN-<api>.json` 编号在 server 重启后从 1 重新计数，同名文件被**静默覆盖**（本次 ⑤ 重启把 §3.1/§3.2 的 7 个早期 capture 覆盖掉 7 个）。需要留档时每个 server 生命周期用独立 capture 目录，或先拷走。
- **F4｜keyId 透传**：认证头里的 key（pi 的 `apiKey`、OpenCode 的 `options.apiKey`、curl 的 `Bearer any`）原样进脚本的 `input.keyId`；无认证头则为空串（lifecycle/错误路径的 curl 即如此），不影响挂载路由（挂载按 name 路由，keyId 仅供脚本读取）。
- **F5｜历史 F1/F2 均已修复**：`/{name}/…` 前缀路由本次全通（方案 A baseUrl 直达）；错误透传正确回 `429/mock_failure`（不再恒 500）。

## 12. capture 全量清单（走查结束时，含 F3 覆盖后的现状）

```text
req-000001-openai-completions.json keyId=''          roles=['user']                      # ⑤重启后 lifecycle 再打通
req-000002-openai-completions.json keyId='any'       roles=['user']                      # ⑥专属端口
req-000003-openai-completions.json keyId='selftest'  roles=['system','user']             # §10 第1轮
req-000004-openai-completions.json keyId='roundtext' roles=['system','user','assistant','user','assistant','user']  # ①a 第3轮
req-000005-openai-completions.json keyId='selftest'  roles=['system','user']             # §10 修复版第1轮
req-000006-openai-completions.json keyId='selftest'  roles=['user','assistant','toolResult']  # §10 第2轮
req-000007-openai-completions.json keyId=''          roles=['user']                      # ①c wire 级 429
req-000008-openai-completions.json keyId='failtest'  roles=['system','user']             # ①c pi 429 重试尾
req-000009-openai-responses.json     keyId='respmock' roles=['system','user']            # ② 第1轮
req-000010-openai-responses.json     keyId='respmock' roles=['system','user','assistant','user']  # ② 第2轮
req-000011-pi-messages.json          keyId='pimock'  roles=['system','user']            # ③ 第1轮
req-000012-pi-messages.json          keyId='pimock'  roles=['system','user','assistant','user']  # ③ 第2轮
req-000013-openai-completions.json keyId='mockpi-key' roles=['system','user','user']    # ④ 标题生成
req-000014-openai-completions.json keyId='mockpi-key' roles=['system','user']           # ④ 第1轮
req-000015-openai-completions.json keyId='mockpi-key' roles=['system','user','assistant','user']  # ④ 第2轮
req-000016-openai-completions.json keyId=''          roles=['user']                     # ⑤重启前 lifecycle 首打
```
