# pi-ai 对偶 Mock Server 最终分类总账

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 1. 口径与结论

锁定权威源码：`<pi-mono>/packages/ai/src`；本文 TS 路径均相对此根，Rust/测试/规格路径相对本仓库。源码优先，不修改语料、忽略规则或签名以制造绿灯。

先分类后复跑：原快照为 **634 项、553 pass / 81 fail**（2000-01-01 → 00:00:00；SHA256 `1f1b84c6e984a3cb48a07a2308d14b0d2267167ea2c63fbd8b0779d723b27b00`）。81 项已全部逐案分类，未分类项 **0**。先完整分类落盘后已完成本轮全量实跑：**553 pass / 81 fail**，失败主键集合与接手快照完全相同，无消失项、无新增项。Mistral 修正已在接手快照内生效，本轮未虚构“已消失”项。

## 2. 分类框架与源码/规格证据

| 代码 | 类别 | 原81项数量 | 判据与处置 |
|---|---|---:|---|
| T | transport blocker | 63 | Codex 压缩字节在 UTF-8 extractor 失败，capture=0；未进入 decoder，不能推定请求/回复内容已通过。仍阻塞。 |
| O | 跨协议 opaque signature | 18 | Responses/Azure 只支持 reasoning-item JSON，源签名为 `reasoning_content`；oracle JSON.parse 拒绝，encoder 也明确拒绝该输入域。仍阻塞，非无损签名遗失。 |
| U | usage 缓存不可逆 | 0 | 保留既有声明类别；当前81项没有以 usage diff 失败的案例。不可把被 transport 遮蔽的 Codex 缓存案归作 U 或 PASS。 |
| M | Mistral oracle 已修的过期快照 | 0 | 保留既有类别，但原634快照 Mistral 已全通过；不得凭预期虚构本轮消失的 fail。 |

**T 源码证据：** `api/openai-codex-responses.ts:215–231,378–385` 在压缩成功后直接发送 `Content-Encoding: zstd` 和压缩 body，不等服务端公告；本仓库 `src/mounts/routing.rs:16–23`（`:22 body: String`）在 handler 前按 UTF-8 提取，解压没有机会执行。规格 `docs/design/mock-llm-server/api/family-variants.md:62,91,170` 明确要求先解压再解析。每条 T 案的原始 diff 都是 `expected exactly 1 capture file, got 0; SDK: Request body didn't contain valid UTF-8: invalid utf-8 sequence of 1 bytes from index 1`（原文另有空文件列表分隔 `: ;`）。

**O 源码证据：** `api/openai-responses-shared.ts:265–267` 请求签名直接 JSON.parse；`:688–693` 回复签名是整个 reasoning item 的 JSON.stringify；`api/openai-responses.ts:28`、`api/azure-openai-responses.ts:14` 共享转换/流解析。Rust `src/api/openai_responses/encode.rs:18–24` 同样要求可解析 JSON 且 `type=reasoning`。规格 `docs/design/mock-llm-server/api/openai-responses.md:184–190`、Azure 共享域规格 `api/family-variants.md:166`。每条 O 案的 diff 均为 `Unexpected token 'r', "reasoning_content" is not valid JSON`。这是 `tests/matrix-lib.mjs` 在真实 capture 后调用 `fillResponses` → `canonicalOresThinking` 时的异常，结果文件的 expected/actual 为 null；不伪称已有逐字段比较，也不伪称该异常本身来自 Rust。

## 3. 81 项逐案总账

每行主键为 `API / direction / case`；编号对应接手快照中的失败顺序。T/O 的具体源码机制见上一节，每行同时列规格行号及 diff 摘要。失败保留，不删样本、不把“声明支持域”记为 PASS。

