// 框架测试入口薄壳：让 tests/run-suites.mjs 的自动发现（tests/*.test.mjs）
// 覆盖 markdown-playbook 模块随模块交付的单测（含 case matcher、
// affine/aggregator/segment 与 CCA result_ref 领域 kit 增量）。实际用例在
// scripts/mock-scripts/markdown-playbook/tests/ 下四个文件。
import "../scripts/mock-scripts/markdown-playbook/tests/playbook.test.mjs";
import "../scripts/mock-scripts/markdown-playbook/tests/case-matcher.test.mjs";
import "../scripts/mock-scripts/markdown-playbook/tests/affine-segments.test.mjs";
import "../scripts/mock-scripts/markdown-playbook/tests/cca-scc.test.mjs";
