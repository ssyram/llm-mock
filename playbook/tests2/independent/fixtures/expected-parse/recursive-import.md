---
params:
  remaining: 3
vars:
  next: 0
---
# Finite recursive function call

```segment
command: node ../programs/recursion-step.mjs
with:
  remaining: "{{ params.remaining }}"
save:
  next: next
cases:
  - exact: recurse
    pass:
      to: RECURSE
  - exact: done
    pass:
      to: COMPLETE
```

```segment
$label: RECURSE
path: ./recursive-import.md
with:
  remaining: "{{ vars.next }}"
```

```segment
$label: COMPLETE
command: node ../programs/branch-observer.mjs
with:
  file: recursion-complete.txt
  mode: "level-{{ params.remaining }}"
cases:
  - otherwise: true
```
