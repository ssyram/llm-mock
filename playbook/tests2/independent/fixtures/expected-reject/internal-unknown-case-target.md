# Internal program cases cannot target an unknown label

```user
- any: true
```

```segment
command: node -e "process.stdout.write(JSON.stringify({result:'done'}))"
cases:
  - exact: done
    pass:
      to: MISSING_INTERNAL_TARGET
```
