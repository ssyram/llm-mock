# Bedrock 二进制 transport / Vertex 本地 transport

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 结论与范围

- Bedrock transport blocker 已解除：`POST /model/{id}/converse-stream` 返回真正的 AWS EventStream 二进制 body，`Content-Type: application/vnd.amazon.eventstream`。锁定 pi-ai 的真实 AWS SDK 已完成 Bearer 与 SigV4 本地往返。
- Vertex 可本地直连：显式非占位 API key + 本地 `/v1` baseUrl 走 Vertex Express，无需 ADC/project/location。不得标为“SDK 强制认证”。
- 只读复跑现有 Bedrock 矩阵：请求 **16 pass / 0 fail**，回复 **4 pass / 10 fail**。余下是具体的不可逆字段/错误投影差异，见下文；**不是全绿**。
- 本线程没有修改 `tests/**`、canonical 或 `tests/matrix-ten-results.json`；矩阵结果文件仍是旧快照，不代表本次结果。既有 `matrix-ten.md` 所述 60 案 transport blocker 是 Codex 30 + Bedrock 30，不含 Vertex。

主要修改限于 `src/api/bedrock_converse_stream/**`、`src/server.rs` 的 Bedrock 专用路由和本记录。没有改通用 `Api`、其他协议路由、依赖、挂载配置或注册表实现。

### 范围例外（协调者显式授权）

全量单测首次发现并行新增 `src/api/usage_cache_tests.rs` 的 Bedrock usage 严格断言遗漏 `cacheDetails`。锁定 `api/bedrock-converse-stream.ts:715–718` 明确从 `ttl === CacheTTL.ONE_HOUR` 的 details 求和恢复 `cacheWrite1h`。协调者授权对此测试做最小修正，保留 SDK 正确字段而非删除 encoder 字段迁就测试。收到授权后，重新读取发现字段期望已被并行补入，本线程仅在同一 Bedrock 测试补源码行号注释与相同求和规则的恢复断言。该文件是原范围唯一显式例外；未改 `tests/**`。

## 锁定源码与 SDK 证据

pi-mono HEAD 实测为 `371cc25eb28d862d8ac7f218cbc315eaeccd669c`。以下 pi-ai 引用均相对 `<pi-mono>/packages/ai/src`，SDK 引用相对 `<pi-mono>/node_modules`。安装版本：`@aws-sdk/client-bedrock-runtime` **3.1127.0**，`@google/genai` **2.21.0**。

### Bedrock

- `api/bedrock-converse-stream.ts:178–179` 使用自定义 `model.baseUrl` 作为 endpoint；`:183–189,240–242` 将显式 `apiKey`/bearerToken 配置为 bearer auth；`:229–231` 支持 `AWS_BEDROCK_FORCE_HTTP1=1`。本地 endpoint/认证不是阻塞点。
- `api/bedrock-converse-stream.ts:298–319` 遍历 SDK 的 `response.stream` 并读取 `messageStart/contentBlockStart/contentBlockDelta/contentBlockStop/messageStop/metadata`。
- `api/bedrock-converse-stream.ts:583–632` 从 `delta.text`、`start.toolUse` 与 `delta.toolUse.input` 还原文本/工具。文本不需要合成空的 `contentBlockStart`。
- `api/bedrock-converse-stream.ts:633–677` 直接读取 `reasoningContent.text/signature/redactedContent`，不是请求端的 `reasoningText` 嵌套。`:688–691` 把 SDK 给出的 redacted bytes 还原为 base64 `thinkingSignature`。
- `api/bedrock-converse-stream.ts:710–720` 读取 `inputTokens/outputTokens/totalTokens/cacheReadInputTokens/cacheWriteInputTokens/cacheDetails`；不是 `inputTokenCount/outputTokenCount/totalTokenCount`。
- `@aws-sdk/client-bedrock-runtime/dist-es/schemas/schemas_0.js:1535–1553,1630–1634` 定义 delta/event unions；reasoning 的 text/signature 分成独立 delta，redactedContent 在 JSON payload 是 base64，SDK 解码为 bytes。`:1281–1285` 是 TokenUsage 的完整字段列表。
- `@smithy/core/dist-es/submodules/event-streams/eventstream-serde-universal/getUnmarshalledStream.js:17,34–41` 由 `:message-type=event` 与 `:event-type` 重建外层事件名称。因此 **payload 必须是事件内层对象**，不能再包 `{messageStart: ...}` 等外层 key。
- `@smithy/core/dist-es/submodules/event-streams/eventstream-codec/EventStreamCodec.js:46–57` 与 `splitMessage.js:6–25` 定义/校验长度与两级 CRC。真实 SDK 往返同时验证了该解码路径。

