// 交互 segment：入口=消费前沿。初入时该位置尚无自己的 RV → 返回 assistant 发起
// 真实读取；续行/重放时入口恰是自己 RV 的起点（assistant+回执）→ 实读验证后
// 返回 pointer 跳过该完整单元（阅读位置真实推进）。
import { readFileSync } from 'node:fs';

const envelope = JSON.parse(readFileSync(0, 'utf8'));
const transcript = JSON.parse(readFileSync(envelope.transcript, 'utf8'));
const messages = transcript.request.context.messages;
const id = 'segment-read-1';
const echo = messages[envelope.pointer];
const mine = echo?.role === 'assistant' && (echo.content ?? []).some(block => block.type === 'toolCall' && block.id === id);
if (!mine) {
  process.stdout.write(JSON.stringify({ assistant: { content: [
    { type: 'text', text: 'Segment 正在调用宿主读取基线、样本和三轮 trace。' },
    { type: 'toolCall', id, name: envelope.with.shell, arguments: { command: 'cat baseline.txt sample.txt trace.txt' } }
  ], stopReason: 'toolUse' } }));
} else {
  const result = messages[envelope.pointer + 1];
  if (result?.role !== 'toolResult' || result.toolCallId !== id) throw new Error('expected the receipt of my own RV');
  const text = (result.content ?? []).map(block => block.text ?? '').join('\n');
  const expected = ['baseline=PASS', 'sample=buggy', 'round=0|frame=seen-0|payload=case-0', 'round=1|frame=seen-1|payload=case-1', 'round=2|frame=seen-2|payload=case-2'];
  if (result.isError === true || !expected.every(item => text.includes(item))) throw new Error('segment did not read the expected files');
  process.stdout.write(JSON.stringify({ result: 'read-ok', pointer: envelope.pointer + 2, values: { summary: '基线、缺陷样本和三轮独立帧均已读到' } }));
}
