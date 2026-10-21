# Admin — 运行时注册端点（mock-2）

> `/workflow` §4.2 + `/qpdi` Q/D 结构。上游：`architecture.md`（M3 registry & matcher、I_2 注册入口、D3）。
> 状态：mock-2 实现产出，与 `src/registry.rs` / `src/server.rs` 同步；curl 示例均经端到端 smoke 验证。

本页旧 Q.I/Q.A/Q.E 标签及 M3/I_2/D3 引用保留历史 mock-2 的组织方式，不作为现行 QPDI 分类。现行问题意识见 [principles.md](principles.md)，根性质与组合设计见 [architecture.md](architecture.md)；历史行号和测试计数不自动代表当前覆盖。

## Task Overview

把「注册入口」从启动时的静态 `registry.json` 扩展为运行时 HTTP admin 面：server 存活期间可注册/查询/删除 mock 条目，替代「仅启动时 registry.json」。四个协议路由的行为契约（恰一命中 / 404 / 409 / 401 / 协议内可见错误）**逐字不变**——`process` 仅把匹配结果从索引改为 snapshot，语义等价。

- Q.I（是什么）：`POST/GET/DELETE /__admin/entries` 三个端点 + `Registry` 的 `add/list/remove` API（`std::sync::RwLock<Vec<Entry>>` 内部可变性）。
- Q.A（为什么）：mock 场景需要在不重启 server 的情况下迭代脚本（先宽后窄渐进注册）；重启丢失会话外上下文、拖慢 harness 回放循环。
- Q.E（怎么验证）：`src/registry.rs` 内 9 个单元测试（变更语义）+ 端到端 smoke（admin 增删 ↔ 协议路由 201/409/418/404/400 全路径）。

## 端点契约

统一前缀 `/__admin/entries`；JSON 体 = `registry.rs` 中 `Entry` 的 serde 形状（与 registry.json 里 `entries[i]` 完全同形）：

```json
{"keyId":"test-a","matcher":{"type":"textIncludes","value":"deploy"},
 "reply":{"type":"error","status":429,"code":"rate_limited","message":"slow down"}}
```

| 方法 | 语义 | 请求体 | 成功 | 失败 |
|---|---|---|---|---|
| `POST` | 追加一条 entry | `Entry` | `201`，响应体 = 存储的 entry | `400 invalid_entry`（非法 JSON / 未知 matcher、reply 变体） |
| `GET` | 全量快照 | 无 | `200 {"entries":[…]}`（注册顺序） | — |
| `DELETE` | 按完整形状相等删除 | `Entry` | `200 {"removed":N}`；同形状重复注册一并删除 | `404 entry_not_found`（N=0）；`400 invalid_entry` |

错误体统一为 `{"error":{"code":…,"message":…}}`（admin 面自有形状，不做协议映射）。

**认证**：admin 面不要求 KeyID（本地测试面；server 只绑定 `127.0.0.1`）。协议路由的 401 `missing_key` 语义不变。

**注册校验语义（懒惰校验，与种子文件一致）**：
- 不做 matcher 冲突拒绝：同 keyId 下允许共存的 matcher 组合注册（理由见下节）。
- 不验证 `reply.file` 路径存在/可解析：文件错误在请求期以协议内可见 `500 reply_file_unreadable / reply_file_invalid` 暴露。
- admin 变更是**内存态**：不回写种子文件，重启回到 `--registry` 种子内容。

## 并发语义

- `Registry { entries: RwLock<Vec<Entry>> }`：`add/remove` 取写锁，`match_key/list` 取读锁；锁在方法内获取并释放，**绝不跨 await 持有**（handler 内无持锁 await 路径），故 `std::sync::RwLock` 足够，无需 tokio 异步锁。
- 读写比假设：协议请求（读）远多于 admin 调用（写），单进程单实例，无跨进程共享。
- **匹配→执行无 TOCTOU**：`match_key` 在读锁内返回命中条目的 owned snapshot（`MatchOutcome::One(Entry)`），`execute(&entry)` 在锁外执行；并发的 add/remove 不会造成索引漂移、错条目执行或越界 panic。这是对 mock-1「索引直取」的加固——索引方案在可变更后存在 shift 竞态。
- 删除按全形状相等（`Vec::retain`），O(n) 线性扫描；规模假设：本地测试 registry（条目数 ≪ 1e4），与 `match_key` 同量级，可接受。
- 同一 Entry 形状注册 N 次 → `list` 出现 N 条、一次 `DELETE` 全删（`removed:N`），删除幂等。

## 与 409 歧义原则的关系（M3 / I_2）

- **请求期「恰好命中一个」原则不变**：`match_key` 对同 keyId 命中 ≥2 条时返回 `Ambiguous(count)`，协议路由回 `409 ambiguous_match`；匹配确定性（同输入同结果）不变。
- **注册期刻意不重演该原则**：注册不拒绝重叠 matcher。理由：mock 场景常需「any 兜底 + textIncludes 细分」渐进构造，注册期拒绝重叠会把注册顺序变成隐式契约；歧义留给请求期一次性、确定性地暴露，错误面更小且可观测（409 直接指出 keyId）。
- I_2 表述更新：破坏恰一原则的入口从「静态构建」扩展为「静态种子 + 运行时 `add`」，但破坏代价仍被请求期 409 兜住——invariant 本体不动，只是新增了一个产生待检集合的入口。

## 不变量（增补）

- I_3：admin 变更对协议请求**立即线性可见**——任一 admin 调用返回后，后续协议请求的匹配结果必须反映该变更（RwLock 内存可见性保证）。
- I_4：match 与 execute 之间无索引耦合（snapshot 语义）；并发注册/删除不产生错条目执行或 panic。
- 种子文件格式不变（`{"entries":[…]}`）；`--registry` 由必需种子变为可选种子（缺省空 registry；种子存在但解析失败仍启动即报错退出——配置错误 fail-fast，不被 admin 可用性掩盖）。

## curl 速查

```sh
# 注册（201，响应体 = 存储的 entry）
curl -s -X POST http://127.0.0.1:8787/__admin/entries \
  -H 'content-type: application/json' \
  -d '{"keyId":"test-a","matcher":{"type":"any"},"reply":{"type":"error","status":429,"code":"rate_limited","message":"slow down"}}'

# 查询（200 {"entries":[…]}）
curl -s http://127.0.0.1:8787/__admin/entries

# 删除（200 {"removed":1}；形状必须与注册时逐字段相等）
curl -s -X DELETE http://127.0.0.1:8787/__admin/entries \
  -H 'content-type: application/json' \
  -d '{"keyId":"test-a","matcher":{"type":"any"},"reply":{"type":"error","status":429,"code":"rate_limited","message":"slow down"}}'

# 联动：注册后立即以该 KeyID 发协议请求
curl -s -X POST http://127.0.0.1:8787/v1/chat/completions \
  -H 'authorization: Bearer test-a' -H 'content-type: application/json' \
  -d '{"model":"gpt-test","messages":[{"role":"user","content":"hello"}]}'   # → 429 协议内错误
```

## 范围与非目标

- 未实现：按 id 寻址（单条 GET / DELETE-by-id）、持久化回写 registry.json、admin 认证 token。引入条件：出现真实需要（如条目数大到全形状删除不可用、CI 需要重启存活）。当前按需后置，不预设脚手架。
- admin 无认证依赖「仅绑定 loopback」这一部署前提；若未来监听非 loopback，必须先加最小 token 门禁。
