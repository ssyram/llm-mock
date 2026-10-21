# Mock 脚本与挂载实测记录（D3 挂载制）

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

日期：2000-01-01。配套 `scripts/mock-scripts/`：`round-counter.mjs`、`failing.mjs`、`verify-mount.sh`。
历史结论（本节结果不作为收官验收，最新处置见 §7）：**脚本协议闭环全绿（15 PASS / 0 FAIL），真实 pi E2E 两轮输出 `ROUND-1: 1` / `ROUND-2: 2` 成立；`/{name}/…` 前缀路由未合并（PENDING），并发现 1 个 Rust 侧 error 透传 bug（见 F2），均如实记录、未绕过。**

## 1. 脚本契约（server ↔ 脚本）

- Entry（admin API JSON）：`{"keyId","matcher":{"type":"any"|"textIncludes","value"},"reply":{"type":"script","command":"node …/xxx.mjs"}}`
- 脚本 stdin（server 注入，camelCase）：`{"api","keyId","model","sessionSignal","request"}`；`request` 为解码后的 `UnifiedRequest`（`request.context.messages` 即 transcript，`role` tag：`system|user|assistant|toolResult`）。
- 脚本 stdout 二选一：
  - AssistantMessage（serde 同 `src/model/message.rs`，camelCase）：`content`（`{"type":"text","text"}` / `{"type":"toolCall","id","name","arguments"}`）、`api`、`provider`、`model`、`usage`（全字段：`input/output/cacheRead/cacheWrite/totalTokens/cost{input,output,cacheRead,cacheWrite,total}`）、`stopReason`（`stop|toolUse|…`）、`timestamp`。
  - `{"error":{"status","code","message"}}` → 协议可见错误（F2 历史 bug 已修，见 §7 的严格验收）。

### 进程退出与错误通道（现行）

在输入传递和输出获取完成后：有效的结构化MockError按原status/code/message传播，退出码非零也不把模拟429改成500。其他输出必须同时满足exit 0及合法AssistantMessage；非零退出即返回 `MockError{status:500,code:"script_failed",message:"script exited unsuccessfully: <退出状态>"}`，成功JSON、空输出或无效JSON都不能掩盖它。exit 0的空/非法输出继续使用原有script_no_output/script_output_invalid/script_error_invalid错误。

HTTP先执行脚本再发送响应流，因此上述失败走HTTP状态及各协议原生错误JSON，不先发200再伪造通用SSE事件；pi-ai把它解释为error事件/stopReason=error。已建立Codex WebSocket使用该协议原生error帧。此规则不新增脚本自身逐token输出或已开HTTP流后的失败机制。

wire按协议携带code/message；客户端可能标准化显示，例如固定Codex adapter把HTTP429映射为ChatGPT额度提示。不能据此改原始错误状态或修改只读客户端来强求所有parser暴露同一个code槽。

直接回归：`src/registry/script_exit_tests.rs` 检查优先级与exit 0旧行为，`tests/script-exit-contract.test.mjs` 检查实际协议parser的error而非done、HTTP500/模拟429原始错误体、正常exit 0及已连接WS原生错误。

## 2. 交付物

- `round-counter.mjs`：无状态多轮范式。`round = transcript 中 role=assistant 条数 + 1`；mode=text 每轮回 `ROUND-r: r`，mode=tool 第 1 轮回 `toolCall`（`stopReason=toolUse`）、第 ≥2 轮文本收尾。参数 `--mode=text|tool`。回显 `api/model` 取自 stdin，usage 按消息数填。
- `failing.mjs`：恒定输出 `{"error":{"status","code","message"}}`；`--status= --code= --message=` 可配，默认 429/`mock_failure`。
- `verify-mount.sh`：build（锁竞争 3 次重试×30s）→ 起 server → add 两脚本 → list → 探测 `/{name}/…` 前缀（404 则降级固定协议路径并标 PENDING）→ openai-completions 两轮 + anthropic 一轮 SSE 断言 → failing 错误路径断言 → 捕获文件断言 → remove 后 404。环境变量 `MOCK_PORT`（默认 18123）。

