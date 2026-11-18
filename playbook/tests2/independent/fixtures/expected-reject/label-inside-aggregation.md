# A label cannot enter after local results but before mandatory aggregation

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
```

```aggregation
$label: ILLEGAL_AGGREGATION_MIDDLE
command: node ../programs/aggregate-results.mjs
cases:
  - otherwise: true
```

```say
must not compile
```
