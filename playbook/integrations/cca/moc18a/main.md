---
vars:
  idle_text: ""
---
# CCA moc18a Main 会话（模型侧薄剧本）：一次 start 自动跑完 Analysis→EqClass。
# 业务决策/命令/材料全部来自冻结 Pilot（adapter/main_step.py 复用），本剧本只
# 用三种管理单元组织对话结构；worker 回程=新 user 消息激活下一 streak。

```user
- any: true
```

```segment
$label: streak
command: python3 adapter/main_step.py
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
