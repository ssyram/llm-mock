# Deterministic observation under an explicit shared-cache continuation

```user
- exact: begin
```

```segment
command: node ../programs/deterministic-probe.mjs
with:
  observationFile: cache-hit-count.json
cases:
  - otherwise: true
```

```say
cache probe
```

```call bash
command: printf cache
```

```toolResult
- otherwise: true
```

```say
finished
```
