#!/usr/bin/env node
// 测试 judger：永远匹配。读掉 stdin（协议要求 envelope 可读），输出 pass。
import fs from "node:fs";
fs.readFileSync(0, "utf8");
process.stdout.write("pass\n");
