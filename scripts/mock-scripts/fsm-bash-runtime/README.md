# FSM Bash-runtime mock scenarios

This directory contains a stateless mock model script and direct tests for the FSM Bash-runtime host-hook boundary. It does **not** implement or prove FSM behavior. The FSM feature is still a spike; all product-phase outcomes below are runner assertions, not claims made by this mock.

## Wire contract and tool-name discovery

The mock server starts a script as a fresh process for each request. Stdin is one JSON object shaped like the existing `round-counter.mjs` input: `{api, keyId, model, sessionSignal, request}`. The transcript is at `request.context.messages`.

The scenario script returns the mock server's unified `AssistantMessage` for both CC and OC mounts. The reply carries `api`, `provider`, `model`, `content`, complete `usage`/`cost`, `stopReason`, and `timestamp`; it does no vendor-specific encoding. `openai_completions` decodes wire `tools[].function.{name,description,parameters}` into `SystemMessage.toolsAdded`; pi-messages sends `context.messages` directly, with declarations in `system.toolsAdded`. See `src/api/openai_completions/vendor.rs`, `src/api/openai_completions/decode.rs`, `src/model/message.rs`, `src/model/tool.rs`, and `docs/design/mock-llm-server/api/pi-messages.md`.

For Bash scenarios, the script discovers a tool only when exactly one `system.toolsAdded[]` schema has a string `parameters.properties.command`. It uses that declaration's actual `name`; it does not assume `Bash`, `bash`, or any vendor name. If discovery is missing or ambiguous, pass `--tool-name=<name observed in the request>` explicitly. For the `non-bash` scenario, supply both `--tool-name=<observed non-Bash name>` and `--arguments-json=<fixture object>`; neither name nor arguments are guessed. `--arguments-json` is cloned into each call and only the scenario's `command` property is replaced for Bash scenarios.

## Scenario design and per-turn behavior

Every call ID is deterministic from the scenario and step. The script derives progress solely from the latest user turn's transcript, never process memory or a request counter. A returned Bash `toolCall` is a controlled fixture command; the mock does not execute it. On the next request, a matching `toolResult` closes that call. A tool error is reported as an observed result, not retried. `two-call-refresh` advances to its second, distinct call only after the first matching non-error `toolResult`; a missing/error result terminates rather than repeating the first call. The second matching result ends the scenario. Final text explicitly says it observed a tool result, not that a filesystem effect occurred.

| Scenario | Mock call(s) | Purpose and runner observation |
| --- | --- | --- |
| `rewrite-marker` | Writes `FSMBR_ORIGINAL_MARKER` to `fsmbr-original-marker.txt` | Host-hook seam: replace the original `command` with a different replacement marker. Runner must observe the wrapped/replaced command actually executes, the replacement marker exists, and the original marker does not. The original command is harmless and runs only in an isolated temp cwd when testing unchanged behavior. |
| `command-fidelity` | Multi-line command containing spaces, a single quote, literal `$()`, a pipe, and redirection | Host-hook seam: capture the original Bash arguments and prove only `command` changes, byte-for-byte preserving the whole `E` in `srt --settings <profile> -c <E>`. The mock constructs the string; no outer layer may execute or interpolate it first. Include a `cwd`, `timeout`, `description`, and arbitrary fixture fields in `--arguments-json`; the runner compares every non-command field unchanged. |
| `write-probe` | Writes `FSMBR_WRITE_PROBE` to `fsmbr-write-probe.txt` | Reuse the same call under an allow-write profile and a deny-write profile. Runner checks successful file creation for allow; for deny it checks refusal and absence of the file. Also reuse this controlled marker command for missing config (unchanged original behavior), malformed profile, and missing `srt`; the last two must fail closed with no naked execution and no marker. |
| `python-indirect-write` | Only `python3 fixture.py` | Runner preloads identical script bytes in two case directories. The script writes relative `protected/sample.txt`; allow must change existing bytes and denyWrite must preserve existing bytes with a Python runtime error. Both FSM authorization rules stay allow. |
| `network-allowed` | Real `curl` to `https://example.com:443/` | Runner requires actual HTTP success and response body through SRT with exactly `allowedDomains:["example.com:443"]`. |
| `network-denied` | Real `curl` to `https://example.org:443/` | Same network policy; runner requires explicit SRT network-allowlist denial, never ordinary DNS/TLS failure. |
| `non-bash` | Explicit tool name and fixture arguments; no Bash command is synthesized | Host-hook seam: runner confirms a non-Bash tool call is unchanged. It also checks an unconfigured Bash hook is unchanged using `rewrite-marker` or `write-probe`. |
| `two-call-refresh` | First writes `fsmbr-call-one.txt`; after its matching result, second writes `fsmbr-call-two.txt` | Deterministic two-invocation driver. Host-hook seam can change the profile fixture between calls and must observe fresh profile loading on each invocation. Current-state/actor selection and a state transition selecting a new profile are product-phase assertions; this mock supplies only the two calls and never simulates an FSM. |

