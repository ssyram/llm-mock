# 开源发布脱敏与仓库准备审计

状态：脱敏与验证完成；本文随首次完整提交入库。仅发布脱敏后的当前树，不 push，不修改 src。

## 授权与边界

- Owner 已批准公开发布与首次完整提交；实际根目录没有 Git，已获补充授权 git init。
- 私有 working-stack、workflow 编排历史及可再生的转录型测试产物排除发布；直接读取的 property fixture 保留并脱敏。
- 下列清单使用 provider-a/provider-b 与 <repo>/<pi-mono> 占位，不在审计报告重新披露身份。

## 敏感清单（逐项）

| 路径 | 文件数 | 敏感度 / 判断 | 处置 |
|---|---:|---|---|
| `.pi/` | 2 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-b-glm-5.3-13/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-b-glm-5.3-14/` | 5 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-b-glm-5.3-15/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-MiniMax-M3-16/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-MiniMax-M3-17/` | 5 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-claude-opus-5-3/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-claude-opus-5-4/` | 5 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-claude-sonnet-5-1/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-claude-sonnet-5-2/` | 5 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-deepseek-v4-pro-5/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-deepseek-v4-pro-6/` | 5 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-glm-5.2-7/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-glm-5.2-8/` | 5 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-kimi-k3-10/` | 5 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-kimi-k3-9/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-minimax-m3?-11/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b3-provider-a-minimax-m3?-12/` | 5 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-b-glm-5.3-10/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-b-glm-5.3-11/` | 4 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-a-claude-sonnet-5-1/` | 4 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-a-claude-sonnet-5-2/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-a-claude-sonnet-5-3/` | 4 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-a-deepseek-v4-pro-13/` | 4 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-a-deepseek-v4-pro-4/` | 4 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-a-deepseek-v4-pro-5/` | 4 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-a-glm-5.2-12/` | 4 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-a-glm-5.2-6/` | 4 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-a-glm-5.2-7/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-a-kimi-k3-8/` | 4 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-b4-provider-a-kimi-k3-9/` | 4 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-capture-sample/` | 37 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-claude/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-claude2/` | 5 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-glm5/` | 6 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.tmp-corpus-glm52/` | 5 | 高：原始提示、模型/工具输出、thinking/signature、会话标识、时间、机器路径及运行日志 | 忽略；本地保留 |
| `.working-stack/` | 124 | 高：私有任务/会话及内部 Git 状态 | 忽略；本地保留 |
| `target/` | 25251 | 中：编译产物、路径与调试信息 | 忽略；本地保留 |
| `tests/canonical-o18-build-finding.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/canonical-o18-cargo-build.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/canonical-o18-cargo-check.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/canonical-o18-cargo-test-first-rerun.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/canonical-o18-cargo-test.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/canonical-o18-node-port-finding.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/canonical-o18-node-unit.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/canonical-o18-old-binary-finding.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/canonical-o18-results.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/canonical-o18-validation.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/canonical-o18-wire-results.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-cargo-build.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-cargo-test-rerun.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-cargo-test.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-node-all.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-node-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-node-serial.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-node-unit.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-property-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-property-rerun.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-property-stable.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-property.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-readonly-hashes.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-validation.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-wire-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/f4-p1-wire.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-before.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-build-validation.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-cargo-build.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-cargo-check.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-cargo-test.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-duality-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-duality.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-final-run-validation.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-fuzz-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-fuzz-verify-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-fuzz-verify.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-fuzz.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-node-all-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-node-all.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-node-check-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-node-check.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-node-rerun.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-node.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-property-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-property.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-run-validation.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/final-four-validation.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-all-unit-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-all-unit.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-artifact-hashes.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-before.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-final-exit.txt` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-final-run.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-final-run.pid` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-generator.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-regression-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-regression.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-results.jsonl.gz` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-run.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-run.pid` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-scope-check.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-smoke.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-summary.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-unit.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-validation.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-verify-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-verify-first-fixed.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/fuzz-expand-verify-first.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/matrix-ten-fuzz.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/matrix-ten-results.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/matrix-ten-run.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/matrix-ten-smoke.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/property-first-run-results.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/property-oracles.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/property-results.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/property-run.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/property-unit.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/property-validation.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-adc-probe.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-all-node.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-baseline.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-before.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-cargo-build.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-cargo-check.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-cargo-test.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-fmt-initial.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-fmt.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-matrix.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-node-test.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-scope.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-summary.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-validation.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-variants.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/transport-unblock-variants.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-artifact-hashes.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-baseline.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-duality-expanded-retry.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-duality-expanded.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-duality-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-duality-first-results.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-duality-first.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-duality-second.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-fuzz-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-fuzz-first.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-fuzz-results.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-fuzz-second.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-ledger.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-results-ledger.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-rule-audit.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-unit-expanded.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-unit-final.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-unit-second.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-unit.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w06-validation.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-baseline.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-before-hashes.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-build.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-cargo-test.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-check.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-duality.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-final-inventory.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-fuzz.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-ledger.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-results-ledger.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-unit.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-validation.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-wire-results.json` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `tests/w08-wire.log` | 1 | 高/中：历史证据可能含完整转录、路径、标识、时间，非测试输入 | 忽略；可再生 |
| `scripts/advance-mock.workflow.js` | 1 | 高：私有任务 prompt、机器路径及 provider 配置名 | 忽略 |
| `scripts/final-fix.workflow.js` | 1 | 高：私有任务 prompt、机器路径及 provider 配置名 | 忽略 |
| `scripts/fix-matrix.workflow.js` | 1 | 高：私有任务 prompt、机器路径及 provider 配置名 | 忽略 |
| `scripts/mount-batch.workflow.js` | 1 | 高：私有任务 prompt、机器路径及 provider 配置名 | 忽略 |
| `scripts/owner-rulings.workflow.js` | 1 | 高：私有任务 prompt、机器路径及 provider 配置名 | 忽略 |
| `scripts/parallel-invert.workflow.js` | 1 | 高：私有任务 prompt、机器路径及 provider 配置名 | 忽略 |
| `scripts/spec-unify.workflow.js` | 1 | 高：私有任务 prompt、机器路径及 provider 配置名 | 忽略 |
| `scripts/spec-unify2.workflow.js` | 1 | 高：私有任务 prompt、机器路径及 provider 配置名 | 忽略 |
| `scripts/test-wave2.workflow.js` | 1 | 高：私有任务 prompt、机器路径及 provider 配置名 | 忽略 |
| `scripts/user-return.workflow.js` | 1 | 高：私有任务 prompt、机器路径及 provider 配置名 | 忽略 |
| `scripts/w06-w07.workflow.js` | 1 | 高：私有任务 prompt、机器路径及 provider 配置名 | 忽略 |
| `mounts.json` | 1 | 高：本机持久挂载命令/绝对路径 | 忽略 |
| `tests/node_modules/` | — | 中：第三方依赖及缓存，非发布源码 | 忽略；lockfile 保留 |
| `captures/`、`sessions/` | 当前根目录未发现 | 高：未来捕获及会话正文 | 预防性忽略 |