| # | case（API / direction / name） | 类别 | 一句证据 / 处置 |
|---|---|---|---|
| 1 | `openai-responses / reply / reply-corpus-kahuwo-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 2 | `openai-responses / reply / reply-corpus-claude2-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 3 | `openai-responses / reply / reply-corpus-b4-claude-reason-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 4 | `openai-responses / reply / reply-corpus-b4-deepseek-mixed-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 5 | `openai-responses / reply / reply-corpus-b4-deepseek-codegen-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 6 | `openai-responses / reply / reply-corpus-b4-deepseek-longreason-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 7 | `openai-responses / reply / reply-corpus-b4-kimi-reason-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 8 | `openai-responses / reply / reply-corpus-b4-kimi-toolerr-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 9 | `openai-responses / reply / reply-corpus-b4-glm53-mixed-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 10 | `azure-openai-responses / reply / reply-corpus-kahuwo-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`、`api/family-variants.md:166`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 11 | `azure-openai-responses / reply / reply-corpus-claude2-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`、`api/family-variants.md:166`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 12 | `azure-openai-responses / reply / reply-corpus-b4-claude-reason-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`、`api/family-variants.md:166`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 13 | `azure-openai-responses / reply / reply-corpus-b4-deepseek-mixed-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`、`api/family-variants.md:166`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 14 | `azure-openai-responses / reply / reply-corpus-b4-deepseek-codegen-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`、`api/family-variants.md:166`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 15 | `azure-openai-responses / reply / reply-corpus-b4-deepseek-longreason-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`、`api/family-variants.md:166`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 16 | `azure-openai-responses / reply / reply-corpus-b4-kimi-reason-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`、`api/family-variants.md:166`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 17 | `azure-openai-responses / reply / reply-corpus-b4-kimi-toolerr-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`、`api/family-variants.md:166`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 18 | `azure-openai-responses / reply / reply-corpus-b4-glm53-mixed-2` | O / 跨协议 opaque signature | `reasoning_content` 非 JSON，oracle 抛 Unexpected token r；规格 `api/openai-responses.md:186–188`、`api/family-variants.md:166`，SH:265–267,688–693 / encode.rs:18–24；仍阻塞。 |
| 19 | `openai-codex-responses / req / corpus-sys-user` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 20 | `openai-codex-responses / req / corpus-orphan-toolcall` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 21 | `openai-codex-responses / req / corpus-full-convo` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 22 | `openai-codex-responses / req / corpus-claude-full` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 23 | `openai-codex-responses / req / corpus-thinking` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 24 | `openai-codex-responses / req / corpus-plain-multi-glm5` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 25 | `openai-codex-responses / req / corpus-plain-multi-glm52` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 26 | `openai-codex-responses / req / corpus-b4-claude-thinking` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 27 | `openai-codex-responses / req / corpus-b4-claude-parallel-toolcall` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 28 | `openai-codex-responses / req / corpus-b4-claude-tool-error` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 29 | `openai-codex-responses / req / corpus-b4-mixed-zh-en` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 30 | `openai-codex-responses / req / corpus-b4-codegen` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 31 | `openai-codex-responses / req / corpus-b4-long-thinking` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 32 | `openai-codex-responses / req / corpus-b4-glm52-codegen-mixed` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 33 | `openai-codex-responses / req / corpus-b4-glm52-parallel-toolcall` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 34 | `openai-codex-responses / req / corpus-b4-glm52-tool-error-zh` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 35 | `openai-codex-responses / req / corpus-b4-kimi-reason` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 36 | `openai-codex-responses / req / corpus-b4-kimi-thinking-tool-error` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 37 | `openai-codex-responses / req / corpus-b4-glm53-parallel-toolcall` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 38 | `openai-codex-responses / req / corpus-b4-glm53-mixed` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 39 | `openai-codex-responses / req / syn-tools-declared` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 40 | `openai-codex-responses / req / syn-multi-toolcall` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 41 | `openai-codex-responses / req / syn-same-model-thinking` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 42 | `openai-codex-responses / req / syn-assistant-multi-text` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 43 | `openai-codex-responses / req / syn-error-assistant-dropped` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 44 | `openai-codex-responses / req / syn-user-blocks` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 45 | `openai-codex-responses / req / syn-user-image` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 46 | `openai-codex-responses / req / syn-no-system` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 47 | `openai-codex-responses / req / syn-schema-metadata` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 48 | `openai-codex-responses / reply / reply-text-stop` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 49 | `openai-codex-responses / reply / reply-thinking-text` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 50 | `openai-codex-responses / reply / reply-single-toolcall` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 51 | `openai-codex-responses / reply / reply-multi-toolcall` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 52 | `openai-codex-responses / reply / reply-length` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 53 | `openai-codex-responses / reply / reply-error-finish-reason` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 54 | `openai-codex-responses / reply / reply-response-id` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 55 | `openai-codex-responses / reply / reply-corpus-kahuwo-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 56 | `openai-codex-responses / reply / reply-corpus-kahuwo-4` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 57 | `openai-codex-responses / reply / reply-corpus-claude-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 58 | `openai-codex-responses / reply / reply-corpus-claude-4` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 59 | `openai-codex-responses / reply / reply-corpus-glm5-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 60 | `openai-codex-responses / reply / reply-corpus-claude2-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 61 | `openai-codex-responses / reply / reply-corpus-glm52-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 62 | `openai-codex-responses / reply / reply-corpus-b4-claude-reason-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 63 | `openai-codex-responses / reply / reply-corpus-b4-claude-multitool-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 64 | `openai-codex-responses / reply / reply-corpus-b4-claude-multitool-5` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 65 | `openai-codex-responses / reply / reply-corpus-b4-claude-toolerr-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 66 | `openai-codex-responses / reply / reply-corpus-b4-claude-toolerr-4` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 67 | `openai-codex-responses / reply / reply-corpus-b4-deepseek-mixed-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 68 | `openai-codex-responses / reply / reply-corpus-b4-deepseek-codegen-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 69 | `openai-codex-responses / reply / reply-corpus-b4-deepseek-longreason-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 70 | `openai-codex-responses / reply / reply-corpus-b4-glm52-codegen-mixed-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 71 | `openai-codex-responses / reply / reply-corpus-b4-glm52-multitool-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 72 | `openai-codex-responses / reply / reply-corpus-b4-glm52-multitool-5` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 73 | `openai-codex-responses / reply / reply-corpus-b4-glm52-toolerr-zh-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 74 | `openai-codex-responses / reply / reply-corpus-b4-glm52-toolerr-zh-4` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 75 | `openai-codex-responses / reply / reply-corpus-b4-kimi-reason-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 76 | `openai-codex-responses / reply / reply-corpus-b4-kimi-toolerr-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 77 | `openai-codex-responses / reply / reply-corpus-b4-kimi-toolerr-4` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 78 | `openai-codex-responses / reply / reply-corpus-b4-glm53-multitool-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 79 | `openai-codex-responses / reply / reply-corpus-b4-glm53-multitool-5` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 80 | `openai-codex-responses / reply / reply-corpus-b4-glm53-mixed-2` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |
| 81 | `openai-codex-responses / reply / reply-nonzero-cache-usage` | T / transport blocker | capture 期望1实得0，SDK 报 zstd body 非法 UTF-8（index 1）；规格 `api/family-variants.md:91,170`，CR:378–385 → Rust routing:22；仍阻塞。 |

