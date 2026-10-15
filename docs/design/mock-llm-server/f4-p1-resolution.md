# W08-F4 / P1 owner 裁决实施与复跑

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 结论与边界

- **W08-F4 是实现接线缺口，不是协议缺口。** 统一 Api::encode 已调用 Codex wrapper；原六个 Some(bool) 案全部转绿，扩展 HTTP 检查 74/74。普通 Responses/Azure 仍不发 end_turn。
- **P1 24 例已逐例定性闭环：23 个 pi 连续转换固有非幂等，1 个 oracle 定义域缺陷；decoder 残留 0。** 没有借改默认身份、去签名或删空块来制造字面幂等。
- supervisor 明确批准演进 P1：X=Q_p(C) 有值时，比较 Q_p(B(X)) 与 K_p(B(X))；保留 rawIdempotent/rawDiffs。该性质是首次投影后的规则合成一致性，不表示再次转换已到不动点。Unicode 案记 expected-rejection/domain finding，不计通过且保留 203 分母。
- 最终 P1 **202/203**；原始字面幂等仍为 **179/203**（23 个真实非幂等、1 个无正常 X）。没有将全部 property 宣称全绿。
- TS 权威根只读：`<pi-mono>/packages/ai/src`；243 个文件 SHA-256 与起始记录完全一致，未写该目录。

## 1. W08-F4 源码判定与 reunification

CX 均相对只读权威根。`api/openai-codex-responses.ts:766–772` 对 response.failed 先抛错；`:775–783` 对 done/completed/incomplete 读取 boolean response.end_turn。故 completed/incomplete 的 true/false 必须保留，None 省略；failed 不宣称正常读取。Codex wrapper `src/api/openai_codex_responses/encode.rs:5–6` 已将 msg.end_turn 传给共享 terminal encoder，原路由却直接进入不带该字段的 Responses 入口。

共享路径证据：`src/mounts/routing.rs:24–38` 合并专用监听、公共路径与命名挂载；`:79–80` 调用 server::process，`src/server.rs:120–121` 进入 routing::execute，`src/mounts/routing.rs:115–118` 统一调用 Api::encode。只修改 `src/mounts/protocol.rs:86–94`：Responses/Azure 保持根入口，Codex 使用已有 wrapper。没有为任一路径增加字段补丁。

`tests/w08-wire-checks.mjs:19–31` 现在覆盖 `/backend-api/codex/responses`、`/codex/responses` 及二者的命名挂载形式（挂载 command 与既有 fixture 共用，prefer 只影响 completions，不改 Codex 选择）。每路径覆盖 stop/length/toolUse/error × None/true/false。公共原六案全部通过；四路径 Codex 共48案，Responses/Azure各12案，加原2个W06-F2检查，共74案全部通过。专用监听的 end_turn 未单独发HTTP，只有共享调用链与既有Rust挂载测试证据。

此为未压缩真实本地 HTTP/SSE 检查，**不证明 Codex SDK 的 zstd、WS、外网认证或完整SDK端到端已解阻**。批准的 E 契约不变，transport T 不因这次修复被抹去。

## 2. P1 逐例三方定性

原24条完整 expected/actual/diffs、原结果 SHA-256 与时间保存于 `tests/property-p1-counterexamples.json`。下表按该文件原顺序，一例一行；新实际输出/期待/rawDiffs 在 `tests/property-results.json`。所有“pi固有”案均有独立合成 oracle 与真实二轮 HTTP 解码核对，不按 case 名豁免。

证据代码：

