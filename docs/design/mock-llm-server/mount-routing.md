# Mount routing — implementation and verification

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## Contract

D3 mount semantics: a name binds directly to a shell script. Main listener URLs are `http://127.0.0.1:18000/{name}`; legacy root routes and `/__admin/entries` retain KeyID/matcher behavior. Mounted scripts receive the existing `{api,keyId,model,sessionSignal,request}` JSON on stdin and return AssistantMessage or `{error:{status,code,message}}`. KeyID is optional on mounts, not a selector; all scenario/state behavior remains in the script. Mounted routes (both path-prefix and dedicated-port URLs) do not require authentication: KeyID is only optional script input and defaults to an empty string. Missing-credential `401 missing_key` applies only to legacy registry routes, not mounted routes. 挂载路由不要求认证，KeyID 仅作脚本可选输入；缺凭据的 401 仅用于 legacy registry 路由。

- `POST /__admin/scripts`: `{name,command,port?,protocols?,prefer?}` → 201 `{name,command,protocols?,prefer?,port,url,port_url}`.
- `GET /__admin/scripts`: 200 `{scripts:[...]}` with name, command, URLs and runtime port.
- `DELETE /__admin/scripts/{name}`: 200 `{removed:name}`, absent name → 404.
- Duplicate name → 409; empty command, port 0, unsafe/reserved name or invalid protocol configuration → 400; fixed port conflict → 409; persistence failure → 500 without changing the table.
- Names: nonempty ASCII alphanumeric, `_`, `-`; reserved: `v1`, `v1beta`, `openai`, `codex`, `__admin`, `messages`, `model`, `models`, `chat`, `responses`, `projects`, `publishers`, `backend-api`.
- `url` is the primary path-prefix URL; `port_url` is the optional dedicated root URL. `--port-base N` allocates the first free loopback port at or above N; explicit `port` also works without port-base. Delete aborts and awaits the listener task to release its listening socket.

## Routes and protocol selection

After removing `/{name}`, `/v1/chat/completions` and `/chat/completions` use OpenAI completions; `/(v1/)responses` uses Responses; `/v1/messages` uses Anthropic; `/messages` uses pi-messages; `/v1beta/...` uses Google; `/openai/v1/responses` uses Azure; `/codex/responses` and `/backend-api/codex/responses` use Codex. Vertex uses `/v1[beta]/.../publishers/{publisher}/models/...`; publisher is not restricted to Google. Query strings are retained. Missing mounts and unsupported protocol paths return 404, without consulting legacy registry entries. Dedicated ports use the same protocol paths without a name prefix and expose no admin API.

Completions-path-only ambiguity policy (approved): optional `prefer` is `openai-completions` or `mistral-conversations`, and overrides heuristics. Optional `protocols` is an allowed API list; a single allowed member of those two pins completions selection. If both/neither are specified, `prompt_mode`, `x-affinity`, or a `thinking` message content block selects Mistral; otherwise OpenAI. No model-name sniffing and no global body sniffing. On Responses-family generic paths, an `api-key` header selects Azure. Bedrock uses its separate legacy root `/model/{id}/converse-stream` binary transport, outside this generic mount API list.

Supported protocol identifiers: `openai-completions`, `openai-responses`, `anthropic-messages`, `google-generative-ai`, `google-vertex`, `mistral-conversations`, `azure-openai-responses`, `openai-codex-responses`, `pi-messages`. Nonempty `protocols` also restricts enabled APIs; `prefer` must be included when a restriction is supplied.

## Persistence and CLI

Default listener port is now 18000; `--port` remains supported. Default mount file is `./mounts.json`; override with `--mounts-file PATH`. Startup loads it, missing file means no mounts, malformed/unreadable configuration fails startup. Add/remove synchronously write and sync a temporary JSON file before rename; failed persistence leaves the in-memory table unchanged. Plain entries remain `{ "name": "shell command or absolute script path" }`; configured entries are `{ "name": {"command":"...","protocols":["mistral-conversations"],"prefer":"mistral-conversations"} }`. Fixed/runtime ports are not persisted; restart allocates according to current port-base. Registrations are unique, not replacements.

