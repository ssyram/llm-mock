# A label cannot split adjacent calls in one Response

```user
- exact: begin
```

```say
batch
```

```call bash
command: printf left
```

```call bash
$label: ILLEGAL_MIDDLE
command: printf right
```

```say
must not compile
```