- **T（身份/签名/思考）**：TM=`api/transform-messages.ts:95–145`，三元同模型判断与跨模型降级。decoder 默认身份见 `src/api/openai_completions/decode.rs:154–158`、`src/api/openai_responses/decode.rs:123–127`、`src/api/anthropic_messages/messages.rs:168–170`、`src/api/google_generative_ai/decode.rs:98–99`。原模型 provider=duality，不可将 decoder 默认值反推为源身份。Google 的再发射同源/base64/空块门槛见 `api/google-shared.ts:230–281`；Responses 签名重新发射见 `api/openai-responses-shared.ts:263–327`。
- **I（ID）**：TM:129–142 只对跨模型 ID 调用规范器；OCC=`api/openai-completions.ts:1202–1225`，Responses=`api/openai-responses-shared.ts:154–177,290–327`，Anthropic=`api/anthropic-messages.ts:1325–1328`。首轮同源可以保留未规范 ID，二轮因默认身份触发清洗；toolResult ID 跟随映射，不是 decoder 错配。
- **U（清洗/空块）**：`utils/sanitize-unicode.ts:21–24`；OCC:1268–1274（user length过滤在清洗前）、1298–1308（assistant trim过滤在清洗前）；Anthropic:1400–1448；Google shared:232–268。净化后已发空串在二轮才满足过滤条件，是 pi 规则顺序，不是 Rust 不读 wire 空块。
- **D（定义域）**：`api/openai-responses.ts:277–291` 把原 sessionId 写到 header（options header 最后覆盖），body 的64码点截断不能使 header 合法。无 capture 的 ByteString 拒绝发生在首次正常 Q 之前，不能定性 decoder 残留，也不能算幂等失败已修成通过。

| # | 协议 | 原 case | 三方定性 | 依据与实际漂移 | 处理/复跑 |
|---:|---|---|---|---|---|
| 1 | openai-completions | `syn-same-model-thinking` | pi固有非幂等 | 默认 provider="" 触发跨模型；thinking 拼入 text，块数 2→1（T） | G5/Q-COMPOSE；合成通过，raw=false |
| 2 | openai-completions | `w06-signed-empty-and-call` | pi固有非幂等 | 同模型首轮保留 call-1\|fc_item，二轮跨模型改为 call-1_fc_item（I） | G5/Q-COMPOSE；合成通过，raw=false |
| 3 | openai-completions | `w06-vision-error-image-order` | pi固有非幂等 | 相同 ID 再规范化，配对 toolCallId 同步变化；图片不丢（I） | G5/Q-COMPOSE；合成通过，raw=false |
| 4 | openai-completions | `w06-vision-image-only` | pi固有非幂等 | 相同 ID 再规范化；图片值保持（I） | G5/Q-COMPOSE；合成通过，raw=false |
| 5 | openai-completions | `w06-surrogate-order` | pi固有非幂等 | user surrogate-only 块首轮净化为空，二轮按原 length=0 过滤（U） | G5/Q-COMPOSE；合成通过，raw=false |
| 6 | openai-completions | `w06-q-details-first` | pi固有非幂等 | 空 thinking/details 首轮存在，二轮跨模型空 thinking 删除（T） | G5/Q-COMPOSE；合成通过，raw=false |
| 7 | openai-responses | `syn-same-model-thinking` | pi固有非幂等 | 默认 openai ≠ duality；两个 reasoning→text，文本签名索引重新生成（T） | G5/Q-COMPOSE；合成通过，raw=false |
| 8 | openai-responses | `w06-signed-empty-and-call` | pi固有非幂等 | 默认身份触发 textSignature/namespace 删除及 call/item 再清洗（T+I） | G5/Q-COMPOSE；合成通过，raw=false |
| 9 | openai-responses | `w06-vision-error-image-order` | pi固有非幂等 | 默认身份触发 namespace 删除及 ID 再清洗；图片保持（I） | G5/Q-COMPOSE；合成通过，raw=false |
| 10 | openai-responses | `w06-vision-image-only` | pi固有非幂等 | 同上，image-only 结果保持（I） | G5/Q-COMPOSE；合成通过，raw=false |
| 11 | openai-responses | `w06-unicode-session` | oracle定义域缺陷 | 首次无 capture；未截断 Unicode session header 被 ByteString 拒绝，X 不存在（D） | domainMatched=true；仍finding，不计绿 |
| 12 | openai-responses | `fuzz-s6` | pi固有非幂等 | 同模型首轮 call_2 x 保留，二轮跨模型→call_2_x（I） | G5/Q-COMPOSE；合成通过，raw=false |
| 13 | openai-responses | `fuzz-s8` | pi固有非幂等 | 同模型首轮 call_1\|fc_h92 保留，二轮→call_1_fc_h92（I） | G5/Q-COMPOSE；合成通过，raw=false |
| 14 | anthropic-messages | `syn-same-model-thinking` | pi固有非幂等 | 默认 anthropic ≠ duality；两个 signed thinking→text（T） | G5/Q-COMPOSE；合成通过，raw=false |
| 15 | anthropic-messages | `w06-signed-empty-and-call` | pi固有非幂等 | 默认身份二轮跨模型清洗 call-1\|fc_item→call-1_fc_item（I） | G5/Q-COMPOSE；合成通过，raw=false |
| 16 | anthropic-messages | `w06-vision-error-image-order` | pi固有非幂等 | 同上，配对 ID 同步；错误结果图文投影不漂移（I） | G5/Q-COMPOSE；合成通过，raw=false |
| 17 | anthropic-messages | `w06-vision-image-only` | pi固有非幂等 | 同上，image-only 结果不漂移（I） | G5/Q-COMPOSE；合成通过，raw=false |
| 18 | anthropic-messages | `w06-surrogate-order` | pi固有非幂等 | assistant surrogate-only 块首轮净化为空，二轮 trim 过滤（U） | G5/Q-COMPOSE；合成通过，raw=false |
| 19 | anthropic-messages | `fuzz-s8` | pi固有非幂等 | 默认身份二轮跨模型：多个空格/竖线 ID 规范化、两个 thinking→text（T+I） | G5/Q-COMPOSE；合成通过，raw=false |
| 20 | google-generative-ai | `syn-same-model-thinking` | pi固有非幂等 | 默认 provider/model 均空，两个 thinking→text（T） | G5/Q-COMPOSE；合成通过，raw=false |
| 21 | google-generative-ai | `w06-signed-empty-and-call` | pi固有非幂等 | 默认身份二轮删除空 text 的签名后过滤空块，并丢工具 thoughtSignature（T） | G5/Q-COMPOSE；合成通过，raw=false |
| 22 | google-generative-ai | `w06-vision-error-image-order` | pi固有非幂等 | 默认身份二轮同源门槛不成立，工具 thoughtSignature 不再发射（T） | G5/Q-COMPOSE；合成通过，raw=false |
| 23 | google-generative-ai | `w06-vision-image-only` | pi固有非幂等 | 同上，image-only 结果图像保持（T） | G5/Q-COMPOSE；合成通过，raw=false |
| 24 | google-generative-ai | `w06-surrogate-order` | pi固有非幂等 | assistant surrogate-only 块首轮净化为空，二轮空白过滤（U） | G5/Q-COMPOSE；合成通过，raw=false |

