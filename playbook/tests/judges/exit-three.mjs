#!/usr/bin/env node
// 测试 judger：模拟故障进程 —— 非零退出且 stderr 给出理由（进诊断消息）。
import fs from "node:fs";
fs.readFileSync(0, "utf8");
process.stderr.write("judger reason: malformed internal state\n");
process.exit(3);
