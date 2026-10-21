# Mock LLM Server 多角度黑盒实测（E2E）

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

> 下文为初测历史（含当时的「记录不修」标记）；F1/F2/F4 的最终裁定、修复与复跑证据见末尾「处置记录」。F3/O1 不属于本次处置范围。

- 日期：2000-01-01（实测会话）
- 方法：全部为真实 server 进程（`target/debug/mock-llm-server`）+ `curl` + 临时 Node 脚本的黑盒实测；未改 `src/**`、未写 `tests/**`；无任何真实 LLM 调用。
- 环境：macOS，`cargo build` 后二进制为 `./target/debug/mock-llm-server`。
- 隔离工作区：`/tmp/mock-e2e-angles/`（`mounts.json`、`cap/` capture 目录、`scripts/` 辅助脚本）。

启动命令：

```sh
mkdir -p /tmp/mock-e2e-angles/cap /tmp/mock-e2e-angles/scripts && cd /tmp/mock-e2e-angles && echo '{}' > mounts.json
nohup <repo>/target/debug/mock-llm-server \
  --port 19500 --port-base 19600 \
  --mounts-file /tmp/mock-e2e-angles/mounts.json \
  --capture-dir /tmp/mock-e2e-angles/cap > /tmp/mock-e2e-angles/server.log 2>&1 &
```

挂载清单（`mock-llm-server add ... --server-url http://127.0.0.1:19500`）：

| name | 命令 | 用途 |
|---|---|---|
| `roundtext` | `node .../scripts/mock-scripts/round-counter.mjs` | 协议/SSE/长转录 |
| `edge-exit1` / `edge-badjson` / `edge-empty` / `edge-stderr` / `edge-huge` / `edge-echo` | `node /tmp/mock-e2e-angles/scripts/edge.mjs <kind>` | 脚本边角 |
| `keyrep` | `node /tmp/mock-e2e-angles/scripts/keyid.mjs` | 回显 `keyId/api/sessionSignal` |

测试的 4 条协议路径（均挂在同一 server 上）：

- openai-completions：`POST /{name}/v1/chat/completions`
- openai-responses：`POST /{name}/v1/responses`
- anthropic-messages：`POST /{name}/v1/messages`
- google-generative-ai：`POST /{name}/v1beta/models/{model}:generateContent` / `:streamGenerateContent?alt=sse`

---

## 角度 1：协议边界（4 协议 × 畸形体 / 缺认证 / 未挂载 / 409 歧义 / header 大小写 / 查询串）

### 1.1 畸形 JSON body

| 协议 | 命令要点 | 状态码 | 错误体 |
|---|---|---|---|
| openai-completions | `-d '{"model":"m","messages":[{"role":"user","content":"hi"'`（截断） | **400** | `{"error":{"code":"invalid_request","message":"EOF while parsing an object at line 1 column 54","type":"invalid_request_error"}}` |
| openai-responses | `-d '{"model":"m","input":[broken'` | **400** | `{"error":{"code":"invalid_request","message":"invalid JSON body: expected value at line 1 column 23","type":"invalid_request_error"}}` |
| anthropic-messages | `-d '{"model":"m","messages":[bad'` | **400** | `{"error":{"message":"expected value at line 1 column 26","type":"invalid_request"},"type":"error"}` |
| google-generative-ai | `-d '{"contents":[bad'` | **400** | `{"error":{"code":400,"message":"expected value at line 1 column 14","status":"invalid_request"}}` |

```sh
curl -sS -X POST http://127.0.0.1:19500/roundtext/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"m","messages":[{"role":"user","content":"hi"' -w '\nHTTP %{http_code}\n'
# {"error":{"code":"invalid_request","message":"EOF while parsing an object at line 1 column 54","type":"invalid_request_error"}}
# HTTP 400
```

结论 ✅：4 协议畸形 JSON 均回协议各自形状的 400，错误 message 携带 serde 解析位置，无 500/panic。各协议错误体形状与真实 API 一致（openai 三段式、anthropic `type:"error"` 外壳、google `code/status` 数字风格）。

### 1.2 缺认证头

```sh
curl -sS -X POST http://127.0.0.1:19500/roundtext/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"m","messages":[{"role":"user","content":"hi"}]}' -w '\nHTTP %{http_code}\n'
# data: {"choices":[{"delta":{"content":"ROUND-1: 1"},"index":0}]}
# ...
# HTTP 200   ← 4 协议全部 200，脚本收到 keyId=""
```

**finding F1（记录不修）**：mount 路由下 4 协议缺认证头**均不回 401**，而是 200 正常出流；脚本 envelope 的 `keyId` 为空串。401 `missing_key` 只存在于传统 registry 路由（无 name 前缀）：

```sh
curl -sS -X POST http://127.0.0.1:19500/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"m","messages":[{"role":"user","content":"hi"}]}' -w '\nHTTP %{http_code}\n'
# {"error":{"code":"missing_key","message":"no API key header for this protocol","type":"invalid_request_error"}}
# HTTP 401
```

