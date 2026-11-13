# 示例剧本：外接 segment 跨轮探测（真实工具往返后返回）

给读者的话：segment 处理者不是 Markdown —— programs/fuzz-segment.mjs 由
播放器在每次模型请求时以当前 transcript 前缀调用，从 prefix 里确定性恢复
自己的续行位置（已发出几轮 seg_* 调用、收到几个真实 toolResult）。它先
发出一条 assistant 消息（文本 + seg_probe_1 工具调用），宿主真实执行
bash 后 toolResult 回到 transcript；下一次调用发出第二轮 seg_probe_2
复核；最后输出内部返回值 {"result": …}。返回值只交给下面的 cases 选择
后续，绝不变成 assistant 消息。segment 放在 say 之前——紧跟 say 的
segment 会在解析期被拒绝（纯文本消息会先结束模型回合）。

```user
- contains: fuzz
```

```segment
command: node programs/fuzz-segment.mjs
cases:
  - exact: 探测成功
    pass:
      to: 成功
  - otherwise: true
```

```say
探测失败：fuzz 段未通过，流程停止。
```

```end
```

<a id="成功"></a>

```say
fuzz 段返回成功，外层剧本继续收尾。
```

```end
```
