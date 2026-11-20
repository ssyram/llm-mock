// 孤儿回显回归测试程序：envelope={transcript,pointer}。按阅读位置应答——
// 文本回显位=幂等 walk-verbatim 重导；自己工具回显位=消费其后回执并给出下一
// 工具决策＋跳点 pointer；前沿（无消息可读）=静息文本。无任何内部状态。
import { readFileSync } from 'node:fs';

const envelope = JSON.parse(readFileSync(0, 'utf8'));
const transcript = JSON.parse(readFileSync(envelope.transcript, 'utf8'));
const messages = transcript.request.context.messages;
const at = messages[envelope.pointer];
const textOf = (message) => (message?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

let output;
if (at?.role === 'assistant' && at.content.some((b) => b.type === 'toolCall')) {
  const receipt = messages[envelope.pointer + 1];
  if (receipt?.role !== 'toolResult' || receipt.toolCallId !== 'external-1') {
    throw new Error(`expected the receipt of my own echo at ${envelope.pointer}`);
  }
  output = { assistant: { content: [
    { type: 'toolCall', id: 'external-2', name: 'bash', arguments: { command: 'printf next' } },
  ] }, pointer: messages.length };
} else if (at?.role === 'assistant') {
  output = { result: 'idle', values: { idle_text: textOf(at) } };
} else {
  output = { result: 'idle', values: { idle_text: 'waiting' } };
}
process.stdout.write(JSON.stringify(output));
