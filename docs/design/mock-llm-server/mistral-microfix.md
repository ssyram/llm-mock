# Mistral decoder microfix

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 范围与检查点

开始检查：2000-01-01 00:00 UTC；硬截止 00:30 UTC（30 分钟）。初始边界为仅写 `src/api/mistral_conversations/**` 与本文档；后续父会话明确修订任务书，授权唯一额外文件 `tests/canonical-mistral.mjs` 的 assistant 内容投影分支最小修正。未修改总账、矩阵、harness 或锁定 pi-mono 源码。

`final-ledger.md` 明确请求 thinking chunks 为“可修未修 decoder 缺陷”；`matrix-ten.md` F4 指向 `req/syn-same-model-thinking`。`decode.rs:13` 委托 `decode_messages`，实际需修的是 `decode_messages.rs` 的 assistant 分支，而不是添加第二套 decoder。锁定行为源 `pi-mono/packages/ai/src/api/mistral-conversations.ts:840–875` 保留 assistant contentParts 顺序，将 thinking 发送为 `{type:"thinking",thinking:[{type:"text",text:...}]}`；同文件 `667–671` 将 thinking 子文本无分隔拼接。架构 D3 挂载制不受此次纯 codec 修复影响。

当前代码仅识别顶层 `reasoning_content` / `reasoning`，再用 `content_text` 把 content 数组文本合并；thinking chunks 被丢弃。计划补回归测试，先实测失败，再修复并执行全量 `cargo test`。若 cargo/node 被并行 worker 阻塞，等待 30 秒重试；失败均作为 finding 保留。

## 实测记录（增量）

### Git 元数据检查

命令：`git status --short`（工具默认目录），exit 128；随后显式重试：

```sh
cd <repo> && git status --short
```

真实输出（两次相同）：

```text
fatal: not a git repository (or any of the parent directories): .git
Command exited with code 128
```

Finding：本仓库没有可用 Git 元数据，不能提供 Git diff 或独立核验暂存区。未执行任何 staging / commit 命令；不得把该检查记为通过。

### 时间检查

命令：`date -u +%Y-%m-%dT%H:%M:%SZ`，exit 0。

```text
2000-01-01
```

### 修复前回归（真实失败证据）

命令：

```sh
cd <repo> && cargo test decodes_mistral_assistant -- --nocapture
```

exit 101，编译完成 1.74s；没有并行 worker 阻塞。

```text
running 4 tests
...decodes_mistral_assistant_string_and_top_level_reasoning ... ok
...decodes_mistral_assistant_thinking_only_chunks ... FAILED
...decodes_mistral_assistant_same_model_thinking_chunks ... FAILED
...decodes_mistral_assistant_content_chunk_order_and_nested_thinking ... FAILED
test result: FAILED. 1 passed; 3 failed; 0 ignored; 0 measured; 105 filtered out; finished in 0.00s
```

真实断言摘录：thinking-only 的消息数量 `left: 0 / right: 1`；same-model 案 actual 为 `[{"text":"answer","type":"text"}]`，expected 为 thinking+text 两块；混合案 actual 文本为 `first\n\nsecond\n\nlast`，thinking 被丢弃，expected 保留四个 content chunks 后接工具调用。未弱化或删除失败断言。

### 修复后回归

命令：`cd <repo> && cargo test decodes_mistral_assistant -- --nocapture`，exit 0；编译完成 1.71s，无并行 worker 阻塞。

```text
running 4 tests
...decodes_mistral_assistant_thinking_only_chunks ... ok
...decodes_mistral_assistant_content_chunk_order_and_nested_thinking ... ok
...decodes_mistral_assistant_same_model_thinking_chunks ... ok
...decodes_mistral_assistant_string_and_top_level_reasoning ... ok
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 105 filtered out; finished in 0.00s
```

### 局部格式化

命令：`cd <repo> && rustfmt --edition 2021 src/api/mistral_conversations/decode_messages.rs src/api/mistral_conversations/tests.rs`，exit 0，stdout/stderr 均为空。仅格式化这两个文件。

## 实施内容

- assistant 数组内容按 wire 顺序解析 text / thinking，thinking 子文本无分隔拼接，不再用 `content_text` 合并数组。工具调用仍在内容块后追加。
- 字符串 content、顶层 `reasoning_content` / `reasoning` 与其他角色处理保持原逻辑。
- 新增四个回归测试：same-model 两块 thinking+text（最终与真实目标案一致）、交错/相邻文本块与嵌套多段 thinking 加工具调用、thinking-only、字符串与两个顶层 reasoning 别名。
- `decode.rs` 入口无需修改；未修改 encoder、统一模型、挂载或已有总账/矩阵文件。
- 按父会话范围例外，修正 `tests/canonical-mistral.mjs` 的 assistant thinking/text 投影：按源码保序，不再聚合，并附锁定源码行号注释。工具调用与其他分支不变。