这与 mount-routing.md 契约一致（"KeyID is optional on mounts, not a selector"），但对从真实 API 迁移过来的客户端是行为差异：真实 OpenAI/Anthropic 缺 key 回 401，mock 永远放行。测试依赖 401 做鉴权路径的用例在 mount 上无法复现。

### 1.3 未挂载 name

```sh
curl -sS -X POST http://127.0.0.1:19500/nosuch/v1/chat/completions ... -w '\nHTTP %{http_code}\n'
curl -sS -X POST http://127.0.0.1:19500/nosuch/v1/responses ...      -w '\nHTTP %{http_code}\n'
curl -sS -X POST http://127.0.0.1:19500/nosuch/v1/messages ...       -w '\nHTTP %{http_code}\n'
curl -sS -X POST http://127.0.0.1:19500/nosuch/v1beta/models/m:generateContent ... -w '\nHTTP %{http_code}\n'
# 全部: {"error":{"code":"mount_not_found","message":"unknown mount"}} + HTTP 404
```

结论 ✅：4 协议一致 404，统一错误体 `mount_not_found`，且不回退查询 legacy registry（契约：mount 不存在即 404）。

### 1.4 同 keyId 双 matcher 歧义（legacy registry）

```sh
RC="node .../round-counter.mjs"
curl -sS -X POST http://127.0.0.1:19500/__admin/entries -H 'Content-Type: application/json' \
  -d "{\"keyId\":\"dup\",\"matcher\":{\"type\":\"textIncludes\",\"value\":\"deploy\"},\"reply\":{\"type\":\"script\",\"command\":\"$RC\"}}" -w '\nHTTP %{http_code}\n'
# {"keyId":"dup",...} HTTP 201
curl -sS -X POST http://127.0.0.1:19500/__admin/entries ... -d "{\"keyId\":\"dup\",\"matcher\":{\"type\":\"any\"},\"reply\":{\"type\":\"script\",\"command\":\"$RC\"}}"
# HTTP 201   ← 注册期允许重叠（设计如此）
curl -sS -X POST http://127.0.0.1:19500/v1/chat/completions -H 'Authorization: Bearer dup' \
  -H 'Content-Type: application/json' -d '{"model":"m","messages":[{"role":"user","content":"deploy now"}]}' -w '\nHTTP %{http_code}\n'
# {"error":{"code":"ambiguous_match","message":"multiple scripts match for keyId dup","type":"invalid_request_error"}}
# HTTP 409
```

结论 ✅：注册期不拒绝重叠，请求期「恰一命中」破坏时确定性回 `409 ambiguous_match`，错误体点名 keyId。与 admin.md 契约逐字一致。

（边角：`reply.type` 传 `"text"` 会回 400 `unknown variant ... expected one of file, script, error`——协议面错误形状完好。）

### 1.5 header 大小写变体（脚本回显 keyId 验证）

用 `keyrep` mount（脚本回显 `KEYID=...|API=...`）：

| header 写法 | 协议 | keyId 结果 |
|---|---|---|
| `authorization: Bearer x1`（全小写名） | openai-completions | `"x1"` ✅ |
| `AUTHORIZATION: Bearer x2`（全大写名） | openai-completions | `"x2"` ✅ |
| `AuThOrIzAtIoN: Bearer x3`（混合） | openai-completions | `"x3"` ✅ |
| `X-API-KEY: ak` / `x-api-key: ak` | anthropic | `"ak"` ✅ 两种均可 |
| `X-GOOG-API-KEY: g` / `x-goog-api-key: g` | google | `"g"` ✅ 两种均可 |
| `API-KEY: az` | responses 泛路径 | `"az"` ✅ 且选中 `azure-openai-responses` |
| 无任何认证头 | 4 协议 | `""`（空串） |

**finding F2（记录不修）**：Bearer **scheme 大小写敏感**。header 名大小写无关（✅），但 scheme 必须首字母大写 `Bearer`：

```sh
curl ... -H 'Authorization: bearer x2'   # ← scheme 小写
# 脚本收到 KEYID=""   ← key 被静默丢弃，请求仍 200
curl ... -H 'authorization: Bearer x1'   # ← 名小写、scheme 正确
# 脚本收到 KEYID="x1"
```

RFC 7235 规定 auth-scheme 大小写不敏感；实测小写 `bearer` → keyId 静默变空串、请求照常 200。影响 openai-completions / openai-responses / azure 等 Authorization 系协议（anthropic `x-api-key` 与 google `x-goog-api-key` 是裸值，无此问题）。依赖 keyId 区分场景的脚本在客户端发小写 `bearer` 时会拿错空 key 且无任何告警。

### 1.6 查询串变体

