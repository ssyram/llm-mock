# A program fault cannot fall through to otherwise

```user
- any: true
```

```segment
command: node ../programs/fault-program.mjs
cases:
  - otherwise: true
    pass:
      to: ILLEGAL_FALLTHROUGH
```

```call bash
$label: ILLEGAL_FALLTHROUGH
command: printf side-effect > must-not-exist.txt
```
