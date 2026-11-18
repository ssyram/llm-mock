// user 输入判决（否定优先）：subject 在 pointer 指向的 user 消息。
import { readFileSync } from 'node:fs';

const envelope = JSON.parse(readFileSync(0, 'utf8'));
const transcript = JSON.parse(readFileSync(envelope.transcript, 'utf8'));
const message = transcript.request.context.messages[envelope.pointer];
const text = typeof message?.content === 'string' ? message.content : (message?.content ?? []).map(block => block.text ?? '').join(' ');
const negative = /(?:不|别|勿|无须|无需|取消|停止)[^，。,.!?\n]{0,16}修复|\b(?:do not|don't|never)\b[^,.!?\n]{0,20}\b(?:fix|repair)\b/i.test(text);
process.stdout.write(!negative && /修复|\b(?:fix|repair)\b/i.test(text) ? 'pass' : 'fail');
