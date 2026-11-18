// toolResult 判决：subject 在 transcript pointer 指向的回执消息。
import { readFileSync } from 'node:fs';

const envelope = JSON.parse(readFileSync(0, 'utf8'));
const transcript = JSON.parse(readFileSync(envelope.transcript, 'utf8'));
const message = transcript.request.context.messages[envelope.pointer];
const text = (message?.content ?? []).map(block => block.text ?? '').join('\n');
process.stdout.write(message?.isError !== true && text.includes('sample=buggy') ? 'pass' : 'fail');
