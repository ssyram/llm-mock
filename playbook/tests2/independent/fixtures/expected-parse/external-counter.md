---
vars:
  count: 0
---
# External code computes from the current frame value

```user
- exact: begin
```

```segment
$label: COUNT
command: node ../programs/counter-program.mjs
with:
  count: "{{ vars.count }}"
  limit: 3
  observationFile: external-counter-observations.json
save:
  count: next
cases:
  - exact: again
    pass:
      to: COUNT
  - exact: done
    pass:
      to: COMPLETE
```

```say
$label: COMPLETE
count={{ vars.count }}
```
