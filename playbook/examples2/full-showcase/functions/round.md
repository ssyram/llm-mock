---
params:
  index: 0
vars:
  local: fresh
---
# 一次调用即一次全新局部帧

```segment
command: node ../programs/frame.mjs
with:
  index: "{{ params.index }}"
  local: "{{ vars.local }}"
save:
  local: mark
cases:
  - exact: fresh
```

```say
```

```call bash
command: "printf 'round={{ params.index }}|frame={{ vars.local }}|payload=case-{{ params.index }}\\n' >> trace.txt"
```
