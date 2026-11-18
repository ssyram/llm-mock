#!/usr/bin/env node
// 测试 judger：把收到的 envelope 原样落盘到 $MDP_JUDGE_DUMP（若设置），
// 供测试断言 context 前缀无未来消息、location/targets 字段形状。
import fs from "node:fs";
const envelope = fs.readFileSync(0, "utf8");
if (process.env.MDP_JUDGE_DUMP) fs.writeFileSync(process.env.MDP_JUDGE_DUMP, envelope);
process.stdout.write("pass\n");