| URL | 协议判定 | 结果 |
|---|---|---|
| `/keyrep/v1/chat/completions?beta=true` | openai-completions | 200，脚本 `API=openai-completions` ✅ |
| `/keyrep/v1/chat/completions?alt=sse` | openai-completions | 200 同上 ✅ |
| `/keyrep/v1beta/models/m:generateContent?beta=true&v=2` | google-generative-ai | 200 ✅ |
| `/keyrep/v1beta/models/m:streamGenerateContent?alt=sse` | google-generative-ai | 200，回 SSE 帧（见角度 2）✅ |
| `/keyrep/v1/responses?beta=true` | openai-responses | 200 ✅ |
| `/keyrep/v1/messages?beta=true` | anthropic-messages | 200 ✅ |

结论 ✅：查询串不干扰路由；任意查询参数原样保留、不影响协议判定与脚本执行。另观测：无 `x-session-id` 时 envelope 的 `sessionSignal` 为 `null`。

---

## 角度 2：SSE 裸帧检验（curl --no-buffer 原始字节）

方法：`curl -sS --no-buffer` 落盘后 `cat -e`（`$`=LF）+ `od -c` 检查帧分隔与流尾字节。

### openai-completions

```sh
curl -sS --no-buffer -X POST http://127.0.0.1:19500/roundtext/v1/chat/completions \
  -H 'Authorization: Bearer k' -H 'Content-Type: application/json' \
  -d '{"model":"m","messages":[{"role":"user","content":"hi"}]}' | cat -e
```

原始字节流（逐帧）：

```text
data: {"choices":[{"delta":{"content":"ROUND-1: 1"},"index":0}]}$
$
data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}]}$
$
data: {"choices":[],"usage":{"completion_tokens":1,"prompt_tokens":1,"prompt_tokens_details":{"cached_tokens":0}}}$
$
data: [DONE]$
$
```

流尾 hexdump：`... d a t a :   [ D O N E ] \n \n`。

结论 ✅：帧分隔为 `\n\n`（纯 LF，无 CR，SSE 合规）；事件顺序 delta → finish_reason → usage → `[DONE]`；终止帧 `data: [DONE]\n\n` 且流干净收尾。与真实 OpenAI 流形状一致。

### anthropic-messages

```text
event: message_start$
data: {"message":{...,"usage":{...}},"type":"message_start"}$
$
event: content_block_start$
data: {"content_block":{"text":"","type":"text"},"index":0,"type":"content_block_start"}$
$
event: content_block_delta$
data: {"delta":{"text":"ROUND-1: 1","type":"text_delta"},"index":0,"type":"content_block_delta"}$
$
event: content_block_stop$
data: {"index":0,"type":"content_block_stop"}$
$
event: message_delta$
data: {"delta":{"stop_reason":"end_turn"},"type":"message_delta","usage":{...}}$
$
event: message_stop$
data: {"type":"message_stop"}$
$
```

结论 ✅：完整 Anthropic 事件生命周期 `message_start → content_block_start → content_block_delta → content_block_stop → message_delta(stop_reason) → message_stop`；每帧 `event:`+`data:` 成对，`\n\n` 分隔；终止帧 `message_stop`，流尾 `}\n\n`。

### openai-responses

```text
data: {"response":{"id":"resp_mock"},"type":"response.created"}$
$
data: {"item":{...,"status":"in_progress","type":"message"},"output_index":0,"type":"response.output_item.added"}$
$
data: {"delta":"ROUND-1: 1","output_index":0,"type":"response.output_text.delta"}$
$
data: {"item":{...,"status":"completed",...},"output_index":0,"type":"response.output_item.done"}$
$
data: {"response":{"id":"resp_mock","status":"completed","usage":{...}},"type":"response.completed"}$
$
```

结论 ✅：顺序 `response.created → output_item.added → output_text.delta → output_item.done → response.completed`；终止语义由 `type:"response.completed"` 承载（**无** `data: [DONE]` 终止帧——与真实 OpenAI Responses 一致，跨协议客户端不要假设所有协议都有 `[DONE]`）。

### google-generative-ai（streamGenerateContent?alt=sse）

```text
data: {"candidates":[{"content":{"role":"model","parts":[{"text":"ROUND-1: 1"}]}}]}$
$
data: {"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":1,"totalTokenCount":2}}$
$
```

结论 ✅：内容帧 → `finishReason:"STOP"` + usageMetadata 收尾帧；无 `event:` 行、无 `[DONE]`（Google SSE 形状如此），`\n\n` 分隔，流尾 `}}\n\n`。

**跨协议小结**：4 协议帧分隔统一 `\n\n` 纯 LF；终止约定三种形态（`[DONE]` 哨兵 / `message_stop` 事件 / `response.completed`、`finishReason` 类型字段）。解析器若只认 `[DONE]` 会在 anthropic/responses/google 上误判截断。

---

## 角度 3：脚本协议边角

测试脚本 `/tmp/mock-e2e-angles/scripts/edge.mjs <kind>`（非仓库文件，临时区），按 kind 分支行为；命令均为 openai-completions 路径。

