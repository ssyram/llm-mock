// 历史工具回显在流停 user 单元时的孤儿接管回归（引擎通用语义，非 CCA 专属）：
// say 收束回合后，宿主回放“已发出未结算”的 assistant 工具回显＋回执＋新输入——
// 引擎自身无待决发射，最近命令 segment 是唯一可核对者，必须重入而非 playbook_state；
// 无 segment 可接管的流维持原 playbook_state 故障（旧语义不放松）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { callsOf, errorOf, session, textOf } from './helpers/run-mock2.mjs';

const program = new URL('./fixtures/segment-orphan-echo-program.mjs', import.meta.url).pathname;
const flowWithSegment = [
  '---', 'vars:', '  idle_text: ""', '---',
  '```user', '- any: true', '```',
  '```segment', '$label: streak', `command: node ${JSON.stringify(program)}`, 'save:', '  idle_text: idle_text',
  'cases:', '  - exact: idle', '    pass:', '      to: wait', '```',
  '```say', '$label: wait', '{{ vars.idle_text }}', '```',
  '```user', '- any: true', '  pass:', '    to: streak', '```',
].join('\n');
const flowWithoutSegment = [
  '```user', '- any: true', '```',
  '```say', 'waiting', '```',
  '```user', '- any: true', '```',
].join('\n');
const orphanTail = (s) => {
  s.messages.push({ role: 'assistant', content: [{ type: 'text', text: 'waiting' }] });
  s.messages.push({ role: 'assistant', content: [{ type: 'toolCall', id: 'external-1', name: 'bash', arguments: { command: 'printf orphan' } }] });
  s.messages.push({ role: 'toolResult', toolCallId: 'external-1', toolName: 'bash', content: [{ type: 'text', text: 'orphan done' }] });
  s.pushUser('next');
};

test('停 user 单元时到达的历史工具回显由最近 segment 接管重入', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pb2-orphan-'));
  const path = join(dir, 'flow.md');
  writeFileSync(path, flowWithSegment);
  const s = session({ playbook: path });
  s.pushUser('go');
  const first = s.call().reply;
  assert.equal(textOf(first), 'waiting');
  assert.equal(first.stopReason, 'stop');
  orphanTail(s);
  const second = s.call();
  assert.ok(!second.reply.error, JSON.stringify(second.reply.error ?? second.reply));
  assert.deepEqual(callsOf(second.reply).map((c) => c.id), ['external-2']);
});

test('无 segment 可接管的流仍 playbook_state（旧故障语义不放松）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pb2-orphan-'));
  const path = join(dir, 'flow.md');
  writeFileSync(path, flowWithoutSegment);
  const s = session({ playbook: path });
  s.pushUser('go');
  assert.equal(textOf(s.call().reply), 'waiting');
  orphanTail(s);
  assert.equal(errorOf(s.call()), 'playbook_state');
});
