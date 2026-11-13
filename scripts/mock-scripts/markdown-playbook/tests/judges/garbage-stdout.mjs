#!/usr/bin/env node
// 测试 judger：exit 0 但 stdout 不是 pass/fail —— 非法输出，必须是 error。
import fs from "node:fs";
fs.readFileSync(0, "utf8");
process.stdout.write("maybe\n");
