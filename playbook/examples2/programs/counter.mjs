#!/usr/bin/env node
// 内部计数器外接程序：stdin envelope（with.current/with.limit）→ stdout
// {values:{next}, result:"loop"|"done"}。确定性、无副作用。
let input = "";
for await (const chunk of process.stdin) input += chunk;
const envelope = JSON.parse(input);
const current = Number(envelope.with?.current ?? 0);
const limit = Number(envelope.with?.limit ?? 0);
const next = current + 1;
process.stdout.write(JSON.stringify({ values: { next }, result: next < limit ? "loop" : "done" }));