## 3. verify-mount.sh 实测（2000-01-01，commit 无 git 仓库）

命令：`MOCK_PORT=18123 bash scripts/mock-scripts/verify-mount.sh`

```
PASS: add roundtext -> 201 / add failtest -> 201 / list -> 2 entries
mount routing: PENDING (route 404 on /{name}/…, probe code=404; fixed-path fallback below)
PASS: occ round1 -> 200 / SSE content-type / data: frames + ROUND-1: 1
PASS: occ round2 -> 200 + ROUND-2: 2
PASS: anthropic round1 -> 200 + SSE + ROUND-1: 1
PASS: failing script -> protocol-visible error (KNOWN BUG PENDING RUST FIX: 500 script_error_invalid, intended 429 mock_failure)
PASS: capture openai-completions(keyId=roundtext) + anthropic-messages 落盘
PASS: remove×2 -> removed:1 / after remove -> 404 no_mock_match / list empty
summary: PASS=15 FAIL=0
```

SSE 实样（openai-completions，curl 直打）：

```
data: {"choices":[{"delta":{"content":"ROUND-1: 1"},"index":0}]}
data: {"choices":[{"delta":{},"finish_reason":"stop","index":0}]}
data: {"choices":[],"usage":{"completion_tokens":1,"prompt_tokens":1,…}}
data: [DONE]
```

anthropic 形态（`/v1/messages` + `x-api-key`）返回 `event: message_start` → `content_block_delta`（`"text":"ROUND-1: 1"`）… 帧序列，pi-ai 解析器形状一致。

## 4. 真实 pi E2E 实测（pi 1.0.3，mock 不产生费用）

环境：server `target/debug/mock-llm-server --port 18000 --capture-dir /tmp/e2e-name/cap`；entry `keyId=roundtext` → `node …/round-counter.mjs`；隔离 agentDir `/tmp/e2e-name/agent/models.json`（见 F3：pi 1.0.3 只读 agentDir 的 models.json，不读项目 `.pi/models.json`）。

方案 A（任务指定的 name 前缀，待路由）：

```json
{"providers":{"roundtext":{"baseUrl":"http://127.0.0.1:18000/roundtext/v1","api":"openai-completions","apiKey":"roundtext","models":[{"id":"mock-m","contextWindow":100000,"maxTokens":1024}]}}}
```

命令：`cd /tmp/e2e-name/pi-proj && PI_CODING_AGENT_DIR=/tmp/e2e-name/agent pi --print --offline --approve --no-tools --model roundtext/mock-m --session-dir /tmp/e2e-name/sessions "…"`
输出：`404 status code (no body)` —— 路由级 404，与 F1 一致，属预期中的待合并项。

方案 B（mount 合并前的等效验证：固定路径 + keyId 绑定）：

```json
{"providers":{"roundtext":{"baseUrl":"http://127.0.0.1:18000/v1","api":"openai-completions","apiKey":"roundtext","models":[{"id":"mock-m","contextWindow":100000,"maxTokens":1024}]}}}
```

```
$ pi --print … --model roundtext/mock-m "first question: what round is it?"
ROUND-1: 1
$ pi --print … -c "second question: what round is it now?"   # 同会话续跑
ROUND-2: 2
```

捕获文件佐证（pi 回传完整 transcript，无状态范式成立）：

```
req-000001-openai-completions.json keyId=roundtext roles=[system, user]                    → ROUND-1
req-000002-openai-completions.json keyId=roundtext roles=[system, user, assistant, user]   → ROUND-2
```

第二轮请求里第 3 条即第一轮 mock 自己的 assistant 回复——round 计数完全由客户端回传的 transcript 推导，server/脚本零状态。

## 5. Findings（不造假清单）