### 3.1 非零退出（exit 3）

```sh
curl -sS -X POST http://127.0.0.1:19500/edge-exit1/v1/chat/completions \
  -H 'Authorization: Bearer k' -H 'Content-Type: application/json' \
  -d '{"model":"m","messages":[{"role":"user","content":"hi"}]}' -w '\nHTTP %{http_code}\n'
# {"error":{"code":"script_no_output","message":"node /tmp/mock-e2e-angles/scripts/edge.mjs exit1: edge: deliberate nonzero exit","type":"invalid_request_error"}}
# HTTP 500
```

结论 ✅：非零退出 → `500 script_no_output`，错误 message 携带脚本 stderr 末行（排障友好）；server 存活（admin 面下一请求 200）。

### 3.2 stdout 非法 JSON

```text
{"error":{"code":"script_output_invalid","message":"node .../edge.mjs badjson: expected ident at line 1 column 2","type":"invalid_request_error"}}
HTTP 500
```

结论 ✅：非法 JSON → `500 script_output_invalid`，带 serde 解析位置；与 3.1 的错误码区分开（no_output vs output_invalid）。

### 3.3 空 stdout

```text
{"error":{"code":"script_no_output","message":"node .../edge.mjs empty: ","type":"invalid_request_error"}}
HTTP 500
```

结论 ✅：空输出同 `script_no_output`（message 尾部空串）；无 panic、无挂起。

### 3.4 stderr 噪音 + 合法输出

脚本向 stderr 写两行 WARNING、stdout 返回正常 AssistantMessage：

```sh
curl ... -d '{"model":"m","messages":[{"role":"user","content":"hi"}]}' -w '\nHTTP %{http_code}\n'
# data: {"choices":[{"delta":{"content":"ok-with-stderr"},"index":0}]}
# ...
# HTTP 200
```

结论 ✅：stderr 噪音不影响成功路径；且 stderr 不会泄入 server.log（`server.log` 仅有 listening 一行）——stderr 只在失败时拼进错误 message。干净。

### 3.5 超大输出（1MB 文本）

脚本返回单个 text block 含 `"H".repeat(1024*1024)`：

```text
HTTP 200 bytes=1048829
real	0m0.075s
delta H count: 1048576   ← 单帧 delta 精确 1MiB
has [DONE]: True
```

结论 ✅：1MiB 文本作为单个 delta 帧一次性下发，总下载 1048829 字节（含帧开销），75ms 内完成；无截断、无分帧异常、终止帧完整。

### 3.6 中英混合 / emoji / 控制字符往返

用户消息含中文、emoji（🎉🚀）、`\t`、`\u0007`、`\n`、变音符，脚本原样回显最后一个 user 文本：

```python
sent : '中文English混合 🎉🚀 emoji\ttab\x07bell\nnewline ünïcödé'
back : '中文English混合 🎉🚀 emoji\ttab\x07bell\nnewline ünïcödé'
identical: True
```

结论 ✅：多字节 UTF-8 与控制字符在 decode→脚本→encode 全链字节级一致（含 emoji 4 字节序列与 \x07 控制字符，SSE 帧内 JSON 转义正确）。

---

## 角度 4：挂载生命周期

### 4.1 保留字 / 非法名 / 空 command 拒绝

```sh
for n in v1 __admin openai messages models; do
  curl -sS -X POST http://127.0.0.1:19500/__admin/scripts -H 'Content-Type: application/json' \
    -d "{\"name\":\"$n\",\"command\":\"node .../round-counter.mjs\"}" -o /dev/null -w "$n -> HTTP %{http_code}\n"
done
# v1 -> HTTP 400      __admin -> HTTP 400     openai -> HTTP 400
# messages -> HTTP 400        models -> HTTP 400
# 非法名 a/b -> HTTP 400；空 command -> HTTP 400
```

结论 ✅：保留字名单（含 `v1`/`__admin`/`openai`/`messages`/`models`）全部 400；非法字符名与空 command 均 400。

### 4.2 重复 add

```text
{"error":{"code":"mount_exists","message":"mount roundtext already exists"}} HTTP 409
```

结论 ✅：同名重复注册 → 409 `mount_exists`，注册不覆盖（Registrations are unique, not replacements）。

### 4.3 mounts.json 手工损坏后重启

用独立实例（端口 19501、独立 mounts 文件）：

```sh
# 正常启动后 kill，再把 mounts.json 改成截断的垃圾：
printf '{ "t1": "node /some/scri' > /tmp/mock-e2e-angles/inst2/mounts.json
$B --port 19501 --mounts-file /tmp/mock-e2e-angles/inst2/mounts.json
# 退出码 1，stderr：
# /tmp/mock-e2e-angles/inst2/mounts.json: EOF while parsing a string at line 1 column 24

echo '["t1"]' > mounts.json      # 合法 JSON 但形状错（数组）
# 退出码 1，stderr： invalid type: sequence, expected a map at line 1 column 0

: > mounts.json                  # 空文件
# 退出码 1，stderr： EOF while parsing a value at line 1 column 0

rm mounts.json; 用不存在的路径重启  → 启动成功，{"scripts":[]}
```

