# CCA 原生 OpenCode Mock（实验接入）

`main.md`、`worker.md` 和 `aux.md` 由 `mock2.mjs` 解释；`adapter/` 全部依赖已入库代码
（本仓库 + CCA 框架内的 `cca_bench`），不再 import 任何私有 `pilot.*` 库。运行前需按
「机器前置条件」准备好本机外部件；一切产品根目录都是显式输入。

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
| `pilot.case_body` | `adapter/case_body.py` | 输入 spec → LevelParams/预算；字段取值只在普通随机模式生效（确定性模式被 `fixed_default_level` 压平），选择见代码注释 |
| `pilot.worker_wait`（WorkerBook/DeltaBook 等待语义） | `adapter/worker_wait.py` | 剔除剧本内嵌 draw-sleep bash 步，首写步签发时 armed `pending_wait_ns`，worker_step 在真实前沿消费并落双域时钟窗口；磁带命中时 `planned_sleep_ns` 与之一同源（原 `sleep_for` 语义） |
| `pilot.machine.PilotMainScript` | `adapter/main_intent.py`（`IntentMainScript`） | cca_bench `MainScript` 之上恢复 prepare 语义：A_PREPARE 内先写 `<W>/_cca_analysis/intent.md`（`cca_state reserve` 的任务包构建强依赖） |
| 原终态采集器 | `adapter/collect_run.py` | 终态采集/判定按 collector-feed 离线回归判据重建；`collect_terminal` 的证据 DeltaBook 换 `cca_bench.mock_delta.DeltaBook` |
| （测试内私有路径） | `tests/cca_scripts_path.py` + `tests/fixtures/input-spec.json` | 测试的 CCA 根经 `CCA_NEW_CCA_HOME`/`CCA_HOME` 显式给出；历史私有证据包经 `MOC18A_EVIDENCE_DIR` / `MOC18A_OLD_EVIDENCE_DIR` / `MOC18A_INPUT_SPEC` 显式给出，缺则该测试显式 skip（不造数据、不弱化断言） |

测试运行：`CCA_HOME=<框架根> python3 tests/<name>.test.py` 与
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
