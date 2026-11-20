# CCA 原生 OpenCode Mock（实验接入）

`main.md`、`worker.md` 和 `aux.md` 由 `mock2.mjs` 解释；`adapter/` 接入已有 CCA/Pilot 业务逻辑。`new_lane.py LANE_ROOT TAPE|- SPEC_JSON` 建立独立实验环境，由原生 TUI 输入 `start` 发车。它仍依赖开发机的冻结 CCA、Pilot、原终态采集器和本地 OpenCode/FSM，不是独立安装包；私有样本、旧侧驱动和实跑记录不入库。框架根由显式导出环境选择：`CCA_MOCK18A_SUT`（固定提交导出根，携带 `scripts/`）与 `CCA_MOCK18A_PILOT`（pilot 包根）在 launcher（`new_lane.py`）与 adapter（`lane_context.py`，挂载子进程同源）一致解析同一 HOME/PILOT，`lane.env`/生成 attach.sh 随之传递，生成的 setup/submit 命令路径全部落所选导出；显式设置了但路径缺必备布局即硬错（不静默回退旧树），未设即旧树默认行为不变（回归：`tests/sut-export-wiring.test.py`）。

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

生成路径的 worker findings 遵循 staged 意图契约：抽样前先读本任务工作区权威 `_cca_analysis/intent.md` 全文（包内 `intent_head` 截断提示不构成已读；lane 以预备者身份安装夹具文本，外部材料经 `CCA_NEW_INTENT_MD` 显式指定，不可读即硬错），并携带如实组装的 `intent_compliance`（闸门见部署快照 `check_intent_compliance`）：只陈述真实读取（任务/工作区/字节数/小节哈希）与实际抽样 findings 的逐类计数，并明确合成分析边界——Mock 只做了读取与观察，未做语义比对，不因词表重叠缺失而声称与用户意图无关或不矛盾；陈述句不回显 intent 原文。choice tape 命中不隐含旧产品契约，契约看包形：携带 `intent_head` 的 staged 包即使取带内抽样，也先真实读本任务 intent.md 再以拷贝注入当下读得的 `intent_compliance`（材料缺失即 MockFault，不绕过）；仅无 `intent_head` 的真正旧归档包保持逐字重放、不读不注。部署绑定回归：`tests/intent-contract.test.py`（固定提交导出 `git archive` 下真实 `cca_state.py` 生成 submit 命令，正/负例直断 CLI 结果；含单元契约行为；外部输入 `CCA_MOCK18A_SUT`/`CCA_MOCK18A_PILOT`，未提供即跳过）。

本机六节点三边确定性实验中，两侧均完成 Analysis 和 EqClass，9 个 worker 全部接受，最终图和接受目标一致，10 份交付物逐字节一致。新侧曾在真实 4 节点运行后因缺真实终门时间线与 worker 等待/提交/终局观测而判失败；现把这些观测在真实前沿（boundary==消息数）落盘（`records/timing-worker-*.json`：会话首请求、首写步真实 sleep 窗口、submit 步、终局文本的前沿签发；`records/timing-main-gate-*.json`：前沿请求由最终 step 新消费终门转移回执、新产出该门键时；历史 resume 重放与重放循环重建的旧门不写；均先写者胜，重放/传输重试不改写），采集器经 `collect_terminal` 按身份对上后原样消费，缺证据或失序观测仍按原判据失败。验收目标是[可观察行为的双模拟](../../../docs/next-language/expectations.md#cca-代表性目标)，不是内部状态快照字段全等；本次只报告实测的业务完成与终态一致，不证明全轨迹双模拟。

压缩/意图工作树的原生全量实测（macOS 开发机，冻结依赖）：lane `r128c` 于基线 `0a25488` 之上运行，`result.json` status=ok、problems=[]；27 个 worker（analysis 15 / eqclass 12）全部提交且终局接受（27/27），Analysis 接受 130、EqClass 接受 128（终图 130 节点/260 边，`final_obligation`=128，与初始 spec 义务一致），27 个真实 sleep 等待零 overshoot、最大成对重叠 2437739000 ns。被测树 = `0a25488` + 52 个修改/新增路径（sha256 清单 `c06f06f24e578b8b5934e357db357ee3d1c26c6039de8cb5df2387acbbd6b0ad`，公式：sorted-uniq 路径串接 `path+NUL+sha256(file).hexdigest+newline` 后整体 sha256）；SUT 经 `CCA_MOCK18A_SUT`（固定提交导出 `intent-deployment-d0fa23d41`）与 `CCA_MOCK18A_PILOT`（`gate-latency-mock-148`）显式提供。该原生实跑仅在本机 macOS 完成，不声明 Linux 实跑、不声明全轨迹双模拟或覆盖率数字。受支持回归入口：`python3 tests/<name>.test.py`（`intent-contract` 需上述两个环境变量，缺即整文件跳过）与 `node --test ../../tests2/segment-orphan-echo.test.mjs`。