### Minimal coverage matrix by phase

**Host-hook seam (spike-runner responsibilities):**

- Rewrite original marker to a distinct marker; check actual execution/file state and absence of the original marker.
- Preserve a command containing single quotes, spaces, `$()`, newline, pipe, and redirection exactly inside `srt --settings <profile> -c <E>`; do not execute it in the mock's outer layer. Verify `cwd`, `timeout`, `description`, and any extra fixture fields are unchanged.
- Run `write-probe` with profiles allowing and denying writes. Check runner exit/result and actual temp-cwd filesystem state, not AssistantMessage wording.
- With no Bash-runtime configuration, check the old direct-execution behavior is unchanged. With a malformed profile or missing `srt`, check rejection and absence of an original-marker side effect; never silently run raw `E`.
- Send `non-bash` and verify the hook does not modify it. For an unconfigured hook, verify the original Bash arguments remain unchanged.
- Use `two-call-refresh` to make two separate host invocations. The runner may replace the profile fixture between calls and must verify each invocation reloads it. Do not infer profile selection from the model reply.

**Product phase only (not implemented or run by this directory):**

- A target FSM that declares Bash-runtime in its initial state, with missing `srt`, must fail `enter`; runner confirms the target remains unentered, no subsequent Bash tool call occurs, and no enter side effect is observed.
- Repeat the missing-`srt` enter case when Bash-runtime is declared only in a non-initial state; it must still fail at enter.
- At `mcp-server-fsm register-skill <path>`, missing dependencies without `--force` must produce an error and must not create or overwrite a registration. With missing dependencies, `--force` permits registration with a warning while retaining its existing same-name overwrite behavior; it does not skip schema validation. A force-registered target must still fail `enter` when `srt` is missing.
- With dependencies installed, `register-skill` and `enter` succeed normally. With no Bash-runtime profile anywhere in the target FSM, no Bash-runtime dependency requirement applies.
- After real FSM state/actor changes, runner verifies the next Bash invocation selects the correct current profile and reloads it. `two-call-refresh` can provide calls but cannot assert that state change or profile choice.

The mock cannot decide or assert FSM state, registration/enter success, warning text, command execution, profile selection, or filesystem outcomes. Those are runner/product observations. Do not create a fake FSM state machine to make product-phase rows appear to pass. The exact dependency probe and how the runner observes register/enter side effects remain product-phase responsibilities.

## Mounting

After the host request schema has confirmed its actual Bash tool name (or when the request provides exactly one discoverable `command` schema), mount the same protocol-neutral script for either host. This follows the `mock-llm-server add "node <script> ..." --name <mount>` interface in the hands-on tutorial; no API key is used by the script.

```sh
./target/debug/mock-llm-server add "node <repo>/scripts/mock-scripts/fsm-bash-runtime/mock.mjs --scenario rewrite-marker" --name fsmbr
```

To pin the actual name found in a captured request, add `--tool-name <observed-name>` to the mounted command. For explicit pass-through fields, add `--arguments-json '<JSON object>'`, for example `--arguments-json '{"cwd":"/tmp/fsmbr-run","timeout":30,"description":"preserve me","fixtureTag":"host-hook"}'`. Use a fresh isolated temp cwd/profile per runner case. The CC/OC model endpoint can mount the same script; verify the selected key's generated request uses `openai_completions` or `pi-messages` as intended rather than assuming one from the host label.

## Direct tests and safety

Run the no-network, no-key tests with:

```sh
node --test scripts/mock-scripts/fsm-bash-runtime/tests/*.test.mjs
```

The original five scenarios and six tests are retained. The incremental real-product runner is `../mcp-server-fsm/experiments/bash_runtime/product_effects_e2e.py`; it reuses existing real product infrastructure, runs only smoke and these new cases, retains raw transcripts and performs identity-scoped cleanup. External network baseline failure is recorded as environment-blocked, not a sandbox PASS. Neither mock network scene opens a connection itself.

The tests use explicit stdin fixtures and a fresh OS temporary directory, and print the Node executable invocation before spawning it. They prove only stateless scenario progression and unified AssistantMessage JSON, not the hook or FSM product behavior. The script emits controlled commands as JSON and never shells out to execute a generated command.