## 文档 / 源码 / fixture 审阅清单

| 文件 | 初扫标记 | 处置状态 |
|---|---|---|
| `docs/design/mock-llm-server/admin.md` | 认证语法×2 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/api/anthropic-messages.md` | 机器路径×2、时间×7、认证语法×16 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/api/bedrock.md` | 机器路径×2、时间×2、认证语法×15 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/api/family-variants.md` | 机器路径×3、时间×1、认证语法×16 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/api/google-generative-ai.md` | 认证语法×4 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/api/mistral.md` | 机器路径×1、认证语法×4 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/api/openai-completions.md` | 机器路径×2、认证语法×9 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/api/openai-responses.md` | 认证语法×13 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/api/pi-messages.md` | 机器路径×2、认证语法×9 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/architecture.md` | 认证语法×3 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/bedrock-transport.md` | 机器路径×2、认证语法×16 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/corpus-batch3.md` | 私有 provider×55、认证语法×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/corpus-batch4.md` | 机器路径×1、私有 provider×29、认证语法×5 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/corpus-capture.md` | 机器路径×5、私有 provider×8、会话 UUID×4、时间×3、认证语法×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/definition-freeze.md` | 机器路径×2、时间×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/duality-harness.md` | 时间×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/f4-p1-resolution.md` | 机器路径×1、认证语法×2 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/final-four.md` | 机器路径×1、时间×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/final-ledger.md` | 机器路径×1、时间×3 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/fix-rust.md` | 机器路径×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/freeze-verdict-2.md` | 机器路径×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/freeze-verdict.md` | 机器路径×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/fuzz-expand.md` | 时间×2 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/fuzz.md` | 机器路径×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/hands-on-tutorial.md` | 机器路径×9、时间×1、临时引用×36、认证语法×16 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/irreversibility-atlas.md` | 机器路径×1、时间×2、认证语法×3 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/matrix-ten.md` | 时间×1、认证语法×7 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/mistral-microfix.md` | 机器路径×14、时间×4、认证语法×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/mock-scripts.md` | 时间×2、临时引用×5、认证语法×3 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/mount-routing.md` | 时间×1、认证语法×3 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/o18-resolution.md` | 机器路径×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/property-tests.md` | 机器路径×1、时间×2 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/slots-mirror-pi.md` | 机器路径×1、认证语法×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/test-angles-e2e.md` | 机器路径×1、时间×2、临时引用×17、认证语法×56 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/transport-unblock.md` | 机器路径×2、认证语法×4 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/tutorial-freshrun.md` | 机器路径×9、临时引用×15 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/w06-experiments.md` | 机器路径×1、时间×1 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/w07-implementation.md` | 机器路径×1、时间×4 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/design/mock-llm-server/w08-match.md` | 机器路径×1、认证语法×2 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `docs/research/mock-llm-server-research.md` | 时间×2、认证语法×7 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `tests/canonical-bedrock-reasoning.mjs` | 时间×2 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `tests/canonical-encode-thinking.test.mjs` | 认证语法×1 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `tests/corpus.mjs` | 私有 provider×17 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `tests/final-four.test.mjs` | 认证语法×3 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `tests/fuzz-message-generator.mjs` | 私有 provider×2 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `tests/harness.mjs` | 认证语法×1 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `tests/models-shared.mjs` | 认证语法×2 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `tests/property-report.mjs` | 机器路径×1 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `tests/smoke.mjs` | 认证语法×1 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `tests/transport-unblock.test.mjs` | 认证语法×1 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `tests/vertex-adc-fixture.mjs` | 认证语法×1 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `tests/w08-oracles.test.mjs` | 时间×2 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `tests/w08-wire-checks.mjs` | 认证语法×3 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/anthropic_messages/decode.rs` | 认证语法×8 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/anthropic_messages/decode_tests.rs` | 认证语法×2 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/azure_openai_responses/decode.rs` | 认证语法×9 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/azure_openai_responses/tests.rs` | 时间×2、认证语法×7 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/bedrock_converse_stream/decode.rs` | 认证语法×3 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/bedrock_converse_stream/decode_gap_tests.rs` | 时间×2 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/bedrock_converse_stream/tests.rs` | 认证语法×1 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/bedrock_converse_stream/transport_tests.rs` | 认证语法×6 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/google_generative_ai/decode.rs` | 认证语法×2 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/google_generative_ai/decode_tests.rs` | 认证语法×2 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/google_vertex/decode.rs` | 认证语法×7 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/google_vertex/tests.rs` | 认证语法×4 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/mistral_conversations/decode.rs` | 认证语法×3 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/mistral_conversations/tests.rs` | 认证语法×3 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/openai_codex_responses/decode.rs` | 认证语法×1 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/openai_codex_responses/tests.rs` | 认证语法×4 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/openai_responses/decode.rs` | 认证语法×2 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/openai_responses/request_headers.rs` | 认证语法×7 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/openai_responses/tests.rs` | 认证语法×6 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/pi_messages/decode.rs` | 认证语法×6 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/pi_messages/decode_tests.rs` | 认证语法×9 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/api/slots_mirror_pi_tests.rs` | 认证语法×7 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/bearer.rs` | 认证语法×31 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/lib.rs` | 认证语法×1 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/mounts/codex_websocket.rs` | 认证语法×2 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/mounts/protocol.rs` | 认证语法×9 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/mounts/routing.rs` | 认证语法×6 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/mounts/routing_tests.rs` | 认证语法×7 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/mounts/transport.rs` | 认证语法×11 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `src/server.rs` | 认证语法×1 | 已复核：协议字段/本地合成 fixture，未发现真实凭据；src 未修改 |
| `scripts/mock-scripts/verify-mount.sh` | 时间×1、临时引用×1、认证语法×11 | 已复核：文档身份/路径/采集标识已占位；认证字段仅协议语法或本地合成值 |
| `tests/property-baseline.json` | 直接读取的 fixture；JSON 顶层 dict | 已保留形状；路径/采集元数据已占位，合成回归 payload 保留；消费测试通过 |
| `tests/property-p1-counterexamples.json` | 直接读取的 fixture；JSON 顶层 dict | 已保留形状；路径/采集元数据已占位，合成回归 payload 保留；消费测试通过 |

## .gitignore（原样）

```gitignore
# Private working state and captured conversations
.working-stack/
.pi/
.tmp-*/
**/.tmp-*
**/.pi/mock-corpus/
captures/
mounts.json
sessions/
*.log
*.pid
.DS_Store

