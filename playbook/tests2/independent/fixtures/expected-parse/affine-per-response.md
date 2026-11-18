# AFFINE is scoped to each Response

```user
- exact: begin
```

```say
first response
```

```call bash
command: printf first
```

```toolResult
- otherwise: true
  pass:
    to: AFTER_FIRST
```

```say
$label: AFTER_FIRST
second response
```

```call bash
command: printf second
```

```toolResult
- otherwise: true
  pass:
    to: AFTER_SECOND
```

```say
$label: AFTER_SECOND
finished
```