## 4. 可修未修与边界

- **T：可修未修（超出本轮允许的 `src/api/**`）。** 修法草图：路由边界改按 bytes 接收，依据 `Content-Encoding: zstd` 解压后再 UTF-8/JSON、选择协议及 capture；补真实 Codex SSE 压缩请求与损坏压缩帧 HTTP 回归。不能仅在 decoder 中解压，因为 `String` extractor 已提前拒绝。不得禁压缩、改 fetch 或改 SDK 来掩盖。
- **O：存疑策略未修。** 跨协议 opaque signature 不存在源协议承诺的无损映射；确定性降级可生成 reasoning item 并显式声明签名投影，但会改变语义/支持域，不是有唯一源码结论的小 encoder bug。需要另行批准降级契约并补同协议 JSON 签名、跨协议 opaque 签名和可见 thinking 单测；本轮不硬修、不放宽 oracle。
- 未发现允许范围内、证据确凿且不改变支持域的小 decoder/encoder 缺陷；本轮不改生产源码或单测，不宣称新修复。

## 5. 复跑与验证（增量记录）

接手先分类后实跑，`cargo build` exit0；随后 `node tests/duality.mjs` exit1（真实失败保留），运行时间 **2000-01-01 → 2000-01-01**。结果 JSON SHA256 `c353a77ea473495f24614fb47bfc023bc000bf8081adc2c4c5972e2d6c451311`；完整日志 `tests/matrix-ten-run.log`。按(API,direction,name)核对旧81行与当前结果，集合严格相等。

| API | req pass/fail | reply pass/fail | total pass/fail |
|---|---|---|---|
| openai-completions | 29/0 | 34/0 | 63/0 |
| openai-responses | 29/0 | 25/9 | 54/9 |
| azure-openai-responses | 29/0 | 25/9 | 54/9 |
| openai-codex-responses | 0/29 | 0/34 | 0/63 |
| anthropic-messages | 29/0 | 34/0 | 63/0 |
| google-generative-ai | 29/0 | 34/0 | 63/0 |
| google-vertex | 29/0 | 34/0 | 63/0 |
| bedrock-converse-stream | 29/0 | 34/0 | 63/0 |
| mistral-conversations | 29/0 | 34/0 | 63/0 |
| pi-messages | 30/0 | 37/0 | 67/0 |

全部为本轮实际命令，不引用历史结果冒充复验；启动 server 的 Node 命令串行执行，无端口抢占。

