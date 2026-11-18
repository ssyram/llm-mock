---
vars:
  loopCount: 0
---
# Representative local Pi flow

```match
data: system
cases:
- contains: local-contract
```

```user
- exact: start
```

```say
prepare
```

```call bash
command: printf alpha > alpha.txt
```

```call bash
command: printf beta > beta.txt
```

```segment
$label: LOOP
path: ./pi-loop-child.md
with:
  token: "{{ vars.loopCount }}"
```

```segment
command: node ../programs/counter-program.mjs
with:
  count: "{{ vars.loopCount }}"
  limit: 3
  observationFile: pi-loop-observations.json
save:
  loopCount: next
cases:
  - exact: again
    pass:
      to: LOOP
  - exact: done
```

```segment
command: node ../programs/segment-decision.mjs
with:
  mode: continue
  observationFile: representative-segment.json
cases:
  - otherwise: true
```

```say
```

```call bash
command: test -f alpha.txt && test -f beta.txt && test "$(wc -l < loop-tools.txt)" -eq 3 && printf verified
```

```toolResult
- contains: verified
```

```aggregation
command: node ../programs/aggregate-results.mjs
cases:
  - exact: complete
```

```say
ready for confirmation
```

```user
- exact: continue
```

```say
complete
```