# Build output and dependencies
node_modules/
target/

# Private orchestration history
scripts/*.workflow.js

# Regenerable historical evidence may contain complete real transcripts
/tests/*.json
!/tests/package.json
!/tests/package-lock.json
!/tests/property-baseline.json
!/tests/property-p1-counterexamples.json
/tests/*.jsonl
/tests/*.jsonl.gz
/tests/*-exit.txt
```

## 处置记录

- 忽略规则先于 `git init` 和任何暂存生效；未删除原始语料、私有状态或外部临时文件。
- 35 个语料目录及 `.pi/` 共扫描 213 个文件：本机路径命中 573 次、私有 provider 568 次、UUID 97 次、会话/采集时间 1174 次；强密钥模式命中文件 0（不是不存在凭据的绝对证明）。
- 所有将入库文本扫描包含本机路径/用户名、私有 provider、UUID、长调用标识、API key/token/JWT/PEM 形态和认证赋值；原始值不写进本报告。
- `corpus-batch3.md` / `corpus-batch4.md`：匿名化 provider、目录、调用标识及路径；保留角色、块数、签名载体、错误码、thinking 级别和统计。
- `corpus-capture.md`：替换真实 session UUID、采集时间、provider、本机路径，以及用户提示/最终回答的无关正文；保留 schema、对应关系、权限和捕获正确性断言。
- `hands-on-tutorial.md` / `tutorial-freshrun.md` / `test-angles-e2e.md`：本机路径→`<repo>`，用户→`<user>`，会话/错误引用匿名化，HTTP date 合成化；保留 round/tool/error 合成输出与 HTTP/SSE 技术证据。执行前必须替换路径占位，原始本机时间/身份不可复原。
- property 报告原真实错误正文改为合成等价措辞、原工具调用 ID 改为合成 ID；随后以无私有语料模式实跑，`property-tests.md` 更新为本次公开合成输入统计。原私有语料历史聚合仍见 `final-four.md`。
- fuzz 报告以本次默认 800-seed、十协议公开合成输入重生成，保留 16000/16000 聚合结果。新报告中的运行时间仅为验证元数据，不是原始会话时间。
- 全部文档机器引用统一 `<repo>` / `<pi-mono>`。协议本身的版本日期（例如 beta header 值）保留原样，不能当作会话时间脱敏；公开的锁定上游 commit/hash 也保留。
- `tests/corpus.mjs` 使用匿名/示例目录，逐场缺失输出 `SKIP corpus/<case>` 与总计；不重命名/读取原私有目录。部分语料集仅执行已提供场次，现存目录内无 JSONL、多 JSONL、非法 JSON 仍失败。
- `tests/corpus-synthetic.mjs` 仅搬出既有合成构造器，使变更文件各自单责且不超过 200 行有效代码；case 形状/断言不变。
- `tests/canonical-o18-replay.test.mjs` 仅在九条私有 reply 不齐时显式 skip，合成 encode/parser 验证不跳过。
- `tests/fuzz-message-generator.mjs` 两个私有 cross-model provider 名改成 provider-a/provider-b；随机数顺序、模型、消息和值不变。
- `tests/property-baseline.json` 保留 460 条路径→hash 形状；路径改用 `<repo>` / `<pi-mono>`，`tests/property.mjs` 按仓库位置解析后消费，采集元数据用合成日期。`property-p1-counterexamples.json` 的 24 条均为命名合成/固定 seed 输入，保留完整结构及差异，仅采集日期合成化；未用占位正文破坏断言。
- README 中 824 绿明确标为历史私有语料结果，补充无语料 skip、合成 fuzz、Node ≥23 及同级锁定 pi-mono 依赖，并链接本审计。
- 新增 `tests/corpus.test.mjs` 三项：18 场全缺失、有部分语料、存在但损坏。不存在以 skip 隐藏损坏语料的兜底。

## 外部 /tmp 引用物

只读检查，不复制、不打包，不写项目外路径。文档保留通用可复现的 `/tmp/mock-*` 工作目录名称，不保留私有正文：

| 引用 | 本地文件数 | 敏感度 / 判断 | 处置 |
|---|---:|---|---|
| `/tmp/mock-pi-e2e/` | 48 | 高：本机路径 40 处、UUID 18 处；含 session/capture/config/log | 不在 Git 根下；不导入；必要文档片段已脱敏 |
| `/tmp/mock-e2e-angles/` | 99 | 中/高：本机路径 1 处；黑盒合成脚本、请求与日志 | 不导入；保留匿名技术结论 |
| `/tmp/e2e-name/` | 10 | 中/高：UUID 2 处；合成挂载验证产物 | 不导入 |
| `/tmp/mock-pi-e2e-2/` | 0（不存在） | 低：教程建议的全新隔离目录 | 仅保留通用示例引用 |

上述已存在临时引用物强密钥模式命中文件均为 0。没有读取/修改外部认证存储，也没有调用外网模型。

## 认证形态判断

- `Authorization`、`Bearer`、`apiKey`、`x-api-key`、`sk-ant-oat` 是协议字段/前缀，不是完整真实 key；保留技术信息。
- `duality`、`test`、`roundtext`、`roundtool`、`failtest`、`respmock`、`pimock`、`mockpi-key`、`selftest` 等仅发往 loopback，均为人为合成路由值。
- `tests/models-shared.mjs` 的 Codex JWT 由本地固定虚构 account claim 构造，签名段为 `mock`，没有真实账户凭据。
- `tests/vertex-adc-fixture.mjs` 运行时生成临时 RSA，使用 `mock.invalid`；源码不含私钥字面量，finally 删除临时 ADC。服务不校验该合成认证，不可用于云服务。
- `src/**` 中认证解析和本地合成单测原样保留；103 个源文件哈希与开工快照一致。

## 验证结果

| 命令 / 检查 | 退出码 | 结果 |
|---|---:|---|
| `cargo build` | 0 | 当前服务二进制成功构建 |
| `cargo test` | 0 | 133 pass / 0 fail；bin/doc tests 也通过 |
| `node --test tests/corpus.test.mjs tests/property-request-projection.test.mjs tests/property.test.mjs` | 0 | 33 pass / 0 fail（含合成回归 fixture 消费） |
| `node --test --test-concurrency=1 tests/*.test.mjs` | 0 | 103 tests：102 pass / 0 fail / 1 skip；skip 为 O18 私有语料，Codex scalar domain 通过 |
| `node tests/duality.mjs` | 1 | 364 pass / 4 既有拒收 finding；0 loaded / 18 corpus sessions skipped |
| `node tests/fuzz.mjs` | 0 | 默认 800 seeds × 10 协议 × Q/R = 16000 green；0 boundary / 0 finding / 0 crash |
| `node tests/fuzz-expand-verify.mjs` | 0 | 16000 evidence rows / unique keys；320 shape-direction-vision buckets，各 50；全 green |
| `node tests/property.mjs` | 1 | completed；645 pass / 89 findings；无私有语料；460 条 baseline 路径成功解析读取；finding 不算成功 |
| README 双语 Markdown 本地链接 | 0 | English 3、中文 4 个目标均存在，含双语互链与本审计 |
| README 外链 `curl -IL` | 0 | GitHub pi 与 zstd 官方站均 HTTP 200 |
| 候选入库文本敏感扫描 | 0 | 私有身份/本机 home 路径/强 key 形态无命中；认证短值逐项复核为合成 |
| `src` SHA256 对照 | 0 | 103/103 文件未变；开工路径/hash 字典排序 JSON 的 SHA256=`4c486bfa92233c58b2263d14f60efd4a493a94baae024b34b0e9d32d65e3c083` |
| 变更 JS `node --check` / 有效 LOC | 0 | 7 个变更/新增 mjs 均语法通过，单文件有效代码 44–187 行 |
| 忽略规则探针 | 0 | 13/13 私有路径/产物均匹配，审计内 .gitignore 与根文件逐字相同 |
| 首次全树 `git diff --cached --check` | 2 | 原有 src 三处 EOF 空行、未变更 tests 三处空白问题；不为发布脱敏修改生产源码/无关文件。变更文件单独 whitespace 检查通过 |

初次并行运行的 Node/duality/fuzz 因既有 harness 优先复用 8799、以及共享服务端口占用失败；已按串行重跑，未为此改动 harness 或 src。初次失败不当作内容通过，以上为最终串行结果。

### duality 四个历史拒收：逐案对照

历史基线 `tests/final-four-duality-final.log` 的 `FAIL` 主键集合与本次 `.tmp-release/duality-rerun.log` 完全相等，集合大小均为 4；私有语料排除导致总数从 828 变为 368，不是丢弃合成红案。交叉依据：[final-four.md §1–§2](final-four.md)、[f4-p1-resolution.md](f4-p1-resolution.md)。

| 案例 | 本次现象 | 历史对应 / 定性 |
|---|---|---|
| `openai-responses/req/w06-unicode-session` | ByteString 转换拒绝，capture=0 | final-four §1 同名案：客户端 header 外部边界 |
| `openai-codex-responses/req/w06-unicode-session` | ByteString 转换拒绝，capture=0 | final-four §1 同名案：客户端 header 外部边界 |
| `mistral-conversations/req/w06-unicode-session` | ByteString 转换拒绝，capture=0 | final-four §1 同名案：客户端 header 外部边界 |
| `openai-codex-responses/req/w06-surrogate-order` | `invalid JSON body: unexpected end of hex escape`，HTTP 400 / capture=0 | final-four §1/§2：本仓库标量字符串定义域明确拒收；不是外部传输问题 |

监督方已批准发布时保留四红、如实披露；不修改 runner 分类、不换输入、不弱化断言，不把定义域拒收计为 pass。因此不声称全矩阵全绿；未发现脱敏引入的新红。

## Git 发布边界与交付

- 首次完整提交 message：`release: LLM Mock with Pi-Message`；本报告随该提交入库。精确提交 ID 使用 `git log -1 --format=%H` 查询，避免在自引用报告中嵌入会变化的自身 hash。
- 作者元数据决定：监督方批准首提交及后续本仓库提交使用公开 GitHub noreply 身份 `ssyram <ssyram@users.noreply.github.com>`；每次用 `git -c user.name=… -c user.email=…` 指定，不读取/发布私人邮箱，不改全局配置。该账号名是经批准的公开归属，不是漏脱敏的本机路径。Owner 如需改身份可另行决定重写作者信息。
- 暂存前核验所有忽略类别，审查完整 `git ls-files` 清单；本地私有原件和生成日志不入库。提交后核验暂存区与工作树为空，remote 未配置，未 push。
- 完整初始提交包含原有 Rust、测试、脚本、协议文档等应发布文件；不是只提交脱敏 diff。源码哈希不变证据区别于“首次提交全为新增”的 Git 显示。
- 独立 reviewer gate 仍必需；本报告是实施证据，不是作者自批准发布。
- 根目录未提供 LICENSE；本任务未代 owner 选择许可证。公开 GitHub 仓库不自动授予开源许可，正式对外发布前需 owner 确认。

## 剩余风险

- 历史文档无法证明完美语义脱敏：模型公开名称、协议行为、块长度/角色计数、聚合统计、合成工具内容等保留以维护技术证据；身份、原会话标识、采集时间和无关原始正文已替换。不再可按逐字原始输出复验。
- 自动模式扫描不能证明不存在所有秘密、编码凭据或上下文关联；需要独立 reviewer 审阅后再公开。
- 被忽略文件仍在本机，不能直接打包工作目录、复制 /tmp 证据或使用 `git add -f`。未来捕获/重跑可能把真实内容重新写入生成报告，发布前需重新审查。
- 真实语料与历史生成 JSON/log/gzip 不分发；历史报告对这些文件的引用是来源索引，不保证新 clone 可打开。匿名 corpus 路径不是原私有目录迁移；若自行提供语料，必须先审查并按示例目录布局放置。
- TypeScript 验证仍依赖同级锁定 pi-mono checkout/依赖与 Node ≥23；不是自包含 npm 测试包。zstd 为 Codex 压缩路径可选环境依赖。
- 全矩阵四个既有红案及 property 89 个当前合成输入 findings 保留，不作为全绿承诺。发布准备未扩展为生产逻辑修复。
