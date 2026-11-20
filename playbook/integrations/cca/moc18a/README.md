# CCA 原生 OpenCode Mock（实验接入）

`main.md`、`worker.md` 和 `aux.md` 由 `mock2.mjs` 解释；`adapter/` 全部依赖已入库代码
（本仓库 + CCA 框架内的 `cca_bench`），不再 import 任何私有 `pilot.*` 库。运行前需按
「机器前置条件」准备好本机外部件；一切产品根目录都是显式输入。可选的
`CCA_MOCK18A_SUT`（固定提交导出根，携带 `scripts/`）仅用于把 adapter/测试的 CCA
解析锁死到同一被测导出（部署绑定回归）；lane 内子进程一律用 launcher 落实的
`CCA_NEW_CCA_HOME`（框架副本）同源解析。

## 用法

```sh
python3 new_lane.py [--cca-home PATH] LANE_ROOT TAPE|- SPEC_JSON
# CCA 框架根：--cca-home 或环境变量 CCA_HOME（缺即响亮失败）
```

`new_lane.py` 把部署所需的框架树（`scripts/`、`third_party/callgraph`、`skills/cca`、
`skills/cca-v2`）复制进 `LANE_ROOT/framework` 并在副本根上落实 `.version`（源有则原样
复制；CCA setup 的 snapshot 强依赖 `.version`）——CCA 仓库本身只读，绝不写入。lane 的
FSM/OC/mock 子进程全部使用该副本。就绪后按 `attach.sh` 提示以原生 OC TUI attach，输入
`start` 发车；服务保持存活，`collect_terminal` 在主会话终局后自动保存
`result.json`/`final-state.json`。

图从 `SPEC_JSON` 的 `nodes` 和 `edges` 读入。`para` 未提供或小于 1 时不传覆盖值，沿用配
置；正整数才显式覆盖。确定性测试使用以下 `mock` 配置（`tests/fixtures/input-spec.json`
即一份 6 节点/3 边/para 2 的最小样例）：

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

这个配置不加点、不加边，worker 请求等待固定为 0.5 秒。普通随机配置不变；实际耗时和无
业务影响的调度顺序不比相等。

生成路径的 worker findings 遵循 staged 意图契约：抽样前先读本任务工作区权威 `_cca_analysis/intent.md` 全文（包内 `intent_head` 截断提示不构成已读；lane 以预备者身份安装夹具文本，外部材料经 `CCA_NEW_INTENT_MD` 显式指定，不可读即硬错；prepare 期 `IntentMainScript` 再以同一权威文件内容经真实 write 步写入），并携带如实组装的 `intent_compliance`（闸门见部署快照 `check_intent_compliance`）：只陈述真实读取（任务/工作区/字节数/小节哈希）与实际抽样 findings 的逐类计数，并明确合成分析边界——Mock 只做了读取与观察，未做语义比对，不因词表重叠缺失而声称与用户意图无关或不矛盾；陈述句不回显 intent 原文。choice tape 命中不隐含旧产品契约，契约看包形：携带 `intent_head` 的 staged 包即使取带内抽样，也先真实读本任务 intent.md 再以拷贝注入当下读得的 `intent_compliance`（材料缺失即 MockFault，不绕过）；仅无 `intent_head` 的真正旧归档包保持逐字重放、不读不注。部署绑定回归：`tests/intent-contract.test.py`（固定提交导出 `git archive` 下真实 `cca_state.py` 生成 submit 命令，正/负例直断 CLI 结果；含单元契约行为；外部输入 `CCA_MOCK18A_SUT`，未提供即跳过）。

## 机器前置条件（显式输入，LEARNINGS 规则 7/8）

| 依赖 | 供给方式 |
|---|---|
| CCA 框架根（含 `scripts/cca_bench`、`scripts/setup_cca_v2.py`） | `--cca-home`/`CCA_HOME` |
| OpenCode | `PATH`（或 `mock_plan.binaries()` 认可的 `opencode`） |
| `mcp-server-fsm`、`mcp-server-fsm-client/hook` | `PATH` |
| mock server | `MOCK_LLM_SERVER`（缺省回退 debug 构建路径，见 `mock_plan.binaries`） |
| FSM 插件 | `~/.mcp_server_fsm/fsm-plugin.js`（lane 会把它只读复制进私有 HOME） |
| playbook 解释器 | `playbook/` 下 `npm install`（`yaml` 依赖） |
| tree_sitter 前端 | gate 以 `PYTHONNOUSERSITE=1` 运行，需
  `pip install --user tree_sitter tree_sitter_c tree_sitter_cpp tree_sitter_python`；
  `new_lane.py` 自动把 user site 并入 lane `PYTHONPATH` |

### 当前 dev 版 FSM 与冻结 CCA setup 的注册契约差异

dev 版 `mcp-server-fsm register-skill` 只把技能写进 `store.db`，不再于
`<FSM_DATA_DIR>/skills/` 落 YAML 镜像；冻结 CCA `deployment_snapshot.register` 却要求
注册后该镜像存在并逐字段等于快照。`new_lane.py` 为此在 lane 内生成私有 PATH shim
（`bin/mcp-server-fsm`）：真实 CLI 成功后按 `register()` 同一条 `{{ skill_dir }}` 替换
规则补落镜像，其余子命令原样透传——不改 use-fsm，也不改 CCA 仓库。

## pilot 替换（为什么）

