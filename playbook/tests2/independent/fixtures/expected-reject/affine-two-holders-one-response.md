# Two successors in one Response are illegal

```user
- exact: begin
```

```say
one response
```

```call bash
command: printf left
```

```toolResult
- otherwise: true
  pass:
    to: COMPLETE
```

```call bash
command: printf right
```

```toolResult
- otherwise: true
  pass:
    to: COMPLETE
```

```say
$label: COMPLETE
must not compile
```