结论 ✅：损坏/空/形状错均 fail-fast（exit 1，stderr 带行列号，端口不绑定）；缺文件 = 空 mounts 正常启动。与契约「malformed/unreadable configuration fails startup」一致。

### 4.4 运行中 remove 再 add 同名

```text
{"removed":"edge-empty"}                  ← remove 成功
after remove: HTTP 404                      ← 立即不可达
{"name":"edge-empty",...,"port":19603}    ← 重新 add，同端口号
after re-add: HTTP 500                      ← 500 是 empty 脚本自身返回空 stdout 的预期行为，路由已恢复
```

结论 ✅：remove 后同名的增删即时生效；re-add 回到原端口号（port-base 顺序分配，空档被复用）。

### 4.5 专属端口模式增删

```text
POST /__admin/scripts {"name":"dedport","port":19777} → 201 {"port_url":"http://127.0.0.1:19777"}
POST :19777/v1/chat/completions             → 200 ROUND-1（无 name 前缀）
GET  :19777/__admin/scripts                 → 404（专属端口无 admin 面）
同固定端口再加 dedport2                    → 409 port_unavailable (os error 48)
remove dedport → 端口立即释放（curl 拒连 + python rebind 19777 OK）
```

结论 ✅：专属端口增/删/冲突全链符合契约；端口释放立即可重用。

---

## 角度 5：并发与中止

### 5.1 并发同一 mount（12 路跨 4 协议）

辅助脚本 `nonce.mjs`：回显请求内 nonce 并人为 sleep 400ms 放大竞态窗口。Python 12 线程并发打同一 mount `conc`（4 协议 × 3 nonce）：

```text
c0   rc=0 got=c0 OK
c1   rc=0 got=c1 OK
...（12 行全部 OK）
c11  rc=0 got=c11 OK
ALL NONCE MATCH: True
new capture files: 12 unique seq: 12
seq duplicated: False
```

结论 ✅：并发 decode→脚本执行→encode→capture 落盘无串号——每路响应回自己的 nonce；12 个 capture 文件 seq 唯一无覆盖（req-000069..000080 连续无重复）。

（过程观察：首轮 10 路并发时 responses 协议 3 路“无输出”为我的测试脚本 bug——见 finding F3 的 envelope content 形状问题；修脚本后 12/12 全绿。capture 侧首轮已 10/10 正确落盘。）

### 5.2 中止：curl 中断流后 server 状态

脚本 sleep 3000ms 期间（0 字节已发）`kill -9` curl：

```text
curl killed; partial output bytes: 0
admin: HTTP 200
next req: HTTP 200
req-000075-openai-completions.json keyId= abort1   ← 中止请求事后仍完整落盘
```

结论 ✅：客户端断连不伤 server；下一请求正常。

**观察 O1（记录不修）**：客户端断连后 server 不取消脚本——脚本继续跑完（3s sleep 走完）并事后写入完整 capture。慢脚本＋大量断连会继续占用资源；对“模拟真实客户端取消”的用例，脚本自身感知不到取消。

---

## 角度 6：长转录（50+ 轮打满上下文）

构造 50 轮完整 transcript（50 user + 50 assistant + 1 final = 101 条），round-counter 按 assistant 条数推轮次，预期 `ROUND-51: 51`：

```text
completions  50 rounds (101 msgs):           200 ROUND-51: 51
anthropic    50 rounds (assistant 为 block 数组): 200 ROUND-51: 51
google       50 rounds (user/model 交替):     200 ROUND-51: 51
responses    50 rounds (input_text/output_text): 200 ROUND-51: 51
completions  200 rounds (401 msgs, 36KB payload): 200 ROUND-201: 201
capture：长转录请求完整落盘 101 条消息
```

结论 ✅：50+ 轮四协议全通过，round 精确推导；200 轮/401 条/36KB 上下文无截断无降速；事后 server RSS 仅 8.8MB。

**finding F4（记录不修）**：anthropic 解码器要求 assistant 消息 `content` 必须是 block 数组，收到纯字符串直接 400：

```text
{"error":{"message":"assistant content must be a block array","type":"invalid_request"},"type":"error"}  HTTP 400
```

真实 Anthropic API 接受 assistant 字符串 content（镜像历史请求的客户端会发 string）。用 mock 重放 anthropic 抓包时需先把 assistant content 转成 `[{"type":"text","text":...}]`。

---

## Findings 汇总（只记不修）

