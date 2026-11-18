# Skip an ordinary segment, then emit the same complete batch and aggregate

```user
- exact: skip
  pass:
    to: BATCH
- exact: run
```

```segment
command: node ../programs/segment-decision.mjs
with:
  mode: continue
  observationFile: segment-run.json
cases:
  - otherwise: true
```

```say
$label: BATCH
batch
```

```call bash
command: printf left
```

```toolResult
- otherwise: true
```

```call bash
command: printf right
```

```toolResult
- otherwise: true
```

```aggregation
command: node ../programs/aggregate-results.mjs
cases:
  - exact: complete
    pass:
      to: COMPLETE
```

```say
$label: COMPLETE
finished
```
