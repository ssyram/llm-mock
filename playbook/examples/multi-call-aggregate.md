# 示例剧本：response 多工具批次 + aggregator 汇合（AFFINE 跳转权）

给读者的话：标题与 prose 永远不会进入模型输出。本示例演示这一轮的三项
能力：```response 显式分组把多个 call 合并成同一条 assistant 消息
（text + 多个 toolCalls）；每个 call 自带 result matcher（expect 或
toolResult case 列表），按 toolCall ID（这里依次是 mdp_0 / mdp_1）关联
各自的真实验证结果，结果到齐的顺序不限；局部 result block 不声明
pass.to —— 本批的跳转权整体交给 aggregator，由它输出聚合结论后统一决定
唯一跳转（AFFINE 规则：一个批次最多一个 to 持有块，有 aggregator 时
局部一律禁 to）。

```user
- contains: 体检
```

先说明意图，再进入 response 分组：say 的文本会作为消息文本，两个 call
依次成为同一条消息的两个 toolCalls。

```say
我先同时检查两项环境条件。
```

```response

```call bash
command: printf a > probe-a.txt
```

```expect
exit_code: 0
```

```call bash
command: printf b > probe-b.txt
```

```toolResult
- any: true
```

```/response

aggregator 是本批必经的汇合点：stdin envelope 携带每个 call 的原始结果
文本与局部匹配结论（results[]，按剧本 call 顺序），stdout 输出聚合结论，
再用同一套 cases 决定本批唯一跳转——「全部就绪」跳"完成"锚点，否则
问用户补齐。

```aggregator
command: node programs/aggregate-report.mjs
cases:
  - exact: 全部就绪
    pass:
      to: 完成
  - otherwise: true
```

```say
有缺失：环境检查未全部通过，请补齐后重试。
```

```end
```

<a id="完成"></a>

```say
体检完成：两项探测全部通过，探测文件已就位。
```

```end
```
