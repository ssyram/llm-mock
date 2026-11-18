// 函数帧新鲜度验证 + trace 标记（业务内容）：with 传入 index/local。
import { readFileSync } from 'node:fs';

const envelope = JSON.parse(readFileSync(0, 'utf8'));
const args = envelope.with ?? {};
if (args.local !== 'fresh') throw new Error('imported frame is not fresh');
process.stdout.write(JSON.stringify({ result: 'fresh', values: { mark: `seen-${args.index}` } }));
