# Compaction is an explicit classification, not history recovery

```user
- any: true
```

```match
data: compaction
cases:
- judge: node ../programs/compaction-classifier.mjs
  pass:
    to: CLASSIFIED
- otherwise: true
  pass:
    to: ORDINARY
```

```segment
$label: CLASSIFIED
command: node ../programs/branch-observer.mjs
with:
  file: compaction-branch.txt
  mode: classified
cases:
  - otherwise: true
    pass:
      to: DONE
```

```segment
$label: ORDINARY
command: node ../programs/branch-observer.mjs
with:
  file: compaction-branch.txt
  mode: ordinary
cases:
  - otherwise: true
    pass:
      to: DONE
```

```say
$label: DONE
finished
```
