# Import with may only bind declared parameters

```user
- exact: begin
```

```segment
path: ../expected-parse/import-frame-child.md
with:
  unknown: value
```

```say
must not compile
```
