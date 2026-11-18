// 最终 toolResult 判决：核对五个产物的完整内容。
import { readFileSync } from 'node:fs';

const envelope = JSON.parse(readFileSync(0, 'utf8'));
const transcript = JSON.parse(readFileSync(envelope.transcript, 'utf8'));
const message = transcript.request.context.messages[envelope.pointer];
const text = (message?.content ?? []).map(block => block.text ?? '').join('\n');
const expected = ['baseline=PASS', 'round=0|frame=seen-0|payload=case-0', 'round=1|frame=seen-1|payload=case-1', 'round=2|frame=seen-2|payload=case-2', 'batch=separated'];
const branchOk = (text.includes('sample=FIXED') && text.includes('status=FIXED')) || (text.includes('sample=buggy') && text.includes('status=KEPT'));
process.stdout.write(message?.isError !== true && expected.every(item => text.includes(item)) && branchOk ? 'pass' : 'fail');
