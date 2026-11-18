// segment/aggregation 统一协议测试程序：envelope={transcript,pointer,with}。
// pointer 是真实消费位置（message 下标数字）；aggregation 的入口在回执下标
// （Validation 入口），segment 的入口在消费前沿——两种入口语义可区分。
import { readFileSync } from 'node:fs';

const envelope = JSON.parse(readFileSync(0, 'utf8'));
const args = envelope.with ?? {};
const transcript = JSON.parse(readFileSync(envelope.transcript, 'utf8'));
const messages = transcript.request.context.messages;
const consumed = messages.slice(0, envelope.pointer);

const assertPointer = (expected) => {
  if (envelope.pointer !== expected) throw new Error(`unexpected pointer ${envelope.pointer}, expected ${expected}`);
};

let output;
switch (args.mode) {
  case 'seed':
    assertPointer(1);
    output = { result: 'seed', pointer: 1 };
    break;
  case 'result':
    assertPointer(1);
    output = { result: 'choose' };
    break;
  case 'values':
    assertPointer(1);
    output = { values: { next: 42 } };
    break;
  case 'pointer':
    assertPointer(3);
    output = { pointer: 1 };
    break;
  case 'check':
    assertPointer(3);
    output = { result: 'ok' };
    break;
  case 'interactive': {
    const echo = messages[envelope.pointer];
    const mine = echo?.role === 'assistant' && (echo.content ?? []).some((b) => b.type === 'toolCall' && b.id === 'external-1');
    if (!mine) {
      output = { values: { next: 42 }, assistant: { content: [
        { type: 'toolCall', id: 'external-1', name: 'bash', arguments: { command: 'printf external' } }
      ], stopReason: 'toolUse' } };
    } else {
      const receipt = messages[envelope.pointer + 1];
      if (receipt?.role !== 'toolResult' || receipt.toolCallId !== 'external-1') throw new Error('expected the receipt of my own RV');
      if (args.saved !== 42 && args.saved !== 0) throw new Error('unexpected saved state');
      if (!receipt.content?.some((item) => item.text === 'actual external receipt')) throw new Error('missing tool receipt');
      output = { result: 'finished', pointer: envelope.pointer + 2, values: { next: 43 } };
    }
    break;
  }
  case 'after-interactive':
    if (args.saved !== 43) throw new Error('completion save was not preserved');
    output = { result: 'ok' };
    break;
  case 'aggregate-values': {
    if (messages[envelope.pointer]?.role !== 'toolResult') throw new Error('aggregation entry must be the validation position (receipts)');
    if (messages[envelope.pointer + 1]?.role !== 'toolResult') throw new Error('incomplete aggregation batch');
    output = { values: { next: 11 }, pointer: envelope.pointer + 2 };
    break;
  }
  case 'aggregate-reader': {
    if (messages[envelope.pointer]?.role !== 'toolResult') throw new Error('aggregation entry must be the validation position (receipts)');
    output = { pointer: envelope.pointer + 2 };
    break;
  }
  case 'aggregate-missing-cases':
    output = { result: 'unexpected' };
    break;
  case 'aggregate-assistant': {
    const receipt = messages[envelope.pointer];
    if (receipt?.role !== 'toolResult') throw new Error('aggregation entry must be the validation position (receipts)');
    const text = (receipt.content ?? []).map((b) => b.text ?? '').join('\n');
    if (text.includes('ok')) {
      if (messages[envelope.pointer + 1]?.role !== 'toolResult') throw new Error('incomplete aggregation batch');
      output = { assistant: { content: [
        { type: 'toolCall', id: 'external-1', name: 'bash', arguments: { command: 'printf agg' } }
      ], stopReason: 'toolUse' } };
    } else {
      output = { result: 'consumed-followup' };
    }
    break;
  }
  case 'check-aggregate':
    output = { result: 'ok' };
    break;
  case 'empty':
    output = {};
    break;
  case 'missing-value':
    output = { values: { other: 1 } };
    break;
  case 'assistant-missing-value':
    output = { values: { other: 1 }, assistant: { content: [
      { type: 'toolCall', id: 'external-1', name: 'bash', arguments: { command: 'printf forbidden' } }
    ], stopReason: 'toolUse' } };
    break;
  case 'missing-cases':
    output = { result: 'unexpected' };
    break;
  case 'stack':
    output = { result: 'ok', stack: [] };
    break;
  case 'pc':
    output = { pointer: 0, pc: { frame: 0, node: 999 } };
    break;
  case 'continuation':
    output = { continuation: {} };
    break;
  case 'fault':
    throw new Error('program failure');
  default:
    throw new Error(`unknown test mode ${args.mode}`);
}
process.stdout.write(JSON.stringify(output));
