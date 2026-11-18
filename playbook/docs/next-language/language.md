# 作者语法：只写三个管理单元

适用于 `mock2.mjs`。运行与验证范围见 [总览](overview.md)。

```text
ManagementUnit := RVUnit | UserBlock | SegmentBlock
RVUnit         := Response + Validation
```

块外 Markdown 只给人读，不输出。一个文件是一个函数，读到文件末尾自然返回。

## 1. RV：输出及其验证

````markdown
```say
$label: check
开始检查。
```

```call bash
command: ./check.sh
```
````

`say` 与 `assistant` 同义。相邻 call 属于同一条 Response，默认 say 为空。只有 say、没有工具时，自然结束本轮；后面的单元由新用户输入再激活，不写 end。

不需特别验证工具结果时，不写预测块；解释器仍必须关联真实回执。有特殊验证才给相应 call 写 toolResult/cases；需要统筹当前验证及后续交互时，在 Validation 中声明 aggregation。它们是 RV 的组成部分，不是新的管理单元。

调用也可完整写成：

````markdown
```call
tool: bash
args:
  command: ./check.sh
```
````

完整形式的 `tool` 是工具名，`args` 才是原生参数，避免同名字段歧义。短形式直接把块内 YAML 当原生参数。

## 2. User：停下来等用户

````markdown
```user
$label: choice
- exact: "2"
  pass:
    to: fix
- otherwise: true
```
````

User 本身定义边界：它可以收束正在收集的上方 RV；label 则不能这样切开 RV。若上方已经是纯 say，不追加回复；否则解释器插入空 say 停止自动续行，再等待新用户。连续 User 之间同样有空回复。首次根入口没有上方执行可收束，首个 User 可以直接匹配触发运行的输入；子函数不能再次消费已被调用方匹配的旧输入。

User 不是上一条 Response 的 Validation。没有显式 User 的纯 say 后，新用户也可激活下一单元；需要指定匹配或明确停等位置时才写 User。

## 3. Segment：函数调用或外接处理

````markdown
```segment
$label: inspect
command: node programs/inspect.mjs
with:
  input: "{{ vars.input }}"
save:
  summary: summary
```
````

也可用 `path: functions/inspect.md` 与 `with` 调用另一份 Markdown 函数。参数和局部变量按文件帧隔离。外接处理可以只计算、推进阅读位置，或生成 Response 并继续交互；完整数据流见 [外接协议](external-program-protocol.md)。

`cases` 仅在需要匹配结果或选择后继时写；没有 cases，正常完成就继续，不要求补一个 otherwise。跳转写在匹配成功的 `pass.to` 中，目标是当前文件的管理单元。

## 可选数据与匹配

文件头可声明 `params` 默认值与 `vars` 初值。`{{ params.x }}`、`{{ vars.x }}` 只取值，不是表达式；整体引用保类型，混合文本做替换。计算由 command 完成，变量经 save 存回。

cases 按顺序首匹配：exact、contains、外接 command 或 otherwise。复杂情况先 translation，再用同一套 cases；system/compaction 是内置可选数据，不各自成为专门块。具体匹配数据接口见外接协议。

## label 的一条规则

`$label: name` 只在块的第一行取作元信息，不输出、不传给工具。它命名整个管理单元：RV 挂在 say 或隐式空 say 的首个 call；User/Segment 挂在自身。不能挂在 RV 后续 call、预测或 aggregation 内部。其余名称、位置与引用错误由编译器指出。