### 全量 Rust 测试（首轮）

命令：`cd <repo> && cargo test`，exit 0，无并行 worker 阻塞。

```text
Finished `test` profile [unoptimized + debuginfo] target(s) in 1.19s
running 109 tests
test result: ok. 109 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.27s
Running unittests src/main.rs ...
test result: ok. 0 passed; 0 failed; ...
Doc-tests mock_llm_server
test result: ok. 0 passed; 0 failed; ...
```

### 格式与源码行数（首轮）

命令：`cd <repo> && rustfmt --check --edition 2021 src/api/mistral_conversations/decode_messages.rs src/api/mistral_conversations/tests.rs`，exit 0，输出为空。

命令：

```sh
cd <repo> && python3 - <<'PY'
from pathlib import Path
for p in sorted(Path('src/api/mistral_conversations').glob('*.rs')):
    lines = p.read_text().splitlines()
    loc = sum(bool(line.strip()) and not line.lstrip().startswith('//') for line in lines)
    print(f'{p}: {len(lines)} total lines, {loc} nonblank/noncomment lines')
    assert loc <= 200, f'{p} exceeds 200 LOC'
print('Mistral source LOC check passed')
PY
```

exit 0，真实输出摘录：

```text
src/api/mistral_conversations/decode_messages.rs: 121 total lines, 120 nonblank/noncomment lines
src/api/mistral_conversations/tests.rs: 166 total lines, 159 nonblank/noncomment lines
Mistral source LOC check passed
```

### 新发现：旧 Mistral oracle 聚合违背源码

读取 `tests/canonical-mistral.mjs` 原 assistant 分支发现：所有 thinking 以 `join("\n\n")` 聚为一块，所有 text 同理。`tests/corpus.mjs:145–153` 的目标案含两块 thinking+一块 text；锁定源码 `mistral-conversations.ts:840–858` 逐块推入 contentParts，decoder 正确输出应是三块，而非旧 oracle 的两块。这也影响既有 `syn-assistant-multi-text`。不能通过让 decoder 迁就错误 oracle 来宣称源码对偶。

已先向父会话报告该冲突，并明确提醒初始文件边界；父会话正式修订任务书，仅授权上述 canonical 分支例外。采取源码保序修正，没有删块、改语料或忽略差异。此前矩阵的聚合期望并非锁定源码行为，应作为 oracle finding 保留；本文不覆写历史矩阵结果或声称全矩阵已重新通过。

### 真实客户端请求验证（16 案）

先构建当前服务器：`cd <repo> && cargo build`，exit 0：

```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.08s
```

canonical 语法检查：`cd <repo> && node --check tests/canonical-mistral.mjs`，exit 0，输出为空。

时间检查：`date -u +%Y-%m-%dT%H:%M:%SZ`，exit 0：`2000-01-01`。

不运行会覆写 `tests/matrix-ten-results.json` 的脚本；以内联命令复用真实 harness / streamer / cases，不写测试证据文件：

