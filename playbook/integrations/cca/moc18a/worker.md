---
vars:
  idle_text: ""
---
# CCA moc18a Worker 子会话（模型侧薄剧本）：单 streak 到 terminal；真实任务包
# 编译、真实最小材料命令、认领读包后首写稿前真实等待，全部经新解释器。
# 与 main.md 同构的 streak→wait→user 回环：压缩回显等文本回显（如 cx12 0020
# worker 子会话自身压缩后的续行）经 idle 逐字重导后，流停在 user 单元可再次
# 收养后续 assistant 回显——单段结构在首个文本回显后即根 EOF（playbook_exhausted）。

```user
- any: true
```

```segment
$label: streak
command: python3 adapter/worker_step.py
save:
  idle_text: idle_text
cases:
  - exact: idle
    pass:
      to: wait
  - exact: terminal
```

```say
$label: wait
{{ vars.idle_text }}
```

```user
- any: true
  pass:
    to: streak
```
