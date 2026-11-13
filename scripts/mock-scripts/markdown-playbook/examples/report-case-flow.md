# 示例剧本：带分支的报告流程（case matcher + 外接 judger）

给读者的话：标题与本文件里的 prose 永远不会进入模型输出，只用来解释意图。
本剧本演示四种能力：有序 case 匹配（启动宽松识别或 '1'）、```toolResult
结果分支（已有报告直接跳到"完成"锚点，缺失则继续）、user 确认分支
（judger 接受 好/可以/请补齐 等，否则跳"取消"锚点）、```end 显式结束。
锚点用 <a id="…"></a> 行声明，pass.to 只允许前向跳转。

启动输入：自然语言提到报告/status.md（judger 宽松识别），或逐字 '1'。

```user
- judge: node judges/report-request.mjs
- exact: "1"
```

## 第一步：真实检查报告状态

```assistant
我先检查 status.md 是否已存在且内容为 ok。
```

```call bash
command: |
  test -f status.md && grep -q ok status.md
```

结果分支：judger 只读 toolResult 文本 —— 末尾没有退出状态行即 exit 0
（报告完整），pass 到下方"完成"锚点；否则试下一个 case（缺失时 Pi 的
bash 工具文本以 `Command exited with code 1` 结尾），无 pass，继续问用户。

```toolResult
- judge: node judges/status-verdict.mjs
  pass:
    to: 完成
- contains: "Command exited with code 1"
```

## 缺失分支：询问用户是否创建

缺失时不写任何文件，先问人。回复 好/好的/可以/请补齐/同意 等由 judger
接受；其他回复（如拒绝）经 otherwise 跳到"取消"锚点。

```say
status.md 缺失或内容不对。要我现在创建并验证吗？（好 / 可以 / 请补齐 都可以）
```

```user
- judge: node judges/confirm-create.mjs
- otherwise: true
  pass:
    to: 取消
```

## 确认分支：真实创建并自查

```say
好的，我现在创建报告并验证内容。
```

```call bash
command: |
  printf 'ok\n' > status.md
```

```expect
exit_code: 0
```

```call bash
command: |
  grep ok status.md
  test "$(wc -l < status.md)" -eq 1
```

```expect
exit_code: 0
contains: ok
```

```say
报告已创建并验证通过：status.md 存在且内容为 ok。
```

```end
```

<a id="取消"></a>

## 取消分支

```say
好的，已取消：不创建报告，也没有改动任何文件。
```

```end
```

<a id="完成"></a>

## 完成分支（报告已完整，直接收尾）

```say
报告已完整：status.md 存在且内容为 ok，无需创建。
```

```end
```