```sh
mock-llm-server --port 18000 --port-base 18100 --mounts-file ./mounts.json
mock-llm-server add 'python3 /absolute/path/reply.py' --name scenario
mock-llm-server add '/absolute/path/mistral-script' --name mistral --port 18200 --protocols mistral-conversations --prefer mistral-conversations
mock-llm-server list --server-url http://127.0.0.1:18000
mock-llm-server remove scenario
```

CLI subcommands contact a running local instance, never start one. `--server-url` defaults to `http://127.0.0.1:18000`, supports HTTP host:port (also bare host:port), and belongs after the subcommand. CLI prints admin JSON; non-2xx responses exit nonzero. Scripts/admin are trusted local code, not an authenticated remote service.

## Historical verification record — not the current test count (2000-01-01 UTC)

### Checks

- `cargo check`: exit 0.
- Final `cargo test`: exit 0, **89 passed, 0 failed**; 11 new mount/admin/routing tests in `src/mounts/{tests,routing_tests,admin_tests}.rs`. Existing 78 tests remain green. Coverage: names; duplicate/delete/load and configured JSON; port conflict/release/allocation/reuse; path-local explicit/automatic protocol selection; persistence failure without registration; CRUD errors; root compatibility; missing mount isolation; all requested path families including Vertex; KeyID/session passthrough and explicit Mistral; script `{error}` propagation.
- `cargo build`: exit 0; rebuilt final source before the second smoke run.
- `cargo clippy --all-targets`: exit 0; no warnings in changed files. Existing warnings: `src/model/message.rs:9` large enum variant, `src/api/google_generative_ai/encode_tests.rs:154` useless conversion. Those restricted files were not edited.
- `rustfmt --edition 2021 --config skip_children=true src/main.rs src/server.rs src/mounts/*.rs`: exit 0. `src/lib.rs` retains its original declarations in order, with `pub mod mounts;` appended.
- A Python source-line check verified every changed/new source file has at most 200 nonblank, noncomment lines.
- `git status --short`: exit 128, “not a git repository”. There is no project `.git` or Git index; no staging/commit operation was performed.

### Smoke 1: CLI + actual curl + dedicated port + restart

A Python subprocess harness started the compiled binary with `--port 19080 --port-base 19100 --mounts-file target/mount-smoke.json`, invoked real CLI subcommands and actual `curl -sS --max-time 5 -w '\n%{http_code}'`, and asserted their outputs. Registered command: Python reads JSON stdin, asserts exactly `{api,keyId,model,sessionSignal,request}`, then emits a zero-usage AssistantMessage whose text is `mounted-smoke|{api}|{keyId}|{sessionSignal}`. The request was `{"model":"test-model","messages":[{"role":"user","content":"hi"}],"stream":true}`, with `Authorization: Bearer smoke-key` and `x-session-id: smoke-session`.

Observed output:

```text
CLI ADD: {"name":"smoke","port":19100,"url":"http://127.0.0.1:19080/smoke","port_url":"http://127.0.0.1:19100"}
CURL PREFIX: 200 script output + [DONE] verified
CURL DEDICATED: 200 script output verified
CLI LIST: 1 mount; name+url+command verified
RESTART: 200 persisted command reloaded
CLI REMOVE: {"removed":"smoke"}
CURL AFTER REMOVE: 404 {"error":{"code":"mount_not_found","message":"unknown mount"}}
PORT RELEASE: bind 19100 succeeded
PERSISTENCE AFTER REMOVE: {}
```

Curl paths were `/smoke/v1/chat/completions` on 19080 and `/v1/chat/completions` on 19100. Exact script output `mounted-smoke|openai-completions|smoke-key|smoke-session` and `[DONE]` were asserted. Before deletion the process was terminated and restarted using the same file; the mounted request succeeded again. After deletion a new socket bound 19100 successfully. Harness terminated the server and removed the temporary mount JSON.

