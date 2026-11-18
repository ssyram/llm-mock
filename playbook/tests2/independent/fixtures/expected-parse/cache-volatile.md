# Prefix cache and volatile barrier

```user
- exact: begin
```

```segment
command: node ../programs/deterministic-probe.mjs
with:
  observationFile: cold-hot.json
cases:
  - otherwise: true
```

```segment
command: node ../programs/volatile-probe.mjs
with:
  observationFile: volatile-count.json
volatile: true
cases:
  - otherwise: true
```

```say
volatile probe
```

```call bash
command: printf volatile
```

```toolResult
- otherwise: true
```

```say
finished
```
