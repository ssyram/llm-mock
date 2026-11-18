# CCA 原生 OpenCode Mock（实验接入）

`main.md`、`worker.md` 和 `aux.md` 由 `mock2.mjs` 解释；`adapter/` 接入已有 CCA/Pilot 业务逻辑。`new_lane.py LANE_ROOT TAPE|- SPEC_JSON` 建立独立实验环境，由原生 TUI 输入 `start` 发车。它仍依赖开发机的冻结 CCA、Pilot、原终态采集器和本地 OpenCode/FSM，不是独立安装包；私有样本、旧侧驱动和实跑记录不入库。

图从 `SPEC_JSON` 的 `nodes` 和 `edges` 读入。`para` 未提供或小于 1 时不传覆盖值，沿用配置；正整数才显式覆盖。确定性测试使用以下 `mock` 配置：

```json
{
  "delta_probability": 0.0,
  "max_new_nodes_per_task": 0,
  "max_new_edges_per_task": 0,
  "max_external_marks_per_task": 0,
  "max_new_nodes": 0,
  "max_new_facts": 0,
  "wait_seconds": [0.5, 0.5]
}
```

这个配置不加点、不加边，worker 请求等待固定为 0.5 秒。普通随机配置不变；实际耗时和无业务影响的调度顺序不比相等。

本机六节点三边确定性实验中，两侧均完成 Analysis 和 EqClass，9 个 worker 全部接受，最终图和接受目标一致，10 份交付物逐字节一致。新侧缺部分时间线证据，仍保留采集器的失败状态。验收目标是[可观察行为的双模拟](../../../docs/next-language/expectations.md#cca-代表性目标)，不是内部状态快照字段全等；本次只报告实测的业务完成与终态一致，不证明全轨迹双模拟。
