# Imported system matcher

```match
data: system
cases:
  - contains: child-policy
    pass:
      to: CHILD_MATCHED
  - otherwise: true
    pass:
      to: CHILD_SKIP
```

```segment
$label: CHILD_MATCHED
command: node ../programs/branch-observer.mjs
with:
  file: child-branch.txt
  mode: matched
cases:
  - otherwise: true
```

```segment
$label: CHILD_SKIP
command: node ../programs/branch-observer.mjs
with:
  file: child-branch.txt
  mode: skipped
cases:
  - otherwise: true
```
