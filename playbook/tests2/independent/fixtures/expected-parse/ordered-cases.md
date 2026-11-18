# Ordered matcher selects the first successful case

```user
- contains: begin
  pass:
    to: FIRST
- any: true
  pass:
    to: SECOND
- otherwise: true
  pass:
    to: THIRD
```

```segment
$label: FIRST
command: node ../programs/branch-observer.mjs
with:
  file: ordered-branch.txt
  mode: first
cases:
  - otherwise: true
    pass:
      to: DONE
```

```segment
$label: SECOND
command: node ../programs/branch-observer.mjs
with:
  file: ordered-branch.txt
  mode: second
cases:
  - otherwise: true
    pass:
      to: DONE
```

```segment
$label: THIRD
command: node ../programs/branch-observer.mjs
with:
  file: ordered-branch.txt
  mode: third
cases:
  - otherwise: true
    pass:
      to: DONE
```

```say
$label: DONE
finished
```