```sh
cd <repo> && node --input-type=module <<'JS'
import { startServer, freePort } from './tests/harness.mjs';
import { loadCorpora, corpusContexts, syntheticContexts } from './tests/corpus.mjs';
import { additionalContexts } from './tests/extended-matrix-cases.mjs';
import { makeModel } from './tests/models-shared.mjs';
import { canonicalMistral } from './tests/canonical-mistral.mjs';
import { requestDirection } from './tests/matrix-lib.mjs';
const api = 'mistral-conversations';
const port = await freePort();
const server = await startServer(port);
const results = [];
try {
  const model = makeModel(api, port);
  const cases = [...corpusContexts(loadCorpora()), ...syntheticContexts(model), ...additionalContexts(model)];
  await requestDirection(api, model, server, cases, canonicalMistral, results);
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.api}/${r.dir}/${r.name}`);
    if (!r.ok) console.log(JSON.stringify(r.diffs));
  }
  console.log(`Mistral requests: ${results.filter(r => r.ok).length} pass / ${results.filter(r => !r.ok).length} fail`);
  const target = results.find(r => r.name === 'syn-same-model-thinking');
  console.log('Target actual assistant content:', JSON.stringify(target?.actual?.context?.messages?.find(m => m.role === 'assistant')?.content));
  if (results.some(r => !r.ok) || !target?.ok) process.exitCode = 1;
} finally {
  await server.stop();
}
JS
```

exit 0，无并行 worker 阻塞。真实完整输出：

```text
PASS mistral-conversations/req/corpus-sys-user
PASS mistral-conversations/req/corpus-orphan-toolcall
PASS mistral-conversations/req/corpus-full-convo
PASS mistral-conversations/req/corpus-claude-full
PASS mistral-conversations/req/corpus-thinking
PASS mistral-conversations/req/corpus-plain-multi-glm5
PASS mistral-conversations/req/corpus-plain-multi-glm52
PASS mistral-conversations/req/syn-tools-declared
PASS mistral-conversations/req/syn-multi-toolcall
PASS mistral-conversations/req/syn-same-model-thinking
PASS mistral-conversations/req/syn-assistant-multi-text
PASS mistral-conversations/req/syn-error-assistant-dropped
PASS mistral-conversations/req/syn-user-blocks
PASS mistral-conversations/req/syn-user-image
PASS mistral-conversations/req/syn-no-system
PASS mistral-conversations/req/syn-schema-metadata
Mistral requests: 16 pass / 0 fail
Target actual assistant content: [{"thinking":"first thought","type":"thinking"},{"thinking":"second thought","type":"thinking"},{"text":"done","type":"text"}]
```

### 最终回归（两块 thinking 已固定进 Rust 单测）

命令：`cd <repo> && cargo test`，exit 0：

```text
Finished `test` profile [unoptimized + debuginfo] target(s) in 1.40s
running 109 tests
test api::mistral_conversations::tests::decodes_mistral_assistant_same_model_thinking_chunks ... ok
test api::mistral_conversations::tests::decodes_mistral_assistant_content_chunk_order_and_nested_thinking ... ok
test api::mistral_conversations::tests::decodes_mistral_assistant_string_and_top_level_reasoning ... ok
test api::mistral_conversations::tests::decodes_mistral_assistant_thinking_only_chunks ... ok
test result: ok. 109 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.19s
Running unittests src/main.rs ...
test result: ok. 0 passed; 0 failed; ...
Doc-tests mock_llm_server
test result: ok. 0 passed; 0 failed; ...
```

命令：`cd <repo> && node --test tests/canonical-ten.test.mjs`，exit 0：

```text
✔ all ten protocols have explicit models, streamers and canonicals
✔ Responses variants retag identity and Codex defaults instructions without an output budget
✔ Azure constrained-sampling schema is strict without changing the context
✔ Vertex retags Google identity and retains full JSON schema metadata
✔ pi-messages preserves errors, orphan calls, metadata, timestamps and empty blocks
✔ Bedrock empty user placeholder and Mistral thinking canonical are explicit
ℹ tests 6
ℹ pass 6
ℹ fail 0
ℹ duration_ms 231.244208
```

命令：`cd <repo> && rustfmt --check --edition 2021 src/api/mistral_conversations/decode_messages.rs src/api/mistral_conversations/tests.rs`，exit 0，输出为空。

命令：

```sh
cd <repo> && python3 - <<'PY'
from pathlib import Path
paths = ['src/api/mistral_conversations/decode_messages.rs', 'src/api/mistral_conversations/tests.rs', 'tests/canonical-mistral.mjs']
for name in paths:
    p = Path(name)
    lines = p.read_text().splitlines()
    loc = sum(bool(line.strip()) and not line.lstrip().startswith('//') for line in lines)
    print(f'{p}: {len(lines)} total lines, {loc} nonblank/noncomment lines')
    assert loc <= 200
