# Aggregation owns the sole successor

```user
- exact: begin
```

```say
batch
```

```call bash
command: printf left
```

```toolResult
- otherwise: true
  pass:
    to: LOCAL_TARGET
```

```aggregation
command: node ../programs/aggregate-results.mjs
cases:
  - otherwise: true
    pass:
      to: AGG_TARGET
```

```say
$label: LOCAL_TARGET
illegal local branch
```

```say
$label: AGG_TARGET
aggregate branch
```
