# Playbook：三个管理单元

本目录说明当前 `mock2.mjs` 的三单元语法和运行契约。`mock.mjs` 仍是 v1 入口；提交源码不会部署或修改已运行的会话。

## 目标与范围

作者写清楚输出、匹配、等待用户和必要的控制动作，不管理解释器阶段、调用栈或缓存。一个 Markdown 文件是一个函数；三个宿主使用同一份剧本，工具名与传输差异属于适配层。

```text
ManagementUnit := RVUnit | UserBlock | SegmentBlock
RVUnit         := Response + Validation
Function       := 管理单元的序列
```

只有这三种管理单元。label 是单元的可选名称；aggregation 是 Validation 中的处理者；参数、局部变量和函数调用不是第四种管理节点。

## 用户已确定的设计方向

- RV 是函数、跳转和普通执行位置的最小边界，不切进 Response 或 Validation 内部。
- User 不是 Validation：它收束上方执行、等待新用户并匹配该输入。必要的空回复由解释器插入。
- Segment 从完整 RV 入口处理；Aggregation 从当前工具结果的 Validation 入口处理，之后可处理完整单元。两者格式相同但输入与执行语义不同。
- 纯 say 自然结束宿主 turn，不再要求 end。没有新用户，不能继续执行后面的 Segment。
- label 写在管理单元首个块的第一行 `$label: name`，不是独立块。调用可写 `call bash`，完整形式为 `call` 内的 `tool` 与 `args`。
- 匹配是“可选 translation → atomic matching”。system/compaction 是匹配数据源，不是新的管理节点。
- 变量只存取，计算和判断走外接程序；阅读位置与解释器执行位置、调用栈分开。

## 文档入口

- [作者语法](language.md)：最短常用写法，不混入旧语法和内部状态。
- [执行契约](runtime.md)：三种单元、边界、调用和状态保持。
- [外接数据流](external-program-protocol.md)：完整 transcript、阅读指针及返回值。
- [实验要求](expectations.md)：可判定目标、真实 Pi 对偶与 CCA 目标测试。

## 实现与实验的责任边界

解析把源码组织为三个管理节点；编译负责合法边界和 label；解释器负责调用帧、回执归属、暂停和恢复；外接进程负责具体计算或匹配。缓存只复用已经成立的历史处理状态，不定义另一套作者语义。

测试入口为 `node playbook/tests2/run-local-suite.mjs`。实测范围及未封闭的 CCA 对偶义务见 [验收契约](expectations.md)。

## 迁移与历史

`mock.mjs` 和 `docs/affine-segments/` 是 v1，保持历史接口，不以本规范反改。既有 `mock2` 的独立 internal、end、label、import/goto 和专门 match 块不再是新作者的管理模型。是否保留旧输入兼容，不能改变规范 IR 的三个节点，也不能要求新作者学习旧写法。

`subplans/pb-1-segment-unification.md`、`subplans/pb-2-pi-duality-suite.md` 记录当时版本及其证据。被本次裁决替代的规则不再是当前规范；有效能力和回归义务仍由新实验承接。
