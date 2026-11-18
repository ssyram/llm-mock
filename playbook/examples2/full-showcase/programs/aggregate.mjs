// aggregation：从 Validation 入口（pointer=本 RV 首个回执下标）读完整 transcript，
// 核对两笔回执事实后立即返回（N=0）。
import { readFileSync } from 'node:fs';

const envelope = JSON.parse(readFileSync(0, 'utf8'));
const transcript = JSON.parse(readFileSync(envelope.transcript, 'utf8'));
const messages = transcript.request.context.messages;
const receipts = [messages[envelope.pointer], messages[envelope.pointer + 1]].filter(m => m?.role === 'toolResult');
if (receipts.length !== 2) throw new Error('expected both batch receipts at the validation entry');
const texts = receipts.map(m => (m.content ?? []).map(b => b.text ?? '').join('\n'));
if (receipts.some(m => m.isError === true) || !texts[1].includes('sample=buggy')) {
  throw new Error('the complete two-call batch did not pass its predictions');
}
process.stdout.write(JSON.stringify({ result: 'complete' }));
