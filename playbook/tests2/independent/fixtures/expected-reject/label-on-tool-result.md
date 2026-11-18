# A result-entry label resumes only after the call exists in history

```user
- exact: begin
```

```say
$label: RESPONSE_START
batch
```

```call bash
command: printf value
```

```toolResult
$label: RESULT_ENTRY
- otherwise: true
```

```say
finished
```
