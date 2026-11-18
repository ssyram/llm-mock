---
params:
  token: default-token
vars:
  local: unset
---
# Child function

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
child {{ params.token }} local {{ vars.local }}
```
