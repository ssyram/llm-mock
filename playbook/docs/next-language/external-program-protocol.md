# 外接数据流：全文、阅读位置和返回

Segment 与 Aggregation 共用外接程序协议，但语义与执行过程不同。管理单元定义见 [runtime.md](runtime.md)。

## 输入

一次模型请求准备一份只读 UTF-8 JSON 文件，保留该请求完整的模型可见 transcript、system、tools、options 及影响执行的元数据，不以文本拼接或随意删字段代替结构。多次 command 共用这份文件；新请求使用自己的完整输入，不共享可写文件保存业务变量。

stdin 只传小 envelope：

```json
{
  "transcript": "/run/request/transcript.json",
  "pointer": 27,
  "with": {"current": 2}
}
```

- transcript 是实际文件路径，不自动猜测路径、内存对象或裸文本三种模式。
- pointer 表示 transcript 的结构位置，不是字符串/字节偏移，更不是执行 PC。
- with 是显式选中的参数或局部值；不需要就省略，不传整个调用帧。
- 开发副本当前采用 messages 的零基结构下标：实际文件保存统一请求，消息数组为 `request.context.messages`，范围为 0 至数组长度；长度位置代表当前前沿。返回指针必须落在合法完整管理边界，Aggregation 首次进入 Validation 由解释器设置；它不开放普通半单元跳点。
- 该 ABI 仍处于实现和独立测试接线阶段，不等于产品验收通过。文件对当前请求及其外接调用有效，下个请求会提供自己的文件路径，不能把临时路径当跨回合业务状态。

独立进程不能直接共享解释器的普通内存对象。10MB 级输入先用文件避免每次 command 重传全文；命令可自行整份读成字符串或对象。不为此增加 RPC、常驻变量服务或流式框架。实际资源和速度由实验报告，不宣称任意大小均已验证。

## 开发 ABI 与编译观察

开发入口沿用 `mock2.mjs --playbook FILE`，stdin/宿主回复的外层协议不变。`--compile-observations FILE` 导出 `accepted` 与真实 `ir`；本轮 schemaVersion 为 2，`ir.units` 是文件闭包，每个文件的 `nodes` 只包含 `rv/user/segment`，label 是节点属性和索引。它不按测试名生成期望，也不执行外接程序。

## 相同形状，不同输入含义

| 处理者 | 首次 pointer 的含义 | 后续处理 |
|---|---|---|
| Segment | 完整 RV 的起点或待产生该单元的当前前沿 | 按完整单元处理，在管理边界交还；纯计算可不消费单元 |
| Aggregation | 当前工具结果的 Validation 入口 | 可先完成该 Validation，再处理 N 个完整单元；也可直接完成 |

不要求作者再填一个重复的 mode。Aggregation 不能因为共用进程调用代码就被视为普通 Segment；普通跳转也不能借它取得 Validation 中途入口。

pointer 指向本次应处理的起点，包含当前位置，不是“只能看它之前”的截止点。Aggregation 生成后续 Response 后，由解释器将该 Response 与其 Validation 作为完整单元管理；真实回执到达时，Aggregation 的内部续行接收当前 Validation 起点。这里的挂起续行不是一次普通函数调用或 label 跳转，不开放公开的半单元入口。

完整输入意味着命令能读到 pointer 后面的既有历史；pointer 只规定消费位置，不提供沙箱权限。命令不能伪造未发生的回执或通过改写输入文件改变历史。

## 输出

输出为单个 JSON 对象，按用途提供：

- result：交给已声明的有序 cases；没有 cases 就正常继续，不要求补默认匹配样板。
- values：按 save 映射写当前函数局部值；没有存值就省略。
- pointer：更新真实阅读位置；省略保持原位。不能将任意 marker 冒充消费进度。
- assistant：一条下一 Response，与 result 互斥；可与 values/pointer 同时返回。

assistant 可有或没有工具；无工具自然结束 turn，不能为了续行强迫命令输出一个无意义工具。需要后续交互时解释器保留处理者位置与阅读状态，在新输入到来后续行。值/指针返回不等于允许改帧栈、ProgramCounter 或整个 continuation。

没有 cases 表示没有该项额外匹配义务；声明了 cases 才依次匹配。程序故障、坏 JSON、非法类型或试图返回顶层执行栈/PC 等控制字段仍是故障，不能伪装成 otherwise。result 内的普通数据不因字段名字像 pc 就成为控制指令。

## Match：可选转换，再原子匹配

match 从当前语境取得明确数据：用户输入、某个/整批工具结果、程序 result、system 或可识别的 compaction 信息。数据源不是新管理单元。

默认直接原子匹配；必要时先 translation，再交同一套有序 cases。exact 比较选定值，contains 用于字符串，外接匹配 command 返回约定的 pass/fail；匹配成功后的继续/跳转由解释器执行，不由匹配命令修改栈。

translation 返回待匹配数据，predicate 返回匹配与否，两者不能因为都使用 command 就混淆。编译与运行的对照入口见 [验收契约](expectations.md)。compaction 信息的匹配不等于自动恢复被压缩掉的历史。

## 缓存屏障（参考项，不是主例样板）

外接块声明 `volatile: true` 时，只能从该处理之前的有效状态重新执行，不复用本块及其后的缓存结果。未声明时不增加这个屏障；普通计算不必为此多写字段。TTL、存活请求租约、清理和命中细节属于解释器，不成为管理单元。

## 路径、故障和状态

command 与文件调用的相对路径按所属函数文件解析。进程正常退出后仍验证输出协议；非零、超时、信号、坏输出和未知进程状态硬停，不重试。只有已取得整数退出码、无信号的 EPIPE 才按真实退出码分类，退出 0 后仍不得跳过 stdout 校验。

局部变量与 continuation 由解释器保存，文件只是只读输入。历史处理与外部副作用不承诺 exactly-once。缓存必须保留真实可观察输入，不能用规范化掉 metadata 换取表面命中；失去可靠历史时应明确不匹配，不能猜宿主 session。