### Smoke 2: final rebuilt binary, pure curl CRUD sequence

Started with `--port 19081 --mounts-file target/mount-admin-smoke.json`. Actual curl POST to `/__admin/scripts` registered `curl` with a shell command that drains stdin and prints an AssistantMessage containing text `curl-final-smoke`. Curl POST to `/curl/v1/chat/completions` used `{"model":"test","messages":[{"role":"user","content":"hello"}],"stream":true}`, without any auth header. Curl DELETE removed it; the next protocol POST returned 404. A reserved-name registration and real CLI `--protocols/--prefer` persistence were also checked.

```text
CURL ADMIN ADD: 201 http://127.0.0.1:19081/curl
CURL COMPLETIONS: 200 curl-final-smoke and [DONE] verified
CURL RESERVED NAME: 400
CURL REMOVE: 200 {"removed":"curl"}
CURL AFTER REMOVE: 404 {"error":{"code":"mount_not_found","message":"unknown mount"}}
CLI PINNED PERSISTENCE: protocols+prefer verified
```

The pinned CLI invocation used `add <same registered command> --name pinned --protocols mistral-conversations --prefer mistral-conversations --server-url http://127.0.0.1:19081`. The actual file was parsed and asserted to contain the preference; CLI remove deleted it. Server and temporary file were cleaned up.

### Findings and corrections during implementation

- First runs failed on test fixtures (Responses `input` must be an array) and parallel socket/process-test interference. Socket tests passed in isolation; final tests serialize socket operations and script subprocess launches with a lock outside the test runtime. All final tests pass; initial failures were not hidden or weakened.
- Responses/Anthropic/Azure decoders require auth headers even when mount selection does not. Mounted requests supply empty decoder-only credentials as needed; scripts still receive the original empty KeyID. Root credentials are not synthesized.
- Existing `Reply::Script` `{error}` code incorrectly inferred AssistantMessage deserialization. `src/registry/mod.rs` now explicitly deserializes MockError and returns it as an error; the mounted 429 regression test passes.

## Changed files and review boundaries

- `src/server.rs`: shared state/router and request processing; mount scripts bypass matcher but use the same executor and encoders.
- `src/main.rs`: server options/load and CLI subcommand entry point; default port 18000.
- `src/lib.rs`: only appended the mounts module declaration.
- `src/registry/mod.rs`: narrow script-error deserialization correction.
- `src/mounts/mod.rs`, `admin.rs`, `entry_admin.rs`, `cli.rs`, `config.rs`, `table.rs`, `protocol.rs`, `selection.rs`, `routing.rs`, `transport.rs`: focused new modules; legacy entry admin handlers moved without changing their contract.
- `src/mounts/tests.rs`, `routing_tests.rs`, `admin_tests.rs`, `request_fixture.rs`, `script_fixture.rs`: in-source tests and test fixtures, not top-level `tests/` edits.
- `README.md` and this document: updated mount contract and verification evidence.
- No edits to `src/api/**`, `src/model/**`, top-level `tests/**`, `scripts/**`, Cargo.toml or Cargo.lock.

## Residual risks and acceptance handoff

- The historical routing-only run below did not include Bedrock. Current Bedrock binary root transport is wired; it is not part of generic mounts. Current automated runs are separate from this historical record.
- Marker-free OpenAI/Mistral shared-path requests are inherently ambiguous: default OpenAI, explicit mount preference recommended.
- Persistence stores commands/protocol choices, not fixed ports. File contents are synced before atomic rename; directory metadata is not fsynced, and concurrent instances must not share the same mounts file.
- Deletion prevents new selection and releases the listener; an already-selected/in-flight script may finish. No script timeout/sandbox was added; commands remain trusted local shell code using the existing executor.
- CLI supports plain HTTP host:port, not TLS or URL path prefixes. Server/admin bind loopback only.
- Independent reviewer gate is required; implementation checks above are evidence, not a claim that independent review has completed.
