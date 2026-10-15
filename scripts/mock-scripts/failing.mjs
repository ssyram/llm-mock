#!/usr/bin/env node
// 错误路径 mock：恒定输出 {"error":{status,code,message}}，验证 server 把
// 脚本错误映射为协议可见的 HTTP 错误响应，而不是静默降级。
//
// 用法：node failing.mjs [--status=N] [--code=STR] [--message=STR]
//   stdin : {"api","keyId","model","sessionSignal","request"}
//   stdout: {"error":{"status","code","message"}}
import { readFileSync } from "node:fs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const status = Number(opt("status", "429"));
const code = opt("code", "mock_failure");
const message = opt("message", "intentional mock failure");

try {
  JSON.parse(readFileSync(0, "utf8"));
} catch (e) {
  process.stderr.write(`failing: cannot parse stdin JSON: ${e}\n`);
  process.exit(1);
}

process.stdout.write(JSON.stringify({ error: { status, code, message } }));
