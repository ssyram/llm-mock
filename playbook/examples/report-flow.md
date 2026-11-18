# 示例剧本：status.md 报告生成流程

这一段是给人看的说明文字。标题和块外 prose 永远不会成为模型输出，
所以这里可以自由写背景、意图、注意事项。

## 第一轮：检查报告是否缺失

用户以这句话启动任务；`exact` 不做任何 trim 或改写，逐字节相等才匹配。

```user
exact: 请帮我生成 status.md 报告
```

先说明意图，再发起真实的 bash 工具调用：相邻的 say 与 call 会合并成
同一条 assistant 消息（text + toolCall）。参数就是 YAML mapping 本身，
键名用 Pi 实际提供的工具参数名（bash 工具的 `command`）；多行命令用
YAML 块标量 `command: |` 书写，原文逐字节进入工具参数。

```say
我先检查 status.md 是否已存在且内容为 ok。
```

```call bash
command: |
  test -f status.md && grep -q ok status.md
```

文件缺失时 `test -f` 使整条命令以 1 退出。Pi 的 bash 工具会把它作为
真实 toolResult 回传：文本末尾带原生状态行 `Command exited with code 1`
（在 openai-completions 链路上 isError 字段不回传，详见 README 适配规则），
expect 据此判定精确退出码。

```expect
exit_code: 1
```

## 第二轮：创建报告并自查

expect 通过后继续推进：再一条 say+call 消息，真实写出报告文件。

```say
报告缺失，我现在创建它。
```

```call bash
command: |
  printf 'ok\n' > status.md
```

```expect
exit_code: 0
```

## 等待用户确认

这条 say 后面跟 user，因此作为本轮最终回复结束模型回合，等待真人输入。

```say
status.md 已创建。要我现在验证文件内容吗？
```

```user
exact: 好，请验证
```

## 验证并收尾

新一轮不再 say，直接发起工具调用；命令是真正的多行块标量，两行分别
验证内容与行数。expect 同时断言退出码与输出文本。

```call bash
command: |
  grep ok status.md
  test "$(wc -l < status.md)" -eq 1
```

```expect
exit_code: 0
contains: ok
```

最终回复只有 say 的原文，与本文件里任何标题、prose 都无关。

```say
验证通过：status.md 存在且内容为 ok，报告流程完成。
```
