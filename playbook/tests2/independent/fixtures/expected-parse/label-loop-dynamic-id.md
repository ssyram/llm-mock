---
vars:
  count: 0
---
# A backward label loop executes the same call dynamically

```user
- exact: begin
```

```say
$label: LOOP
probe
```

```call bash
command: printf loop
```

```segment
command: node ../programs/counter-program.mjs
with:
  count: "{{ vars.count }}"
  limit: 3
  observationFile: label-loop-observations.json
save:
  count: next
cases:
  - exact: again
    pass:
      to: LOOP
  - exact: done
    pass:
      to: DONE
```

```say
$label: DONE
finished
```
