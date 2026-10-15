# 独立冻结复审裁决（第二轮）

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

**最终判定：批准冻结。**

F1–F5 **全部闭合**；从上一轮已通过项中跨五协议抽查 **5 项，全部通过**。结论来自当前文档与锁定源码的独立核验，不以作者第7节完成声明代替证据。

## Review

- **Correct**：修正文档已准确区分条件分支，图谱、canonical 规则与完成记录一致。
- **Fixed**：无。本轮只读。
- **Finding**：No issues found.
- **Merge verdict：OK——批准定义文档冻结。**

## 1. 核验口径

文档路径相对 `docs/design/mock-llm-server/`，Rust 路径相对本仓库。

TS 源码根为 `<pi-mono>/packages/ai/src`。下列别名均相对该根：

| 别名 | 文件 |
|---|---|
| TM | `api/transform-messages.ts` |
| MI | `api/mistral-conversations.ts` |
| GG | `api/google-generative-ai.ts` |
| SO | `api/simple-options.ts` |
| AM | `api/anthropic-messages.ts` |
| BR | `api/bedrock-converse-stream.ts` |
| SH | `api/openai-responses-shared.ts` |
| PM | `api/pi-messages.ts` |
| CX | `api/openai-codex-responses.ts` |

第一轮问题及其反例以 `freeze-verdict.md` 第4节为基准；第7节仅作为待验证的作者处置记录。

## 2. F1–F5 逐项复核

| 项目 | 结果 | 当前文档与独立源码证据 |
|---|---|---|
| **F1：跨模型 thinking→text 漏出 E 域** | ✅ | `irreversibility-atlas.md:278–279`、`api/mistral.md:27,66` 已将跨模型块类型转换登记为 D，E 明确要求块类型未转换、未过滤/净化且消息边界未合并。`TM:95–117` 确认三元身份判断和非空、非 redacted thinking→text；`MI:143–147,840–858` 确认实际执行转换后再发射。第一轮 model 不同、thinking=`"abc"` 的反例现落入 D，不再误判 E。 |
| **F2：ID 规范化被写成无条件规则** | ✅ | `irreversibility-atlas.md:280` 与 `api/mistral.md:28,63` 均区分 sameModel 原 ID 保持、cross-model 才规范化，并单列 content/calls 交错位置投影。`TM:95–98,136–151` 仅非 sameModel 调 normalizer、同步结果 ID；`MI:238–267` 实现九字符算法，`:860–863` 发射转换后的 ID。第一轮同模型 `call-1` 现准确预测为原样保持。 |
| **F3：流式工具名被误写为累积** | ✅ | `api/mistral.md:43,68` 与图谱 A09.09（`irreversibility-atlas.md:285`）明确 name 只取建块首段，只有 arguments 累积。`MI:710–749` 确认已有 slot 不再赋 name；同 index 的 `get_`、`weather` 保留 `get_`。`src/api/mistral_conversations/encode.rs:17–20` 每工具发送单帧完整 name，文档没有将这个受限往返域外推到一般 wire。 |
| **F4：Google 两种 maxTokens 规则冲突** | ✅ | `api/google-generative-ai.md:122,134` 均明确 Simple clamp、原生显式值直传。`GG:305–321` 调 `buildBaseOptions`；`SO:18–20,35–46` 实现上下文 clamp；`GG:379–384` 对非 undefined 显式 max 原值写入 `maxOutputTokens`。原生超上下文显式值不会被错误套用 Simple 规则。 |
| **F5：虚构 retention 环境解析** | ✅ | `api/mistral.md:65` 已删除 env long/default short 解析，并声明实际开关。`MI:546–552` 仅判断 `cacheRetention !== "none"` 与 truthy session；`MI:365–368` 保留显式 affinity 覆盖门控；`SO:52` 直接透传 retention。`src/api/mistral_conversations/decode.rs:17–21` 确认 body key 优先于 header。未指定、short、long 在有 session 时均走启用分支，与修正文档一致。 |

同步核验 `definition-freeze.md:5,569,611–615,819`：现行状态与上述修正一致；历史驳回仍保留为历史证据，作者没有自行解除独立 gate。

## 3. 上一轮已通过项抽查

选择 **D03、D07、D10、D15、D17**，分别覆盖 Anthropic、Bedrock、Responses、pi-messages、Codex。

| 项目 | 结果 | 独立复核证据 |
|---|---|---|
| **D03 / Anthropic 非 strict schema** | ✅ | `irreversibility-atlas.md:168–169` 仍区分整体投影 D、被删根键 L。`AM:1637–1650` 非 strict 只构造 type/properties/required，nested properties 原样保留；`src/api/anthropic_messages/messages.rs:8–17` 按收到的 schema 重建。未被本轮修正破坏。 |
| **D07 / Bedrock Q redacted thinking** | ✅ | `irreversibility-atlas.md:252` 正确区分 Q 空串与 R 占位。`BR:1038–1046` redacted 分支只发送解码后的 opaque 内容，不发送原 thinking；`src/api/bedrock_converse_stream/decode_assistant.rs:29–34` 重建 `thinking=""`、signature 与 redacted=true。 |
| **D10 / Responses ID 与 namespace** | ✅ | `api/openai-responses.md:204` 的规则仍准确。`TM:95–98,129–151` 维持三元同模型门控；`SH:154–177` 处理 foreign ID；`:257–325` 仅同 provider/api 不同 model 或前缀不匹配时删 item ID，foreign `fc_` 可保留，namespace 仍仅 sameModel 发射。Mistral 的条件修正未被错误泛化到此处。 |
| **D15 / pi-messages 合法终态** | ✅ | `irreversibility-atlas.md:314–315` 仍区分五合法终态 E 与成功 errorMessage L。`src/api/pi_messages/encode.rs:64–79` 原值发送 stop/length/toolUse/error/aborted；`PM:195–217` 原值赋回。成功 Done 没有 errorMessage 槽。 |
| **D17 / Codex session 截断** | ✅ | `irreversibility-atlas.md:133` 声明默认头与 body 使用同一截断值。`CX:276–284` 先 clamp，再传 body 与 SSE headers；`:562` 写 body key，`:1676–1679` 写两个头。`api/openai-prompt-cache.ts:1–7` 用 `Array.from` 按64码点截断，而非 UTF-16 单元。 |

## 4. 最终判定与验证边界

**批准冻结；修正清单为空。**

批准范围为本轮定义文档冻结 gate，不包含：

- 将历史81个 FAIL 宣告清零或重新认证矩阵结果。
- 批准 W-06/W-07、opaque 降级、模型扩容或新 stop 策略。
- 声称已穷尽复核所有未抽中的条目。

本轮只读静态核验，未运行测试、构建、矩阵或网络探针。作者报告的12项测试通过不作为本轮执行证据。`watchdog_diff` 返回无有效 Git HEAD 基线，因此无法核验工作树差异、提交历史或暂存区。