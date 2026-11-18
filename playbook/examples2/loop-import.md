---
vars:
  counter: 0
---
```user
- exact: 开始
```

```segment
$label: round
command: node programs/counter.mjs
with:
  current: "{{ vars.counter }}"
  limit: 3
save:
  counter: next
cases:
  - exact: loop
    pass:
      to: round
  - otherwise: true
```

```segment
path: functions/step.md
with:
  index: "{{ vars.counter }}"
  label: "round-{{ vars.counter }}"
```

```say
```

```call bash
command: echo batch-2-marker
```

```say
完成：{{ vars.counter }} 轮
```
