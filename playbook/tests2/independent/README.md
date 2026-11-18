# Independent next-playbook contract tests

This directory is contract-first material derived from `../request.md` and the frozen `PLAYBOOK_ROOT/docs/next-language/` spec. It never edits the implementation or calls a real provider API.

## Commands

Independent oracle only:

```sh
npm test
```

Generic static compile IR:

```sh
PLAYBOOK_ROOT=/Users/ssyram/workspace/ai-tools/mock-with-pi/playbook npm run test:api
```

Real local runtime/cache target:

```sh
PLAYBOOK_ROOT=/Users/ssyram/workspace/ai-tools/mock-with-pi/playbook npm run test:target
```

Existing representative real Pi duality:

```sh
PLAYBOOK_ROOT=/Users/ssyram/workspace/ai-tools/mock-with-pi/playbook \
MOCK_SERVER_BIN=/Users/ssyram/workspace/ai-tools/mock-with-pi/target/debug/mock-llm-server \
npm run test:pi
```

## Static compile contract

`mock2.mjs --compile-observations <file>` must return the same generic native shape for every file:

```json
{
  "accepted": true,
  "ir": {
    "schemaVersion": 1,
    "root": "/absolute/root.md",
    "units": [
      {
        "path": "/absolute/unit.md",
        "front": {"params": {}, "vars": {}},
        "blocks": [],
        "groups": [],
        "labels": {}
      }
    ]
  }
}
```

Failure shape:

```json
{"accepted":false,"error":{"class":"playbook_invalid","message":"..."}}
```

`oracle/project-static-ir.mjs` is a test-side projection only. It derives structural facts from native blocks/groups/labels:

- block order and kinds;
- Response boundaries, say presence/text, call tools/params;
- explicit versus default result prediction;
- static affine holder counts;
- labels and responseStart/resultEntry positions;
- import/goto/program declarations;
- refs, save maps, cases and matcher order.

Static expected data lives in `contract/expected-static-ir.json`. It contains no counter transitions, script return templates, runtime call counts, fresh-frame/EOF claims, cache deltas, volatile execution counts, or compaction recovery claims.

The API test also:

- compiles every positive and compile-negative fixture without creating files;
- checks unknown-with diagnostics name the actual parameter and never contain `not defined`;
- covers unknown `pass.to` from internal and segment cases;
- copies fixtures to an artifact directory, renames several roots, and requires the complete path-neutral IR projection to remain identical.

The retired mixed static/dynamic file remains only under `contract/retired/` for provenance.

## Dynamic evidence mapping

`contract/static-dynamic-obligation-map.json` maps each original obligation to either static IR evidence or a real runtime/cache/Pi case. Runtime obligations are not deleted when removed from compile expected.

Actual runtime coverage includes structured whole-value refs, recursive EOF return, imported/mid-file system matching, reader continuation isolation, ordered first-match, frame-local counter loops, segment run/skip aggregation, result-entry history guards, and program/budget errors.

`match compaction` remains a real target case using `judge:`; it must classify the explicit compaction marker rather than fall through to ordinary, and it must not reconstruct absent history.

## Cache regressions

ReferencePrefixCache tests remain oracle-only. Product coverage invokes real `mock2.mjs`, `cache.mjs`, `cache-space.mjs`, leases, and cleanup worker behavior.

- shared hot continuation versus no-cache cold rebuild;
- system/tools/request.options changes force cold namespace;
- copied external program content change invalidates cache;
- volatile observation does not become business state;
- exact 300000ms idle boundary;
- two live requestId leases protect one key independently beyond TTL;
- releasing one request leaves the second protective;
- `scheduleCleanup` uses the real detached worker and repeated scheduling is single-flight.

Generated dependency fixtures/programs live only under each artifact run; shared source fixtures are not modified.

## Real request replay

The Pi job replays complete raw provider captures, preserving each request's own system/tools/options/compaction/messages. Individual partial-tool event prefixes are classified as waiting; an actual early provider request expects `playbook_state`.

Pi session JSONL supplies business history only. Expected-next comes from both the independent scenario and the next actual Pi assistant. Mutations alter raw text, args, IDs, and result-sensitive output; project tool side effects must remain unchanged. External observation logs are excluded because they are not exactly-once state.

The separate `node playbook/tests2/independent/jobs/run-full-showcase-pi.mjs` job runs five two-turn full-showcase cases plus an invalid first input. `oracle/pi-frontiers.mjs` accepts session/captures/expected independently of the job; `jobs/check-pi-captures.mjs --session FILE --captures DIR --case exact-fix` is an explicit offline checker and does not perform replay. Partial histories cannot pass as complete. See `playbook/docs/next-language/subplans/pb-2-pi-duality-suite.md` for the detailed expectations and the observed real-Pi cache-hit gap.

## Isolation

Compile/target/Pi artifacts default to unique directories below the repository `target/test-artifacts/`; `PLAYBOOK_INDEPENDENT_ARTIFACTS` and `PLAYBOOK_PI_ARTIFACTS` can select other owned test directories. The complete suite entry uses separate HOME, config, cache, temp, sessions and workspace directories under `target/`, strips inherited provider credentials, and uses finite subprocess timeouts. It never touches tmux.