## 实现契约

`encode_events(&AssistantMessage) -> Result<Vec<Value>, String>` 保留逻辑 JSON 事件；`encode_sse` 保留测试用的逻辑 JSON SSE 接口，不再将 SSE 冒充 AWS wire transport。`encode_eventstream(&AssistantMessage) -> Result<Vec<u8>, String>` 为真正的 HTTP body。

每帧结构（多字节整数均 big-endian）：

| 区段 | 大小/语义 |
| --- | --- |
| total_length | u32；`16 + headers.len + payload.len` |
| headers_length | u32 |
| prelude_crc | u32；前 8 字节的 CRC32 |
| headers | name 长度 u8 + name bytes + 类型 `7` + value 长度 u16 + value bytes |
| payload | 事件内层 JSON UTF-8 bytes |
| message_crc | u32；整帧除末尾 4 字节的 CRC32（含 prelude_crc） |

固定字符串 headers 为 `:message-type=event`、`:event-type=<逻辑事件名>`、`:content-type=application/json`。CRC32 使用手写 256 项编译期查表，IEEE reflected polynomial `0xedb88320`、初始值与 final XOR 均 `0xffffffff`；没有新增依赖。

事件序列为 `messageStart` → 每 block 的 delta（工具另有 start，thinking signature 独立 delta）→ 每 block 的 stop → `messageStop` → `metadata`。metadata 包含 cacheRead/cacheWrite，`cacheWrite1h=Some(n)` 时包含 `cacheDetails:[{inputTokens:n,ttl:"1h"}]`。Pending 与 assistant image 返回错误。

`server.rs` 的专用 root 路由复用已有 decode、capture、registry selection/execute 契约；从 Bearer 或 SigV4 Credential 提取 registry `keyId`，不验证签名，不访问真实 AWS。缺 key、invalid request、无匹配/歧义、脚本错误及编码错误保留 HTTP 状态并返回 AWS JSON `{message,__type}`。通用协议 fallback 不变。

边界：只接入指定 root 路由，未为 `/{mount}/model/...` 或专用 mount port 增加 Bedrock 协议支持；回复是完整编码后的一段二进制 body，并不模拟 token 延时或网络 chunk 时序。

## Vertex 本地 harness 配置与认证裁定

证据：

- `api/google-vertex.ts:95–109` 显式 key 时走 `createClientWithApiKey`；`:375–385` 设置 `vertexai:true`、apiKey 与 httpOptions。
- `api/google-vertex.ts:388–397` 把自定义 baseUrl 写入 `httpOptions.baseUrl` 并设置 `ResourceScope.COLLECTION`；URL 已含 `/v1` 时 `apiVersion=""`，防止重复版本段。`:407–420` 拒绝空 URL 或仍含 `{location}` 的模板。
- `api/google-vertex.ts:429–439` 把空 key、`gcp-vertex-credentials` 与 `<...>` 占位 key 视为无 key；本地必须传普通非占位测试 key。
- `@google/genai/dist/node/index.mjs:13517–13539,13562–13564` 接受 custom baseUrl 并用 httpOptions 覆盖默认 endpoint；`:13657–13660` COLLECTION scope 不拼 projects/locations 路径。
- `@google/genai/dist/node/index.mjs:23770–23787,23798` 明确 apiKey 路径只加 `x-goog-api-key`，不创建 GoogleAuth/请求 ADC。
- **ADC 路径仍有认证约束**：pi-ai `api/google-vertex.ts:441–458` 要求 project/location，SDK `index.mjs:23800–23807` 调用 `googleAuth.getRequestHeaders`。只改 baseUrl 并不能保证无 key 的 ADC 模式离线可用；本次验证的是 API key/Express 路径，未声称 ADC 绕过。

可直接用于 harness 的 Model（将 port 换成本地 server 端口，registry keyId 注册为 `duality`）：