原实现 import 未入库的私有库 `pilot.*`（来自开发机 `.pi/research/gate-latency-mock-148`，
已丢失），在新机器完全不可运行。替换件全部入库，语义按 cca_bench 契约重建：

| 原私有件 | 入库替换 | 语义 |
|---|---|---|
| `pilot.case_body` | `adapter/case_body.py` | 输入 spec → LevelParams/预算；随机参数由 spec.mock 逐字段治理（delta_p=delta_probability、每任务上限=max_*_per_task、等待窗口=wait_seconds），r128c 实跑 spec 值 0.5/1/1/0/(0.5,3.0) 与旧 pilot 恒参逐项相等；确定性模式被 `fixed_default_level` 压平，契约见 `tests/random-mock-parity.test.py` |
| `pilot.worker_wait`（WorkerBook/DeltaBook 等待语义） | `adapter/worker_wait.py` | 剔除剧本内嵌 draw-sleep bash 步，首写步签发时 armed `pending_wait_ns`，等待抽样＝(seed, 逻辑标签, attempt) 纯函数（旧 `sleep_for` 公式），recover 新会话同标签递增 attempt 并重抽、同会话重放不重抽，无写稿步即 `MockFault("no_write_step")`；worker_step 在真实前沿消费并落双域时钟窗口；磁带命中时 `planned_sleep_ns` 以带内 plannedSleepNs 为准且不跨会话泄漏 |
| `pilot.machine.PilotMainScript` | `adapter/main_intent.py`（`IntentMainScript`） | cca_bench `MainScript` 之上恢复 prepare 语义：A_PREPARE 内先写 `<W>/_cca_analysis/intent.md`（`cca_state reserve` 的任务包构建强依赖） |
| 原终态采集器 | `adapter/collect_run.py` | 终态采集/判定按 collector-feed 离线回归判据重建；`collect_terminal` 的证据 DeltaBook 换 `cca_bench.mock_delta.DeltaBook` |
| （测试内私有路径） | `tests/cca_scripts_path.py` + `tests/fixtures/input-spec.json` | 测试的 CCA 根经 `CCA_NEW_CCA_HOME`/`CCA_HOME` 显式给出；历史私有证据包经 `MOC18A_EVIDENCE_DIR` / `MOC18A_OLD_EVIDENCE_DIR` / `MOC18A_INPUT_SPEC` 显式给出，缺则该测试显式 skip（不造数据、不弱化断言） |

测试运行（Linux 与 macOS 同命令；`intent-contract` 另需 `CCA_MOCK18A_SUT=<固定提交导出根>`，
缺则整文件跳过）：`CCA_HOME=<框架根> python3 tests/<name>.test.py` 与
`CCA_HOME=<框架根> node --test tests/*.test.mjs`。

## 判定与验收

本机六节点三边确定性实验中，两侧均完成 Analysis 和 EqClass，9 个 worker 全部接受，最终
图和接受目标一致，10 份交付物逐字节一致。新侧曾在真实 4 节点运行后因缺真实终门时间线
与 worker 等待/提交/终局观测而判失败；现把这些观测在真实前沿（boundary==消息数）落盘
（`records/timing-worker-*.json`：会话首请求、首写步真实 sleep 窗口、submit 步、终局文
本的前沿签发；`records/timing-main-gate-*.json`：前沿请求由最终 step 新消费终门转移回
执、新产出该门键时；历史 resume 重放与重放循环重建的旧门不写；均先写者胜，重放/传输
重试不改写），采集器经 `collect_terminal` 按身份对上后原样消费，缺证据或失序观测仍按
原判据失败。验收目标是[可观察行为的双模拟](../../../docs/next-language/expectations.md#cca-代表性目标)，
不是内部状态快照字段全等；本次只报告实测的业务完成与终态一致，不证明全轨迹双模拟。

压缩/意图工作树的原生全量实测（macOS 开发机，冻结依赖）：lane `r128c` 于基线 `0a25488` 之上运行，`result.json` status=ok、problems=[]；27 个 worker（analysis 15 / eqclass 12）全部提交且终局接受（27/27），Analysis 接受 130、EqClass 接受 128（终图 130 节点/260 边，`final_obligation`=128，与初始 spec 义务一致），27 个真实 sleep 等待零 overshoot、最大成对重叠 2437739000 ns。被测树 = `0a25488` + 52 个修改/新增路径（sha256 清单 `c06f06f24e578b8b5934e357db357ee3d1c26c6039de8cb5df2387acbbd6b0ad`，公式：sorted-uniq 路径串接 `path+NUL+sha256(file).hexdigest+newline` 后整体 sha256）；当时的 SUT/Pilot 经 `CCA_MOCK18A_SUT`（`intent-deployment-d0fa23d41`）与旧 `CCA_MOCK18A_PILOT`（`gate-latency-mock-148`）显式提供（pilot 依赖现已全部由入库 adapter 替换，该环境变量已移除）。该原生实跑验证的是合并前旧树；合并后（入库 adapter 基座 + 压缩/意图特性）代码已变更，需新的原生实跑重新钉版本。该实跑仅在本机 macOS 完成，不声明 Linux 实跑、不声明全轨迹双模拟或覆盖率数字。

战役结论记录（2026-11-20，用户验收口径经 a688 转达，含事实边界与后续计划存档）：
[`../../docs/cca-moc18a/campaign-conclusion-2026-11-20.md`](../../docs/cca-moc18a/campaign-conclusion-2026-11-20.md)。
