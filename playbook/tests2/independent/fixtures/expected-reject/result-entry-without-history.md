# A jump cannot invent an already-issued tool batch

```user
- otherwise: true
  pass:
    to: RESULTS
```

```say
batch
```

```call bash
command: printf value
```

```toolResult
$label: RESULTS
- otherwise: true
```

```say
must not execute
```
