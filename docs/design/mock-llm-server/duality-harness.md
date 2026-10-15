# 对偶测试 Harness（mock-1）

> 发布版脱敏说明：机器路径、私有 provider、会话/调用标识及采集时间已替换为占位或合成值；保留技术形态与历史统计，不作为逐字原始转录。

## 矩阵定义

- **方向 × API**：{请求, 回复} × {openai-completions, openai-responses, anthropic-messages, google-generative-ai}
- **用例源**：真实语料前缀（`.tmp-corpus-capture-sample/…/capture-*.jsonl`：corpus-sys-user / corpus-orphan-toolcall / corpus-full-convo，含工具往返）＋合成形状（multi-toolcall、thinking、assistant 多 text 块、error-assistant 丢弃、user blocks 等）
- **等价定义**（权威：`api/*.md` 规格）：
  - 请求：`decode(convert(C)) ≡ canonical(C)`，比较对象 = server 捕获文件 `request` 字段
  - 回复：`parse(encode(A)) ≡ providerFill(A, api, model)`，比较 pi-ai `stream().result()`
  - 忽略：timestamp / durationMs / 捕获元数据；providerFill 声明的自动填充字段须与 harness Model 一致

## 运行

```sh
cd tests && npm install && node duality.mjs   # 自动 spawn/kill server（cargo build 产物）
```

## 实测记录（2000-01-01）

- **64 pass / 0 fail**（worker 首跑与父线程独立复跑一致）
- 用例分布：4 API × (请求 8 + 回复 8)
- 语料仅接入首场会话（工具往返）为矩阵用例；后续批次（claude2 thinking 等 5 场）尚未编入 corpus.mjs 用例——扩入即可，机制不变

## 未覆盖（TODO）

- 图像内容块（真实与合成均未覆盖）
- bedrock/mistral 及家族变体（azure/codex/vertex）——mock-3
- fuzzing 随机 Message 构造——mock-4
