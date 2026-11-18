---
vars:
  caller: root
---
# Each import gets a fresh local frame

```user
- exact: begin
```

```segment
path: ./import-frame-child.md
with:
  token: first
```

```segment
path: ./import-frame-child.md
with:
  token: second
```

```say
imports returned
```
