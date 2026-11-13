#!/usr/bin/env node
// 测试用故障程序：非零退出（aggregator/segment 程序故障必须硬停，
// 绝不 fallback）。stderr 理由进入诊断消息。
process.stderr.write("injected program failure for tests\n");
process.exit(3);
