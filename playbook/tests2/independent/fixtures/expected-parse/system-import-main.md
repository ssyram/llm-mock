# System matching is not restricted to the first step

```user
- exact: begin
```

```say
before import
```

```segment
path: ./system-import-child.md
with: {}
```

```match
data: system
cases:
- contains: local-policy
  pass:
    to: MATCHED
- otherwise: true
  pass:
    to: UNMATCHED
```

```segment
$label: MATCHED
command: node ../programs/branch-observer.mjs
with:
  file: system-branch.txt
  mode: matched
cases:
  - otherwise: true
    pass:
      to: DONE
```

```segment
$label: UNMATCHED
command: node ../programs/branch-observer.mjs
with:
  file: system-branch.txt
  mode: unmatched
cases:
  - otherwise: true
    pass:
      to: DONE
```

```say
$label: DONE
finished
```