## 3. 统一实现与定义同步

- `tests/property-request-projection.mjs:4–15` 是 P1 唯一期待出口：K(B(first))；first/actual/expected、完整 rawDiffs 以及 rawIdempotent 都写入证据，原始比较未被删除。`tests/property.mjs:72–85` 所有四根均使用它。P3/P4 未改。
- `tests/property-request-domain.mjs:1–17` 按 Responses session/header 合并规则预检 Headers 的真实可接受域，不硬编码 Unicode case 名；none retention、有效 header 覆盖与其他协议不误判。`tests/property.mjs:74–79` 还要求观察到 ByteString 拒绝，否则报预测不匹配；匹配也仍记 finding。未截断/篡改测试输入。
- `tests/property-request-projection.test.mjs` 为23个原反例分别验证独立合成期待与原 rawDiffs，并注入错误 model 证明真实漂移仍会被拒绝；另有1个定义域测试覆盖 Unicode、cacheRetention=none、显式header覆盖、其他协议与正常session。
- `tests/property-report.mjs` 同步数学定义、原始幂等计数和定义域说明；自动生成 `docs/design/mock-llm-server/property-tests.md`，原203分母未减少。
- 冻结定义同步：`irreversibility-atlas.md:29` G5/Q-COMPOSE；四根api第4节的Q-COMPOSE：`api/openai-completions.md:109`、`api/openai-responses.md:160`、`api/anthropic-messages.md:140`、`api/google-generative-ai.md:107`；`api/family-variants.md` 第5节与atlas导言记录F4统一接线。并行O18线的相邻修订已保留，未覆盖。

## 4. 复跑与实际非绿

