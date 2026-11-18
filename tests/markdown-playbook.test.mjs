// 框架测试入口薄壳：让 tests/run-suites.mjs 的自动发现（tests/*.test.mjs）
// 覆盖 playbook 模块随模块交付的单测（含 case matcher、
// affine/aggregator/segment 与 CCA result_ref 领域 kit 增量）。实际用例在
// playbook/tests/ 下四个文件。
import "../playbook/tests/playbook.test.mjs";
import "../playbook/tests/case-matcher.test.mjs";
import "../playbook/tests/affine-segments.test.mjs";
import "../playbook/tests/cca-scc.test.mjs";
