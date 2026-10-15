# LLM Mock (with Pi-Message)

**[中文版](README.zh-CN.md)**

**A stable, reliable, trustworthy LLM mock server: every manipulation only deals with the [pi-ai](https://github.com/earendil-works/pi) unified Message format — all vendor-protocol translation is handled by the server.**

Any harness speaking a native vendor protocol connects by simply pointing its baseURL at the server. Requests are decoded into the unified Message, handed to your mock script, and the script's output is encoded back into the same protocol — **every script you write faces exactly one format yet serves 10 protocols, and no real model credentials are ever needed.**

## Why trust it

- **Stable** — pinned to a locked pi-ai reference; every field-level conversion is backed by frozen specs (`docs/design/mock-llm-server/`: the irreversibility atlas + per-protocol specs). Upgrading = pin the new version, rerun the matrix; every difference is mechanically decidable.
- **Proven** — historical private-corpus duality matrix: 824 green cases + 16,000 fuzz executions with zero crashes + live harness verification (pi and OpenCode). Private captures are not distributed; public runs explicitly skip unavailable corpus sessions and still run synthetic cases.
- **Honest** — losses are declared, never hidden: irreversible fields are itemized (e.g. timestamps never hit the wire, cross-protocol signatures degrade deterministically), and the test suite never fudges.

## Core idea

pi-ai already does all the dirty work of "unified Message ⇄ vendor wire" on the client side. This repo implements its **dual** (server side), with correctness guaranteed by duality testing: `decode(convert(C)) ≡ canonical(C)` and `parse(encode(A)) ≡ providerFill(A)` (oracle = the locked pi-ai adapters).

> 🚀 **Start here**: [hands-on-tutorial.md](docs/design/mock-llm-server/hands-on-tutorial.md) — a full walkthrough from zero to multi-turn / tool round-trips / error paths, with real commands and outputs (validated by a fresh-user blind test).

## Supported protocols (all available on every mount)

| Family | harness-side baseURL | Notes |
|---|---|---|
| OpenAI Chat Completions | `http://127.0.0.1:18000/<name>/v1` | the generic format of 27+ compatible providers |
| OpenAI Responses | same `/v1` | |
| Anthropic Messages | `http://127.0.0.1:18000/<name>` | |
| Google Generative AI | `http://127.0.0.1:18000/<name>/v1beta` | |
| pi-messages | `http://127.0.0.1:18000/<name>` | |
| azure / codex / vertex / bedrock / mistral | see `docs/design/mock-llm-server/mount-routing.md` | bedrock uses binary EventStream |

## Runtime dependencies

- No new top-level runtime cargo dependencies; Codex WebSocket only enables the existing axum `ws` feature (`Cargo.lock` records that feature's transitive entries).
- The `zstd` CLI is an optional system dependency, needed only to receive `Content-Encoding: zstd` requests (the locked pi-ai Codex HTTP/SSE path prefers compression). The server probes `which zstd` and decompresses via a process pipe. Install guide: <https://facebook.github.io/zstd/>. Missing/corrupt/oversized bodies return a protocol-shaped 400; uncompressed HTTP and WebSocket never need it.
- Vertex local ADC does not need real cloud credentials: tests can generate a throwaway RSA service-account file with `universe_domain: "mock.invalid"`, use `GOOGLE_APPLICATION_CREDENTIALS` plus project/location and a local baseUrl; the SDK signs a JWT locally and the server only reads the KeyID without verifying. See `docs/design/mock-llm-server/transport-unblock.md`. Never use test credentials against real cloud services.

## Quick start

```sh
cargo build

# 1. Start the resident server (mounts persist to mounts.json, restored on restart)
./target/debug/mock-llm-server --port 18000 --capture-dir captures

# 2. Mount a script (get its dedicated URL; --optionally pin a dedicated port
#    as a fallback for SDKs that strip path prefixes)
./target/debug/mock-llm-server add scripts/mock-scripts/round-counter.mjs --name demo
#   script `demo` added, visitable at http://127.0.0.1:18000/demo

# 3. Point any harness at it (OpenCode / pi / any compatible SDK)
#    provider.baseURL = http://127.0.0.1:18000/demo/v1   apiKey: anything

# 4. Manage
./target/debug/mock-llm-server list      # name + url + command
./target/debug/mock-llm-server remove demo
```

Behavior contract: the `/<name>/…` path prefix binds directly to one script; unknown mounts return 404. Mount routes (including dedicated ports) require no authentication — the KeyID is an optional script input (empty string by default); the `401 missing_key` response applies only to legacy registry routes. `--capture-dir` persists every decoded unified request (`req-NNNNNN-<api>.json`) for debugging and duality testing. Mistral and OpenAI share a path and are disambiguated by request shape, or pinned explicitly per mount. `v1`, `v1beta`, `openai`, `__admin`, etc. are reserved names.

## Writing mock scripts

A script is any executable (node/python/shell…) invoked as a **fresh process per request** — keep no in-process state; derive continuity from the transcript.

**Input** (stdin, one JSON object):

```json
{
  "api": "openai-completions",
  "keyId": "whatever-harness-sent",
  "model": "demo-model",
  "sessionSignal": null,
  "request": {
    "model": "demo-model",
    "context": { "messages": [ /* unified Messages */ ] },
    "options": { "maxTokens": 64, "temperature": 0.5 }
  }
}
```

**Output** (stdout, one JSON object — exactly one of):

```json
// Normal reply: AssistantMessage (camelCase; all usage fields required)
{ "content": [ { "type": "text", "text": "hello" } ],
  "api": "openai-completions", "provider": "demo", "model": "demo-model",
  "usage": { "input": 1, "output": 1, "cacheRead": 0, "cacheWrite": 0, "totalTokens": 2,
             "cost": { "input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0, "total": 0 } },
  "stopReason": "stop", "timestamp": 0 }

// Error path (protocol-visible error)
{ "error": { "status": 429, "code": "rate_limited", "message": "boom" } }
```

**Unified Message shape**: `role` ∈ `system|user|assistant|toolResult`; user content is a string or an array of `[{type:"text",text}|{type:"image",data,mimeType}]` blocks; assistant content is `text|thinking|toolCall` blocks (toolCall: `{type:"toolCall",id,name,arguments}`); toolResult carries `toolCallId/toolName/content/isError`. Full definitions: `src/model/` (field-for-field aligned with pi-ai JSON).

**Techniques** (canonical example: `scripts/mock-scripts/round-counter.mjs`):

1. **Stateless multi-turn**: `round = count of assistant messages + 1` — harnesses resend the full transcript each turn, so round information rides on the wire for free.
2. **Tool round-trips**: return a `toolCall` block on round 1 (`stopReason:"toolUse"`); the harness really executes the tool and feeds back a `toolResult`; finish with text on round ≥2. The script never cares about the protocol — the encoder shapes the toolCall per vendor.
3. **Reading user input**: take the last user message; handle both string and block-array content.
4. **Protocol branching**: `input.api` is available if you need it (usually unnecessary — unified content works for all).
5. **Testing error paths**: emit `{"error":{...}}` instead of exiting non-zero; stderr is for humans only.
6. **Determinism**: same input, same output — that's what makes tests repeatable.

## Testing & corpus

- `cargo test`: per-protocol unit tests
- `tests/`: the duality harness — synthetic cases plus optional private corpus, all protocols × both directions, deep-compared (plus fuzz and property suites). `node tests/duality.mjs` reports missing private sessions as explicit skips; `node tests/fuzz.mjs` uses synthetic data only. Node ≥23 and the locked sibling `../pi-mono/packages/ai` checkout with its dependencies are required by `tests/pi-ai-imports.mjs`.
- Corpus capture plugin `extensions/llm-corpus-capture.ts`: mount into a real session to capture unified-Message corpus (only corpus collection needs real model credentials; the mock itself never does)

## Layout

`src/model` unified types · `src/api/<api>` per-protocol dual modules · `src/mounts` mount routing · `scripts/mock-scripts` script examples · `docs/design/mock-llm-server` specs, run reports and ledgers · `tests` duality & fuzz

## Notes

Corpus/capture directories (`.pi/mock-corpus`, `.tmp-*`, `captures`) and private generated evidence are excluded by `.gitignore`; never force-add them. Published historical reports use anonymized paths, identifiers and synthetic content where needed; see [release sanitization audit](docs/design/mock-llm-server/release-sanitize.md). Locked reference: local pi-mono `packages/ai` @1.2.0; upgrades require rerunning the full duality matrix.