| 检查 | 结果 | 证据 |
|---|---|---|
| cargo build --bin mock-llm-server | exit0 | tests/f4-p1-cargo-build.log |
| cargo test --lib（初跑） | exit101，130/131；并行slot fixture缺api-key | tests/f4-p1-cargo-test.log |
| cargo test --lib（30秒等待后） | exit0，131/131 | tests/f4-p1-cargo-test-rerun.log |
| 定向Node单测（含新24案） | exit0，56/56 | tests/f4-p1-node-unit.log |
| node --test tests/*.test.mjs（首次全套） | exit0，86/86 | tests/f4-p1-node-all.log |
| node --test tests/*.test.mjs（补跑） | exit1，85/86；本地测试服务未启动，环境finding | tests/f4-p1-node-final.log |
| node --test --test-concurrency=1 tests/*.test.mjs（再等30秒） | exit0，86/86 | tests/f4-p1-node-serial.log |
| node --check（本线六个mjs） | exit0 | tests/f4-p1-validation.json |
| node tests/w08-wire-checks.mjs（终轮） | exit0，74/74；原六案绿 | tests/f4-p1-wire-final.log、tests/w08-wire-results.json |
| node tests/property.mjs（完整四根静止终轮） | exit1，1110/1238，128 findings；输入/环境无漂移 | tests/f4-p1-property-stable.log、tests/property-results.json |

| 性质 | 通过/总数 | 未绿解释 |
|---|---:|---|
| P1 | 202/203 | 1个expected-rejection/domain finding；23个原非幂等保留raw证据，合成期待通过 |
| P2 | 122/223 | 101个既存/并行线回复帧不动点或域finding，不在本线修复范围 |
| P3 | 202/203 | 1个首次Unicode session拒绝，按原规则保留 |
| P4 | 584/609 | 25个projection/stability/domain finding，按原规则保留 |

P1逐根：OCC 51/51、Responses 50/51、Anthropic 50/50、Google 51/51。P2相较历史114通过变为122通过由并行回复线改变，**不归功于本线P1/F4改动**。

四次完整property运行均完成，结果一致（P1=202/203）。前三次受并行线程同步O18定义与两份不被property导入的单测影响；差异仅文档/单测，未发生受监测生产源码或二进制漂移，记录保存在 tests/f4-p1-validation.json。再次等待30秒后第四轮取得**静止快照：changedInputs=[]、changedEnvironment=[]**，终轮完整哈希与差异数组保存在property-results.json。运行中的失败始终按finding记录，未重试为成功。

## 5. 文件归属、风险与验收

本线生产改动仅 `src/mounts/protocol.rs`。本线测试/定义改动及证据文件清单在 `tests/f4-p1-validation.json`；工作区其他生产/文档变动属于并行实施，不回滚、不声称由本线完成。

剩余风险：Codex zstd/WS未验证；原字面幂等不成立是已声明定义边界；Unicode域finding及P2/P3/P4其余finding未改成通过；独立review gate尚需parent/reviewer执行。

`git status --short` 返回128：当前目录及祖先无Git元数据。本线未执行git add/stage/commit，**不能认证no-staged-files=true**；验收结构明确记false（不可验证），不伪造index证据。

下一步：reviewer独立复查统一出口、逐例表及静止终轮JSON；本报告不代替独立review gate。

## 结构化验收报告

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "Only production change is shared Api::encode Codex dispatch; 24 P1 cases classified and approved Q-COMPOSE implemented without decoder changes."
    },
    {
      "id": "criterion-2",
      "status": "not-satisfied",
      "evidence": "Full report, per-case JSON, static final run and passing regression evidence supplied; no-staged-files cannot be independently certified because Git metadata is absent; independent reviewer gate pending."
    }
  ],
  "changedFiles": [
    "src/mounts/protocol.rs",
    "tests/property.mjs",
    "tests/property-report.mjs",
    "tests/property-request-domain.mjs",
    "tests/property-request-projection.mjs",
    "tests/property-request-projection.test.mjs",
    "tests/w08-wire-checks.mjs",
    "docs/design/mock-llm-server/irreversibility-atlas.md",
    "docs/design/mock-llm-server/api/openai-completions.md",
    "docs/design/mock-llm-server/api/openai-responses.md",
    "docs/design/mock-llm-server/api/anthropic-messages.md",
    "docs/design/mock-llm-server/api/google-generative-ai.md",
    "docs/design/mock-llm-server/api/family-variants.md",
    "docs/design/mock-llm-server/property-tests.md",
    "docs/design/mock-llm-server/f4-p1-resolution.md",
    "tests/property-p1-counterexamples.json",
    "tests/f4-p1-readonly-hashes.json",
    "tests/property-results.json",
    "tests/w08-wire-results.json",
    "tests/f4-p1-validation.json",
    "tests/f4-p1-cargo-build.log",
    "tests/f4-p1-cargo-test-rerun.log",
    "tests/f4-p1-cargo-test.log",
    "tests/f4-p1-node-all.log",
    "tests/f4-p1-node-final.log",
    "tests/f4-p1-node-serial.log",
    "tests/f4-p1-node-unit.log",
    "tests/f4-p1-property-final.log",
    "tests/f4-p1-property-rerun.log",
    "tests/f4-p1-property-stable.log",
    "tests/f4-p1-property.log",
    "tests/f4-p1-wire-final.log",
    "tests/f4-p1-wire.log"
  ],
  "testsAddedOrUpdated": [
    "tests/property-request-projection.test.mjs",
    "tests/w08-wire-checks.mjs",
    "tests/property.mjs"
  ],
  "commandsRun": [
    {
      "command": "cargo build --bin mock-llm-server",
      "result": "passed",
      "summary": "exit0; tests/f4-p1-cargo-build.log"
    },
    {
      "command": "cargo test --lib (initial)",
      "result": "failed",
      "summary": "130/131; concurrent Azure fixture lacked api-key; preserved log"
    },
    {
      "command": "cargo test --lib (after 30s)",
      "result": "passed",
      "summary": "131/131; tests/f4-p1-cargo-test-rerun.log"
    },
    {
      "command": "node --test tests/property-request-projection.test.mjs tests/property.test.mjs tests/canonical-frozen-request.test.mjs tests/canonical-frozen-reply.test.mjs tests/w08-oracles.test.mjs",
      "result": "passed",
      "summary": "56/56"
    },
    {
      "command": "node --test tests/*.test.mjs (first complete run)",
      "result": "passed",
      "summary": "86/86; tests/f4-p1-node-all.log"
    },
    {
      "command": "node --test tests/*.test.mjs (later run)",
      "result": "failed",
      "summary": "85/86; local test server startup failure; tests/f4-p1-node-final.log"
    },
    {
      "command": "node --test --test-concurrency=1 tests/*.test.mjs (after 30s)",
      "result": "passed",
      "summary": "86/86; tests/f4-p1-node-serial.log"
    },
    {
      "command": "node --check (six changed mjs files)",
      "result": "passed",
      "summary": "property.mjs, property-report.mjs, property-request-domain.mjs, property-request-projection.mjs, property-request-projection.test.mjs, w08-wire-checks.mjs"
    },
    {
      "command": "node tests/w08-wire-checks.mjs",
      "result": "passed",
      "summary": "74/74; original six F4 cases green"
    },
    {
      "command": "node tests/property.mjs (four complete runs; last after 30s)",
      "result": "failed",
      "summary": "all completed; final1110/1238,128findings; P1=202/203; final changedInputs=[] changedEnvironment=[]"
    },
    {
      "command": "SHA-256 compare readonly pi tree and inventory",
      "result": "passed",
      "summary": "243/243 unchanged; no added or deleted files"
    },
    {
      "command": "git status --short",
      "result": "failed",
      "summary": "exit128; no .git metadata; staging state cannot be certified"
    },
    {
      "command": "evidence assertions and changed-source LOC check",
      "result": "passed",
      "summary": "all24 closed classifications; P1 raw179 true/23 false/1 domain; wire74 pass; changed code files<=200 lines"
    }
  ],
  "validationOutput": [
    "Rust131/131; Node serial86/86; wire74/74",
    "P1 202/203; raw179/203 unchanged; 23pi non-idempotent,1expected-rejection domain finding",
    "Full property1110/1238 with128findings; final no input/environment drift",
    "243 readonly pi files unchanged"
  ],
  "residualRisks": [
    "Codex SDK zstd/WS not validated",
    "P1 domain finding and P2/P3/P4 findings intentionally retained",
    "No Git index evidence; no add/stage/commit executed",
    "Independent reviewer gate pending"
  ],
  "noStagedFiles": false,
  "diffSummary": "Shared Codex encoder dispatch; unified P1 second-projection oracle and header-domain check; raw counterexamples retained; synchronized atlas/API definitions and full rerun artifacts.",
  "reviewFindings": [
    "No decoder residue found among the24cases; independent reviewer gate still required"
  ],
  "manualNotes": "noStagedFiles=false means unverifiable, not observed staged content. Shared atlas/API files also contain other workers changes; this worker did not revert them."
}
```
