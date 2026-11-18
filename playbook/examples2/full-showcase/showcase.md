---
vars:
  count: 0
  reading: pending
---
# Full showcase：小型修复演练

标题和说明只是人类可读文档。第一批两个调用属于同一条 Response；第二个由 judge 验证，aggregation 等两个真实回执齐全后才裁决。

```user
- exact: "1"
```

```say
$label: prepare
Full showcase / 本地 fuzz 修复演练：准备基线和一个有缺陷的样本。当前宿主名在启动器中显示。两个工具调用属于同一批，宿主自行决定执行顺序。
```

```call bash
command: "printf 'baseline=PASS\\n' > baseline.txt"
```

```call bash
command: "printf 'sample=buggy\\n' | tee sample.txt"
```

```toolResult
- judge: node programs/sample-judge.mjs
```

```aggregation
command: node programs/aggregate.mjs
cases:
  - exact: complete
```

每轮文件调用创建独立函数帧；外部 counter 只根据传入局部值算下一值。

```segment
$label: rounds
path: functions/round.md
with:
  index: "{{ vars.count }}"
```

```segment
command: node programs/counter.mjs
with:
  current: "{{ vars.count }}"
  limit: 3
save:
  count: next
cases:
  - exact: again
    pass:
      to: rounds
  - exact: done
```

```say
$label: boundary
```

```call bash
command: "printf 'batch=separated\\n' > boundary.txt"
```

```segment
$label: read
command: node programs/read-segment.mjs
with:
  shell: bash
save:
  reading: summary
cases:
  - exact: read-ok
```

```say
读取片段结果：{{ vars.reading }}。请输入 2 修复并验证，或输入 3 保留失败并结束；也可用自然语言要求修复。
```

```user
$label: choose
- exact: "2"
  pass:
    to: fix
- exact: "3"
  pass:
    to: keep
- judger: node programs/choice-judge.mjs
  pass:
    to: fix
- otherwise: true
  pass:
    to: keep
```

```say
$label: fix
选择修复：修复样本并记录 FIXED，然后读取全部产物并验证。
```

```call bash
command: "printf 'sample=FIXED\\n' > sample.txt; printf 'status=FIXED\\n' > status.txt"
```

```toolResult
- otherwise: true
  pass:
    to: verify
```

```say
$label: keep
选择保留失败：记录 KEPT，然后读取全部产物并验证。
```

```call bash
command: "printf 'status=KEPT\\n' > status.txt"
```

```toolResult
- otherwise: true
  pass:
    to: verify
```

```say
$label: verify
```

```call bash
command: cat baseline.txt sample.txt trace.txt boundary.txt status.txt
```

```toolResult
- judge: node programs/final-judge.mjs
```

```assistant
演练完成。请查看当前工作目录的 baseline.txt、sample.txt、trace.txt、boundary.txt 和 status.txt；工具回执已经过外接验证。
```