| 命令 | exit | 本轮结果 |
|---|---:|---|
| `cargo build` | 0 | 新运行前确认 debug binary 最新，无生产修改 |
| `set -o pipefail` 后 `node tests/duality.mjs \| tee tests/matrix-ten-run.log` | 1 | 634项，553/81；失败明细完整保留 |
| `cargo test` | 0 | **109 passed / 0 failed**；main/doc均0失败 |
| `set -o pipefail` 后 `node tests/fuzz.mjs \| tee tests/matrix-ten-fuzz.log` | 0 | **1600 passed / 0 failed**，默认200 seeds × 4 APIs × 双方向 |
| `node --test --test-concurrency=1 tests/canonical-ten.test.mjs tests/canonical-occ-reply.test.mjs tests/canonical-reply-projections.test.mjs tests/mock-script-contract.test.mjs` | 0 | **15 passed / 0 failed**；包括真实OCC SSE签名与三HTTP错误协议 |
| Python JSON/ledger主键、分类数量与SHA256断言 | 0 | 634个唯一案例，81条失败与81行账目一一对应；T63/O18/U0/M0 |
| `git status --short` | 128 | 本目录无Git仓库；未执行stage/commit，不虚构暂存区检查通过 |

`tests/matrix-ten-run.log` SHA256 `118158264517bbf7633c8ac147f907d0a9e4fa55af2a0730d467d5ed89c563c6`；`tests/matrix-ten-fuzz.log` SHA256 `a8ea35550f4f80acc22cf9963575fd65784cbdeba813043a669aa648a0c3a584`（本轮重跑后内容与原fuzz日志相同）。接手时run.log仍是旧314项279/35，不能拿它证明旧634快照；现已用本轮634项日志替换，与JSON完全一致。

权威 TS 树开始与结束 SHA256相同：`b5ff86777c0c1fd15280ab0cee1f4cbe7828922e9be717ce85fed9976af7bab0`（243 文件；排序相对路径 + NUL + 文件内容 + NUL 累积），已断言确认无改动。

## 6. 历史证据保留（不混入本轮81项统计）

- 旧314项279/35与更早304项270/34是历史口径，已由634项快照替代；原Codex 31阻塞扩容为63，原Responses/Azure 4 opaque失败扩容为18。不能将旧数量用于当前验收。
- 既有修复：Bedrock AWS 二进制 EventStream transport；Mistral thinking/text 保序及 cacheRead；Google input/cached逆公式；Anthropic responseModel oracle；OCC reasoning details最终签名 canonical。原五个fuzz seed 30/53/114/156/189 的测试保留，详见 `fuzz.md`、`fix-rust.md`、`mistral-microfix.md` 和 API 规格。
- 既有不可逆声明：Google/Mistral cacheWrite 与部分协议 cacheWrite1h；Anthropic legacy非strict schema根metadata；Bedrock reasoning usage、responseId/responseModel 与错误投影。声明不等于容许删除协议可逆字段；既有缓存夹具仍含input11/output5/read13/write17/1h7。
- mock script 前缀路由及429错误透传已修的测试继续保留；CLI `pi --print -c`、项目 `.pi/models.json`、Vertex ADC/project/location、Codex WS、所有命名mount并非本轮离线矩阵证明范围。HTTP测试不冒充CLI E2E。
- 仓库无 `.git`（`git status --short` exit128）；本轮未运行 add/stage/commit，无法声称成功读取不存在的暂存区。独立 reviewer gate 仍由父会话负责，不自批准。

## 7. 改动、验收与剩余风险

- 内容变更文件：本文、`tests/matrix-ten-results.json`、`tests/matrix-ten-run.log`；fuzz日志重跑但内容不变。没有生产代码、canonical、deepDiff、忽略规则、corpus或单测修改；新增/修改测试 **0**。
- 分类收官已完成：81/81逐行保留case、diff摘要、源码及规格行号；旧“未分类后续派发”段已移除。没有以新增类别藏失败，既有四类足够覆盖本轮结果。
- 验收证据包括JSON、矩阵日志、fuzz日志、本文命令输出摘要和锁定源码树哈希。独立 reviewer 应复核第3节81个主键、规格引用和第5节数量；本轮不自批准 required reviewer gate。
- 剩余风险：Codex transport遮蔽全部63个内容验证；18个跨协议签名仍不在目标无损编码域。大修/策略修法已明确记录“可修未修”，不是本轮测试回归。Vertex ADC、CLI及WS的未覆盖边界不因本次矩阵通过案例而扩大。
- no-staged-files：本轮没有stage/commit操作；本目录无`.git`，故仅能确认无本轮暂存动作，不把exit128包装成成功的暂存区审计。

## 8. 三态统计

以接手 **81 个 fail** 为闭合分母：**已修 0 / 声明不可逆 0 / 仍阻塞 81（T 63 + O 18）**；未分类 **0**。最终634项实跑仍为553/81，见第5节；“仍阻塞”表示协议/transport问题尚存，不表示尚未分类。
