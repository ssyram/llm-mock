# 示例剧本：CCA SCC 成员分页遍历（result_ref 解引用 + 真实游标取页）

给读者的话：segment 处理者 programs/cca-scc-walk-segment.mjs 在每次模型
请求时从 transcript 前缀确定性重建游程。每一页都由它发出【真实 bash 工具
调用】（node programs/cca-fixture-page.mjs <fixture> <cursor>）取得
result_ref 封套，再本地用 programs/cca-result-ref.mjs 解引用完整对象并校验
分页契约（page_start 连续、page_size 与 members 一致、total 恒定、成员不
重复、next_after 等于末成员 id、末页 next_after 为 null）。缺引用/坏文件/
坏 JSON/篡改 ⇒ 程序非零退出，播放器转 playbook_program_error 硬停，绝不
降级成 no-match。fixture 是公开合成样本（examples/cca/），真实 CCA 样本含
私有路径不入库。

```user
- contains: 成员遍历
```

```segment
command: node programs/cca-scc-walk-segment.mjs
cases:
  - exact: 遍历完成
    pass:
      to: 完成
  - otherwise: true
```

```say
遍历未完成：游程异常结束。
```

```end
```

<a id="完成"></a>

```say
SCC 成员遍历完成：全部页面用真实游标走完，清单已写入 cca-walk-members.txt。
```

```end
```