print('Final changed-source LOC check passed')
print('Git metadata exists:', Path('.git').exists())
PY
```

exit 0：

```text
src/api/mistral_conversations/decode_messages.rs: 121 total lines, 120 nonblank/noncomment lines
src/api/mistral_conversations/tests.rs: 168 total lines, 161 nonblank/noncomment lines
tests/canonical-mistral.mjs: 63 total lines, 60 nonblank/noncomment lines
Final changed-source LOC check passed
Git metadata exists: False
```

最终时间命令：`date -u +%Y-%m-%dT%H:%M:%SZ`，exit 0：`2000-01-01`。从开始检查至此约 8 分钟，未达到 30 分钟硬截止。cargo/node 均未遇到并行 worker 锁阻塞，故没有触发等待 30 秒重试；未将无关失败归因于并行 worker。

## 交付与剩余风险

修改文件：

- `src/api/mistral_conversations/decode_messages.rs:50–83`：assistant chunks 保序解析；其余角色、options 和身份逻辑未变。
- `src/api/mistral_conversations/tests.rs:21–120`：四个新增 decoder 回归，已有 encoder 单测仅受 rustfmt 格式调整，无语义修改。
- `tests/canonical-mistral.mjs:39–44`：经父会话显式范围例外授权，仅纠正错误聚合 oracle。
- `docs/design/mock-llm-server/mistral-microfix.md`：增量记录真实命令、结果、失败与范围裁决。

本任务修复完成，且只宣称 Mistral 请求侧 16 案、Rust 109 案与 canonical 单测 6 案通过；不宣称历史十协议全矩阵或所有回复问题已经解决。未重跑全矩阵/fuzz，未修改相关证据文件。未执行 staging/commit；Git 元数据缺失，无法提供 Git diff 或独立暂存区核验。代码人工自检未发现 blocker，但不替代独立 reviewer gate；推荐父会话 reviewer 按锁定源码和上述实际 capture 验收。

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Mistral assistant decoder now preserves source-ordered thinking/text chunks; only extra file is the canonical branch explicitly authorized by supervisor after finding the oracle conflict."
    },
    {
      "id": "criterion-2",
      "status": "satisfied",
      "evidence": "This report records exact executable commands, pre-fix 1 pass/3 fail, final cargo 109 pass, real pi-ai Mistral request 16 pass, canonical tests 6 pass, formatting and LOC results. Independent reviewer gate remains pending."
    }
  ],
  "changedFiles": [
    "src/api/mistral_conversations/decode_messages.rs",
    "src/api/mistral_conversations/tests.rs",
    "tests/canonical-mistral.mjs",
    "docs/design/mock-llm-server/mistral-microfix.md"
  ],
  "testsAddedOrUpdated": [
    "src/api/mistral_conversations/tests.rs: four new decoder regressions",
    "tests/canonical-mistral.mjs: corrected source-ordered oracle"
  ],
  "commandsRun": [
    {"command": "git status --short (default directory and explicit repository directory)", "result": "failed", "summary": "Both exit 128: no Git repository metadata"},
    {"command": "cargo test decodes_mistral_assistant -- --nocapture (before fix)", "result": "failed", "summary": "1 passed / 3 failed, confirming decoder loss"},
    {"command": "cargo test decodes_mistral_assistant -- --nocapture (after fix)", "result": "passed", "summary": "4 passed / 0 failed"},
    {"command": "rustfmt --edition 2021 src/api/mistral_conversations/decode_messages.rs src/api/mistral_conversations/tests.rs", "result": "passed", "summary": "Exit 0; scoped formatting"},
    {"command": "cargo test (first full run)", "result": "passed", "summary": "109 passed / 0 failed"},
    {"command": "cargo build", "result": "passed", "summary": "Exit 0; current server binary"},
    {"command": "node --check tests/canonical-mistral.mjs", "result": "passed", "summary": "Exit 0"},
    {"command": "node --input-type=module (full inline real-client Mistral request command above)", "result": "passed", "summary": "16 passed / 0 failed; target actual has two thinking chunks then text"},
    {"command": "cargo test (final two-thinking regression)", "result": "passed", "summary": "109 passed / 0 failed; main/doc tests 0 failures"},
    {"command": "node --test tests/canonical-ten.test.mjs", "result": "passed", "summary": "6 passed / 0 failed"},
    {"command": "rustfmt --check --edition 2021 src/api/mistral_conversations/decode_messages.rs src/api/mistral_conversations/tests.rs (two runs)", "result": "passed", "summary": "Both exit 0, no output"},
    {"command": "python3 source LOC checks (full commands above)", "result": "passed", "summary": "All checked sources <=200 LOC; .git does not exist"},
    {"command": "date -u +%Y-%m-%dT%H:%M:%SZ (three checks)", "result": "passed", "summary": "00:00:00 / 00:00:00 / 00:00:00, within deadline"}
  ],
  "validationOutput": [
    "Pre-fix: 1 passed / 3 failed",
    "Final cargo: 109 passed / 0 failed",
    "Real-client Mistral requests: 16 pass / 0 fail",
    "Canonical tests: 6 pass / 0 fail",
    "Changed source LOC: decoder 120, Rust tests 161, canonical 60"
  ],
  "residualRisks": [
    "Independent reviewer gate pending",
    "No Git metadata: Git diff and staged-state verification unavailable",
    "Historical full matrix/fuzz and reply findings not revalidated in this request-only microfix"
  ],
  "noStagedFiles": true,
  "diffSummary": "Source-ordered Mistral assistant chunk decoder, four regression tests, supervisor-authorized minimal oracle correction, and incremental evidence report.",
  "reviewFindings": [
    "No blockers in implementation self-check; independent review still required",
    "finding: prior Mistral canonical aggregated chunks contrary to locked source; corrected with explicit supervisor authorization",
    "finding: Git status failed due to absent metadata, not reported as passing"
  ],
  "manualNotes": "noStagedFiles means this worker performed no staging and no .git directory exists; not an independent Git index attestation. File-scope exception was explicitly escalated twice and authorized by supervisor before canonical edit."
}
```
