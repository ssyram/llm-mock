---
vars:
  copy: unset
---
# References store and retrieve values only

```user
- exact: begin
```

```segment
command: node ../programs/structured-value.mjs
with: {}
save:
  copy: payload
cases:
  - exact: ready
```

```call inspect
payload: "{{ vars.copy }}"
caption: "payload={{ vars.copy }}"
literal: "{{ vars.copy }}-{{ vars.copy }}"
```

```toolResult
- otherwise: true
```

```say
finished
```
