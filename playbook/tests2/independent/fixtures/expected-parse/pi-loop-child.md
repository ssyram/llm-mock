---
params:
  token: 0
vars:
  local: unset
---
# Fresh imported frame; one real host tool call per iteration

```segment
command: node ../programs/frame-observer.mjs
with:
  token: "{{ params.token }}"
  local: "{{ vars.local }}"
save:
  local: next
cases:
  - otherwise: true
```

```say
```

```call bash
command: "echo '{{ params.token }}|{{ vars.local }}' >> loop-tools.txt"
```