| # | 类型 | 内容 |
|---|---|---|
| F1 | 行为差异 | mount 路由 4 协议缺认证头均 200（keyId 空串），不回 401；401 `missing_key` 仅存在于 legacy registry 路由。与真实 API 鉴权语义不同，依赖 401 的鉴权用例在 mount 上无法复现 |
| F2 | 偏差 RFC 7235 | Bearer scheme 大小写敏感：`Authorization: bearer x` → keyId 静默变空串且 200；header 名本身大小写不敏感无问题 |
| F3 | envelope 契约脚注 | 脚本收到的 `context.messages[].content` 形状随协议/请求而异：completions/anthropic/google 的 string content 保持 string；responses 的 block 数组变成无 `type` 字段的 `[{"text":...}]`。脚本若按 `block.type==="text"` 过滤会静默拿到空文本 |
| F4 | 解码器严格度 | anthropic 解码器拒绝 assistant 字符串 content（400），真实 API 接受 |
| O1 | 观察项 | 客户端断连不取消脚本：脚本跑完并事后写 capture；慢脚本断连风暴会继续占资源 |

## 契约符合性确认（与 mount-routing.md/admin.md 对照）

- ✅ 畸形 JSON → 各协议形状 400（4/4）
- ✅ 未挂载 name → 404 `mount_not_found`（4/4，不回退 legacy registry）
- ✅ legacy 同 keyId 双 matcher → 注册期放行 201，请求期 409 `ambiguous_match`
- ✅ 保留字/非法名/空 command → 400；重复 add → 409 `mount_exists`；固定端口冲突 → 409 `port_unavailable`
- ✅ 损坏/空/形状错 mounts.json → 启动 fail-fast exit 1（带行列号）；缺文件 → 空 mounts 启动
- ✅ 专属端口：无 name 前缀、无 admin 面、remove 后端口立即释放
- ✅ SSE 帧：4 协议 `\n\n` 分隔、终止帧完整、事件顺序符合各自协议惯例
- ✅ 脚本错误三态：非零退出/空输出 → `script_no_output` 500；非法 JSON → `script_output_invalid` 500；stderr 不泄入成功路径
- ✅ 并发 12 路无串号；断连后 server 健康
- ✅ 50+/200 轮长转录 round 推导精确，全量落盘

## 复现消单

```sh
# 1. 启动（本报告全部实测基于此进程）
mock-llm-server --port 19500 --port-base 19600 --mounts-file /tmp/mock-e2e-angles/mounts.json --capture-dir /tmp/mock-e2e-angles/cap
# 2. 挂载
mock-llm-server add "node .../round-counter.mjs" --name roundtext --server-url http://127.0.0.1:19500
# 3. 任一协议请求
curl -sS -X POST http://127.0.0.1:19500/roundtext/v1/chat/completions -H 'Authorization: Bearer k' -H 'Content-Type: application/json' -d '{"model":"m","messages":[{"role":"user","content":"hi"}]}'
```

辅助脚本（临时区 `/tmp/mock-e2e-angles/scripts/`，未入仓库）：`edge.mjs`（脚本边角 6 态）、`keyid.mjs`（keyId/api 回显）、`nonce.mjs`（并发 nonce 回显＋延迟）、`concurrency-check.py`（12 路并发断言）。

实测结束时主 server 存活（PID 87407，RSS 8.8MB），capture 81 个文件 seq 0-80 连续无覆盖；mounts.json 含 9 个 mount，与 admin 面一致。

## 处置记录

### 裁定与权威依据（2000-01-01 UTC）

本表的 `architecture.md` D3、Q.I.3、A4 引用对应历史 `4841f5a` 架构，不是当前文档编号。现行 Q 见 [principles.md](principles.md)，根设计承接见 [architecture.md](architecture.md)；保留原裁定依据，不将当时的覆盖结论外推到当前。

