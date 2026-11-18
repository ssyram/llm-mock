# Empty responses and adjacent calls

```user
- exact: begin
```

```say
```

```call bash
command: printf first
```

```call bash
command: printf second
```

```say
second response
```

```call bash
command: printf third
```

```toolResult
- otherwise: true
```

```say
finished
```