- **F1（PENDING，非失败）**：`/{name}/…` 挂载前缀路由未合并。`build_router`（`src/server.rs`）现仅注册固定协议路径 + `/__admin/entries`；方案 A 与 verify-mount 的 mount 探测均得路由级 404。脚本与验证已就绪，路由合并后无需改动即可切到前缀形态（verify-mount 自动探测）。保留字校验（v1/v1beta/… 禁作 name）也随路由落地。
- **F2（Rust bug，建议尽快修）**：`src/registry/mod.rs` `execute()` Script 分支 `return serde_json::from_value(err.clone())` 在函数返回类型 `Result<AssistantMessage, MockError>` 下把 `error` 对象按 **AssistantMessage** 反序列化，必失败（`missing field content`）→ 脚本的 `status/code/message` 被丢弃，恒变 500 `script_error_invalid`。修法：`serde_json::from_value::<MockError>(err.clone())`。`failing.mjs` 即最小复现：期望 429/`mock_failure`，实测 500/`script_error_invalid`。verify-mount 断言"预期契约或已知 bug 签名"，修复落地后自动收敛到前者。registry 单测未覆盖 Script+error 组合，故 cargo test 仍绿。
- **F3（pi 1.0.3 行为差异）**：任务假设的项目级 `.pi/models.json` 不被 pi 读取——provider 注册只读 agentDir（`~/.pi/agent/models.json`，可用 `PI_CODING_AGENT_DIR` 重定向，见 dist `config.js: getAgentDir`）。E2E 用隔离 agentDir 完成，未动用户 `~/.pi`。另注意自定义 provider 需包在 `{"providers":{…}}` 下。
- **F4（正向证据）**：pi `--print -c` 同会话续跑回传完整 transcript（含 mock 上一轮 assistant 回复），D3 "无状态 round 范式"在真实客户端下成立。

## 6. 待办

1. Rust：合并 `/{name}/…` 挂载路由（F1）+ 一行修复 F2（补 Script+error 单测）。
2. 路由合并后重跑：`MOCK_PORT=18123 bash scripts/mock-scripts/verify-mount.sh`（应显示 `mount routing: ok` 且 failing 断言落到 429 契约）+ 方案 A E2E 复测。

## 7. 收官严格回归与逐项处置

旧 `verify-mount.sh` 同时把 429 契约和已知 500 bug 记作 PASS，且用 legacy registry entry 探测现在的脚本 mount；故其 15 PASS 不代表挂载+error契约已全绿，不以旧脚本输出作为验收，也未越界改 `scripts/**`。

- F1 **已修**：使用真实 `POST /__admin/scripts` 创建命名 shell mount，三个 `/{name}/v1/{chat/completions,responses,messages}` 请求走命名路由，删除后404；证据持久化 `tests/mock-script-contract.test.mjs`。不能用 legacy `/__admin/entries` 误作挂载注册。
- F2 **已修**：`src/registry/mod.rs:179–182` 显式按 MockError 反序列化。新增回归真实执行 existing `failing.mjs`，对三 HTTP 入口分别严格断言 **429 / mock_failure / retry-later**，不接受 500/script_error_invalid，不接受仅非200。2026收官本轮运行该 Node test PASS；Rust已含两项脚本错误回归，cargo test105/0。
- F3 **声明客户端配置边界**：pi 1.0.3 只读 agentDir/models.json 的历史发现继续有效；本轮没有重新执行 pi CLI，也没有声称项目 `.pi/models.json` 可用。
- F4 **历史正向证据保留**：两轮 `--print -c` 回传 transcript 的 ROUND-1/ROUND-2 成立；本轮只重新验收路由与错误透传，不把历史多轮运行冒充本轮实测。

完整回归命令 `node --test --test-concurrency=1 tests/canonical-ten.test.mjs tests/canonical-occ-reply.test.mjs tests/canonical-reply-projections.test.mjs tests/mock-script-contract.test.mjs` 为14/0。收官协议总账另见 `final-ledger.md`，仍存在 Codex transport 与 Mistral request decoder 失败，不能称项目全绿。

最终联动复验：上述严格HTTP回归仍PASS，整组Node suite **15/0**，cargo test **109/0**。旧待办中的F1/F2已关闭；旧方案A的pi CLI两轮尚未重新执行，不把命名路由HTTP验收冒充完整pi E2E复验。
