# 多剧本路由示例：时间问询（短剧本）

与 report-case-flow.md 一起用 --playbook 顺序挂载时，本剧本在 argv 前面：
首条 user 输入含"几点"就由本剧本接管，其他输入落到下一个剧本。
单剧本挂载也完全可用。

```user
- contains: "几点"
```

```say
我来查一下当前系统日期。
```

```call bash
command: date '+%Y-%m-%d'
```

```expect
exit_code: 0
```

```say
上面就是当前的系统日期。本剧本到此结束。
```

```end
```
