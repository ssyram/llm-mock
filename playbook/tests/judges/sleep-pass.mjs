#!/usr/bin/env node
// 测试 judger：迟到才输出 pass，用于验证播放器的有限超时先杀进程。
import fs from "node:fs";
fs.readFileSync(0, "utf8");
setTimeout(() => process.stdout.write("pass\n"), 4000);