| finding | 最终裁定 | 依据与处置 |
|---|---|---|
| F1 | 按 D3 维持，不统一为 401 | `architecture.md` D3：name/端口直接绑定脚本，KeyID/matcher 降为脚本可选输入。`src/server.rs:106` 仅在无 mount 且 KeyID 为空时返回 `401 missing_key`。已在 `mount-routing.md` Contract 与 `README.md` 行为契约明确：挂载路由（含专属端口）不要求认证，KeyID 仅作脚本可选输入、缺省为空串；缺凭据的 401 仅用于 legacy registry 路由。脚本自行返回的错误不受此约束。 |
| F2 | 修复 | [RFC 9110 §11.1](https://www.rfc-editor.org/rfc/rfc9110.html#section-11.1) 明确以 **case-insensitive token** 标识 authentication scheme。新增 `src/bearer.rs:1` 统一解析 scheme，所有直接提取点调用同一函数；token 原样保留，不把 key 转小写。 |
| F4 | 修复 | Anthropic 官方 SDK 的 [message_create_params.py](https://github.com/anthropics/anthropic-sdk-python/blob/main/src/anthropic/types/message_create_params.py)（本次读取的第 76–109 行）给出 assistant 字符串历史示例，并明确每条输入消息的字符串 content 等价于单个 `text` block；[message_param.py](https://github.com/anthropics/anthropic-sdk-python/blob/main/src/anthropic/types/message_param.py) 的 `MessageParam.content` 类型也包含 `str`。与架构 Q.I.3「任意 Harness」和 A4 兼容容忍目标一致；`src/api/anthropic_messages/messages.rs:125` 将 assistant 字符串归一化为单个 text block，再走现有映射。 |

权威源码/标准均通过 `curl -fLsS --max-time 30` 实际读取，不以旧测试或仅 pi-ai 的请求子集作为合法输入边界。本次没有调用真实 Anthropic 模型 API，也不需要任何真实凭据。

F2 提取点：`src/mounts/transport.rs:41`（包括 completions、Vertex 与其他 mounted/legacy KeyID 选择）、`src/api/openai_responses/request_headers.rs:10`（Responses 及复用它的 Codex/Azure）、`src/api/anthropic_messages/decode.rs:34`、`src/api/mistral_conversations/decode.rs:38`、`src/api/pi_messages/decode.rs:38`、`src/api/bedrock_converse_stream/decode.rs:61`。保留原有专用 key 头、Anthropic 原始 authorization 回退、Bedrock SigV4、空 token 和错误策略；此次只改变 Bearer scheme 比较大小写。为遵守源文件 200 行上限，Responses 的现有请求头/会话头提取移入专用 `request_headers.rs`，会话头优先级不变。

### 单测与检查

新增 5 个测试，扩充 1 个现有测试：

- `src/bearer.rs`：`bearer_token_ignores_scheme_case_but_preserves_token`，覆盖 `Bearer/bearer/BEARER/bEaReR`、key 大小写保真、非 Bearer/无分隔符/非 ASCII scheme 拒绝、原有空 token 行为。
- `src/bearer.rs`：`bearer_decoders_accept_all_scheme_cases`，实际调用 Responses/Codex/Azure/Mistral/Anthropic/pi/Bedrock 的请求信息解码器，逐一验证四种 scheme 均保留 `MiXeD-key`。
- `src/mounts/transport.rs`：`bearer_preserves_key_for_every_scheme_case`，验证共享 HeaderMap 提取。
- `src/mounts/routing_tests.rs`：扩充 `root_registry_compatible_and_unknown_mount_does_not_fall_back`，四种 scheme 均选中原 legacy KeyID；保留缺认证 401 和未知 mount 不回退的断言。
- `src/api/anthropic_messages/decode_tests.rs`：`assistant_string_content_equals_one_text_block`，英文、中文、emoji、换行字符串与单 text block 的完整 UnifiedRequest/RequestInfo 相同，内容不丢失。
- `src/api/anthropic_messages/decode_tests.rs`：`rejects_missing_or_non_content_assistant_values`，null、数字、错误 object 仍拒绝；未放宽为任意 JSON。

实际执行结果（rustc 1.95.0，macOS）：

| 命令/检查 | 结果 |
|---|---|
| `cargo test`（修复后及最终复跑） | exit 0；**123 passed, 0 failed**；main/doc-tests 各 0 项亦通过 |
| `cargo build` | exit 0；黑盒使用重新构建的 `target/debug/mock-llm-server` |
| `cargo clippy --all-targets`（最终复跑） | exit 0；修改文件无告警。仅原有 `src/model/message.rs:9` 的 `large_enum_variant`、`src/api/google_generative_ai/encode_tests.rs:154` 的 `useless_conversion`，未扩大范围修改 |
| `rustfmt --edition 2021 --config skip_children=true src/bearer.rs src/api/openai_responses/request_headers.rs src/mounts/transport.rs` | exit 0；其余文件保持现有局部风格，未全库重排 |
| Python 源码行数/提取点检查 | 所有改动源文件 ≤200 非空非注释行；Responses decode 为 195；`src/**` 不再存在 `strip_prefix("Bearer ")` |
| `git status --short` | exit 128：本工作区不是 Git 仓库，无 Git index；未执行任何 staging/commit 操作 |

### F2/F4 复现转绿与 F1 回归

执行 `python3 target/finding-disposition-e2e.py`：辅助脚本启动独立真实 server，通过真实 CLI 挂载，再用真实 curl 发请求，断言状态码、输出和 capture 内容，最后终止自己启动的 server。监听端口自动分配，未干扰旧实例。最终 **47 条 curl 全部通过**，原始 argv 保存在 `target/finding-e2e-yithfwv_/curl-commands.json`，server 日志、回显脚本、capture 同目录；辅助脚本和验证产物仅在 `target/`，不是新增产品源码。

```text
F2 PASS 4 scheme cases: /keyrep/v1/chat/completions
F2 PASS 4 scheme cases: /keyrep/v1/responses
F2 PASS 4 scheme cases: /keyrep/codex/responses
F2 PASS 4 scheme cases: /keyrep/openai/v1/responses
F2 PASS 4 scheme cases: /keyrep/v1/messages
F2 PASS 4 scheme cases: /keyrep/messages
F2 PASS 4 scheme cases: /keyrep/v1/projects/p/locations/l/publishers/google/models/m:streamGenerateContent?alt=sse
F2 PASS 4 scheme cases: /mistral/v1/chat/completions
F2 original repro PASS: Authorization: bearer x2 -> 200 KEYID=x2|API=
F2 original repro PASS: Authorization: Bearer x1 -> 200 KEYID=x1|API=
F2 PASS legacy registry matches exact KeyID for 4 scheme cases (418 scripted reply)
F1 PASS 4 mounted protocols: 200 with empty KeyID; legacy root: 401 missing_key
F4 PASS string / block assistant history: 200 ROUND-51: 51; 101-message normalized captures equal
F4 PASS null assistant content remains 400
ALL PASS: 47 actual curl requests
```

F2 的 8 路 × 4 scheme 验证都检查精确的 `KEYID=MiXeD-key|API=`，不是仅凭 200 判定成功；Azure 同时提供其必需的 `api-key`。Bedrock Bearer 分支由单测直接覆盖，未扩展其二进制传输黑盒范围。F4 使用 50 轮 user/assistant + 最后一条 user，共 101 条消息，字符串含中文、emoji 和换行；断言全部 50 条 assistant capture 均为单 text block，且与数组写法的完整 request 相等，SSE 含 `message_stop`。F1 重跑原 4 协议缺认证场景保持 200 + 空 key；legacy completions 仍 401。

以下为独立重建最小复现的命令（仓库根目录执行；19500 须空闲；仅使用本地虚构 key）：

```sh
set -e
cargo build
REPRO="$(mktemp -d "$PWD/target/finding-repro.XXXXXX")"
mkdir "$REPRO/cap"
cat > "$REPRO/keyid.mjs" <<'JS'
import {readFileSync} from 'node:fs';
const i=JSON.parse(readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify({api:i.api,provider:'mock',model:i.model,
content:[{type:'text',text:'KEYID='+i.keyId+'|API='+i.api}],stopReason:'stop',timestamp:0,
usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,
cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}}));
JS
./target/debug/mock-llm-server --port 19500 \
  --mounts-file "$REPRO/mounts.json" --capture-dir "$REPRO/cap" > "$REPRO/server.log" 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID"; wait "$SERVER_PID" 2>/dev/null || true' EXIT
for attempt in $(seq 1 100); do
  if curl -fs http://127.0.0.1:19500/__admin/scripts > /dev/null; then break; fi
  sleep 0.05
done
curl -fsS http://127.0.0.1:19500/__admin/scripts
./target/debug/mock-llm-server add "node $REPRO/keyid.mjs" --name keyrep --server-url http://127.0.0.1:19500
./target/debug/mock-llm-server add "node $PWD/scripts/mock-scripts/round-counter.mjs" --name roundtext --server-url http://127.0.0.1:19500
# F2：原小写 scheme 复现；预期 HTTP 200 且 KEYID=x2（不再为空串）。
curl -sS -X POST http://127.0.0.1:19500/keyrep/v1/chat/completions \
  -H 'Content-Type: application/json' -H 'Authorization: bearer x2' \
  -d '{"model":"m","messages":[{"role":"user","content":"hi"}]}' -w '\nHTTP %{http_code}\n'
# F4：合法 assistant 字符串；预期 HTTP 200、ROUND-2: 2 和 message_stop，而非 400。
curl -sS -X POST http://127.0.0.1:19500/roundtext/v1/messages \
  -H 'Content-Type: application/json' \
  -d '{"model":"m","max_tokens":64,"stream":true,"messages":[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"},{"role":"user","content":"continue"}]}' \
  -w '\nHTTP %{http_code}\n'
```

上述最小复现 shell 块也已从本文件直接提取并实际执行（含 `cargo build`、CLI add 和两条 curl），断言均通过：F2 为 `HTTP 200` + `KEYID=x2|API=openai-completions`；F4 为 `HTTP 200` + `ROUND-2: 2` + `event: message_stop`。最终独立实例产物在 `target/finding-repro.IIMwKV/`，执行后 server 已由 trap 终止；启动探测已包含有界重试。

### 范围、残余项与验收边界

- F1 仅补充文档，不改变 D3 路由认证/选择行为；F2 只统一 scheme 大小写语义；F4 只增加合法 assistant 字符串简写，不改变已有 block、thinking、tool_use/tool_result 映射。
- 未修改 Cargo 依赖、模型结构、对偶 fixture 或 F3/O1；未修复无关的既有 clippy 告警。
- 本次证据是本地 mock 的单测与真实 HTTP 黑盒，不宣称已做真实厂商网络调用或全量 TypeScript/SDK 对偶矩阵重跑。
- 没有 Git index，未暂存任何文件。独立 reviewer gate 仍须由复核者完成；上述结果不冒充独立审查结论。