```js
const model = {
  id: "mock-gemini", name: "Mock Vertex", api: "google-vertex", provider: "duality",
  baseUrl: `http://127.0.0.1:${port}/v1`, reasoning: false, input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 100000, maxTokens: 1024,
};
const options = { apiKey: "duality", maxTokens: 64, signal: AbortSignal.timeout(10000) };
// 锁定 src/api/google-vertex.ts 的 vertex.stream(model, normalizedContext, options).result()
```

SDK 构造请求为 `/v1/publishers/google/models/mock-gemini:streamGenerateContent?alt=sse`。真实调用已验证 `capture.api="google-vertex"`、`keyId="duality"`、model=`mock-gemini`，返回文本 `vertex-local-ok`，stopReason=`stop`。没有传 project/location/credentials；显式 key 分支不会读取 ADC。

## Bedrock 不可逆字段：明确的 canonical / 规格投影

transport 正确不代表跨协议 AssistantMessage 全字段可逆。现有矩阵的 `providerFill` 没有 Bedrock 投影；本次 **不改测试**，在此规定 Bedrock 回复对偶应以以下投影为准，供后续 canonical 专项工作和独立审查采用：

| 字段/情形 | Bedrock canonical 回复投影 | 锁定行为证据 |
| --- | --- | --- |
| `usage.reasoning`（包括 0） | 删除此可选字段，不能把 thinking 文本长度当 reasoning token 数 | `api/bedrock-converse-stream.ts:137–150` 初始化不含 reasoning，`:710–720` metadata handler 不赋值；AWS `schemas_0.js:1281–1285` TokenUsage 不含该字段 |
| `responseId` | 删除此可选字段；不得把 HTTP request id 冒充 response id | `api/bedrock-converse-stream.ts:137–153` 输出初始化无 responseId，`:298–319` 事件分派不赋值；`:290–295` HTTP requestId 仅用于 onResponse header |
| terminal `error`/`aborted` 的任意原 errorMessage | 当前 encoder 发送 `guardrail_intervened`，客户端投影为 stopReason=`error`、errorMessage=`Provider stopped with: guardrail_intervened`；任意跨协议原错误文案不能无损存入该 stop reason | encoder 的 `messageStop` 映射；`api/bedrock-converse-stream.ts:1185–1198` 未知 stop reason 构造固定文案，`:340–357` 进入错误终止路径 |

这不是忽略差异/假绿：原始输入字段仍保留在脚本回复；当前矩阵仍报告以下失败。`cacheWrite1h` **不是不可逆字段**，已有真正的 cacheDetails 编码与 SDK 还原证据，不能删掉以降低断言。

只读复跑全部 30 个既有 Bedrock 案（与 `duality.mjs bedrock` 使用相同 cases/runners，但 results 只在内存，未调用 save）：

```text
req: 16 pass / 0 fail
reply: 4 pass / 10 fail
FAIL reply/reply-thinking-text: $.usage.reasoning: missing (expected 2)
FAIL reply/reply-error-finish-reason: $.errorMessage: expected "Provider finish_reason: content_filter", got "Provider stopped with: guardrail_intervened"
FAIL reply/reply-response-id: $.responseId: missing (expected "chatcmpl-duality-1")
FAIL reply/reply-corpus-kahuwo-2: $.usage.reasoning: missing (expected 29); $.responseId: missing
FAIL reply/reply-corpus-kahuwo-4: $.usage.reasoning: missing (expected 0); $.responseId: missing
FAIL reply/reply-corpus-claude-2: $.usage.reasoning: missing (expected 0); $.responseId: missing
FAIL reply/reply-corpus-claude-4: $.usage.reasoning: missing (expected 0); $.responseId: missing
FAIL reply/reply-corpus-glm5-2: $.errorMessage: expected original 400/model-specific text, got "Provider stopped with: guardrail_intervened"
FAIL reply/reply-corpus-claude2-2: $.usage.reasoning: missing (expected 0); $.responseId: missing
FAIL reply/reply-corpus-glm52-2: $.usage.reasoning: missing (expected 0); $.responseId: missing
```

上述诊断未修改测试、忽略字段或自动把失败转换成成功；16 个请求案已覆盖既有图片/工具/历史用例。Codex、其他协议及 60 案旧总表不在本次修复范围。

## 验证与独立复现

| 命令/检查 | 结果 |
| --- | --- |
| `cargo test --lib api::bedrock_converse_stream` 首次 | 7 pass / 1 fail；新 HTTP 错误单测误用缺 messages 的 `{}`，先触发有效的 400；改为合法 messages 测试预期 401/404，未修改 decoder |
| `cargo test --lib` 首次全量 | 104 pass / 1 fail；cacheDetails 严格断言冲突，按上述授权处理 |
| `cargo build` | 成功 |
| 最终 `cargo test` | **105 pass / 0 fail**；main/doc tests 0 项，均成功 |
| `rustfmt --edition 2021 --check`（下述文件） | 通过；最终覆盖全部改动 Rust 文件，修正 mod.rs 的测试模块字母排序后复验 |
| 非空非注释 LOC 检查 | Bedrock 模块全部源码、server.rs、usage_cache_tests.rs 均 ≤200 |
| 文档脚本语法/Markdown fences 检查 | 两段 Node 复现命令均经 `node --check --input-type=module` 通过，代码 fences 配对 |
| 真实 SDK inline smoke | 四条 PASS，见下文 |
| 不落盘矩阵诊断 | 完整执行 30 案，16/16 请求、4/14 回复；明确记录 10 个失败，不作为全绿测试 |

新增模块单测：CRC32 空值/标准向量 `123456789 => 0xcbf43926` 与独立逐位参考实现；帧长度、两级 CRC、字符串 headers 与未包外层 key 的 JSON payload；UTF-8 bytes；thinking text/signature 分离、redacted base64、工具 start/input/stop 与 cacheDetails 形状；Pending/image 拒绝；Bearer/SigV4 HTTP MIME/body；HTTP 错误状态与 AWS JSON 形状。既有逻辑事件单测增加 blockStop 断言。

格式检查命令：

```sh
rustfmt --edition 2021 --check src/api/bedrock_converse_stream/mod.rs src/api/bedrock_converse_stream/encode.rs src/api/bedrock_converse_stream/eventstream.rs src/api/bedrock_converse_stream/eventstream_tests.rs src/api/bedrock_converse_stream/transport_tests.rs src/api/bedrock_converse_stream/tests.rs src/server.rs src/api/usage_cache_tests.rs
```

真实 SDK smoke 在仓库根执行以下命令；使用既有 harness 的临时 registry/reply/capture，不写 `tests/**`。`local-test-only` 是本地虚构 SigV4 测试凭据，不是真实云凭据。

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { startServer, freePort, withCapture } from './tests/harness.mjs';
import { bedrock, vertex, piAi } from './tests/pi-ai-imports.mjs';
import { makeModel, streamOptions } from './tests/models-shared.mjs';
const port = await freePort();
const server = await startServer(port);
const context = piAi.normalizeContext({ messages: [{ role: 'user', content: 'hello', timestamp: 1 }] });
const usage = { input: 11, output: 7, cacheRead: 3, cacheWrite: 2, cacheWrite1h: 1, totalTokens: 18, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
try {
  const api = 'bedrock-converse-stream';
  const model = makeModel(api, port);
  const content = [
    { type: 'thinking', thinking: 'plan', thinkingSignature: 'sig' },
    { type: 'thinking', thinking: '[Reasoning redacted]', thinkingSignature: 'AQID', redacted: true },
    { type: 'text', text: 'hello 世界' },
    { type: 'toolCall', id: 'call-1', name: 'lookup', arguments: { q: 'x' } },
  ];
  const reply = { content, api, provider: model.provider, model: model.id, usage, stopReason: 'toolUse', timestamp: 0 };
  writeFileSync(server.replyPath, JSON.stringify(reply));
  const wireEvents = [];
  let responseMeta;
  const { value, record } = await withCapture(server, () => bedrock.stream(model, context, { ...streamOptions(api), signal: AbortSignal.timeout(10000), onResponse: (r) => { responseMeta = r; }, onProviderStreamEvent: (e) => wireEvents.push(e) }).result());
  assert.equal(value.stopReason, 'toolUse', value.errorMessage);
  assert.deepEqual(value.content, content);
  for (const name of ['input', 'output', 'cacheRead', 'cacheWrite', 'cacheWrite1h', 'totalTokens']) assert.equal(value.usage[name], usage[name]);
  assert.equal(record.api, api);
  assert.equal(record.keyId, 'duality');
  assert.equal(responseMeta.headers['content-type'], 'application/vnd.amazon.eventstream');
  assert.equal(wireEvents.length, 13);
  console.log('PASS Bedrock real AWS SDK: 13 binary events, text/reasoning/redacted/tool, usage/cacheWrite1h, capture');
  const raw = await fetch(`http://127.0.0.1:${port}/model/anthropic.claude-mock/converse-stream`, { method: 'POST', headers: { authorization: 'Bearer duality', 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: [{ text: 'hello' }] }] }) });
  assert.equal(raw.status, 200);
  assert.equal(raw.headers.get('content-type'), 'application/vnd.amazon.eventstream');
  const bytes = new Uint8Array(await raw.arrayBuffer());
  assert.equal(new DataView(bytes.buffer).getUint32(0) > 16, true);
  console.log(`PASS Bedrock HTTP wire: ${bytes.length} bytes; binary prelude; exact MIME`);
  writeFileSync(server.replyPath, JSON.stringify({ ...reply, content: [{ type: 'text', text: 'ok' }], stopReason: 'stop' }));
  const signedOptions = { region: 'us-east-1', env: { AWS_BEDROCK_FORCE_HTTP1: '1', AWS_ACCESS_KEY_ID: 'duality', AWS_SECRET_ACCESS_KEY: 'local-test-only' }, signal: AbortSignal.timeout(10000) };
  const signed = await withCapture(server, () => bedrock.stream(model, context, signedOptions).result());
  assert.equal(signed.value.stopReason, 'stop', signed.value.errorMessage);
  assert.equal(signed.record.keyId, 'duality');
  console.log('PASS Bedrock real AWS SDK SigV4: local dummy credentials; capture keyId=duality');
  const vertexModel = makeModel('google-vertex', port);
  const vertexReply = { content: [{ type: 'text', text: 'vertex-local-ok' }], api: 'google-vertex', provider: vertexModel.provider, model: vertexModel.id, usage: { ...usage, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 }, stopReason: 'stop', timestamp: 0 };
  writeFileSync(server.replyPath, JSON.stringify(vertexReply));
  const gotVertex = await withCapture(server, () => vertex.stream(vertexModel, context, { apiKey: 'duality', maxTokens: 64, signal: AbortSignal.timeout(10000) }).result());
  assert.equal(gotVertex.value.stopReason, 'stop', gotVertex.value.errorMessage);
  assert.equal(gotVertex.value.content[0].text, 'vertex-local-ok');
  assert.equal(gotVertex.record.api, 'google-vertex');
  assert.equal(gotVertex.record.keyId, 'duality');
  assert.equal(gotVertex.record.request.model, 'mock-gemini');
  console.log('PASS Vertex real @google/genai: explicit apiKey + local /v1 baseUrl; request capture and text reply; no ADC/project/location');
} finally { await server.stop(); }
NODE
```

实测输出：

```text
PASS Bedrock real AWS SDK: 13 binary events, text/reasoning/redacted/tool, usage/cacheWrite1h, capture
PASS Bedrock HTTP wire: 2062 bytes; binary prelude; exact MIME
PASS Bedrock real AWS SDK SigV4: local dummy credentials; capture keyId=duality
PASS Vertex real @google/genai: explicit apiKey + local /v1 baseUrl; request capture and text reply; no ADC/project/location
```

只读矩阵诊断可独立复现（不会覆盖历史 JSON）：

```sh
node --input-type=module <<'NODE'
import { startServer, freePort } from './tests/harness.mjs';
import { loadCorpora, corpusContexts, syntheticContexts, replyCases } from './tests/corpus.mjs';
import { additionalContexts, corpusReplies, additionalReplies } from './tests/extended-matrix-cases.mjs';
import { makeModel } from './tests/models-shared.mjs';
import { PROTOCOLS } from './tests/protocol-matrix.mjs';
import { requestDirection, replyDirection } from './tests/matrix-lib.mjs';
const api = 'bedrock-converse-stream';
const protocol = PROTOCOLS.find(p => p.api === api);
const corpora = loadCorpora();
const port = await freePort();
const server = await startServer(port);
const model = makeModel(api, port);
const results = [];
try {
  await requestDirection(api, model, server, [...corpusContexts(corpora), ...syntheticContexts(model), ...additionalContexts(model)], protocol.canonical, results);
  const replies = replyCases({ api, provider: model.provider, id: model.id });
  await replyDirection(api, model, server, results, [...replies, ...corpusReplies(corpora), ...additionalReplies(model, replies[0].message)]);
  for (const direction of ['req', 'reply']) {
    const list = results.filter(r => r.dir === direction);
    console.log(`${direction}: ${list.filter(r => r.ok).length} pass / ${list.filter(r => !r.ok).length} fail`);
  }
  for (const r of results.filter(r => !r.ok)) console.log(`FAIL ${r.dir}/${r.name}: ${r.diffs.slice(0, 5).join(' | ')}`);
  console.log('Read-only matrix diagnostic: no tests files or result JSON written');
} finally { await server.stop(); }
NODE
```

## 未闭项与工作区纪律

- 10 个回复投影失败仍需后续按上述锁定行为做 canonical 专项处置；本次只在授权文档显式规定投影，没有偷改测试。
- root Bedrock 路由之外的 mount 支持、逐 token 延时、ADC/区域 Vertex auth、Codex transport 均未扩展。
- 没遇到 cargo/node 被并行线程阻塞而需要 30s 重试的情况；历史失败为可定位的断言差异，已真实修正后复验。
- 工作目录没有 Git 元数据：`git status --short` 返回 `fatal: not a git repository`。未运行任何 stage/commit 命令，无暂存操作；无法以 Git 命令独立核验 diff/暂存区。并行线程的其他编辑不属于本线程改动清单。
- 独立 reviewer gate 尚待协调者执行；本记录提供源码行号、命令与原始结果，不以实现者自评代替独立审查。
