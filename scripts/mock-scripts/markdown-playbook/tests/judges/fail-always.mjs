#!/usr/bin/env node
// 测试 judger：永远不匹配。读掉 stdin，输出 fail。
import fs from "node:fs";
fs.readFileSync(0, "utf8");
process.stdout.write("fail\n");
