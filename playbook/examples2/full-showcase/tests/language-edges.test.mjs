import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const artifacts = process.env.MOCK_TEST_ARTIFACTS ?? join(root, 'target/test-artifacts/full-showcase');
const mock = join(root, 'playbook/mock2.mjs');
const block = (kind, ...lines) => [`\`\`\`${kind}`, ...lines, '```'].join('\n');
const user = text => ({ role: 'user', content: text });
const say = reply => reply.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
function workspace() { mkdirSync(artifacts, { recursive: true }); return mkdtempSync(join(artifacts, 'language-edge-')); }
function fixture(dir, name, body) { const path = join(dir, name); writeFileSync(path, body.join('\n\n')); return path; }
function invoke(dir, paths, messages, cache = false, extra = {}) {
  const input = { api: 'openai-completions', model: 'local', request: { context: { messages, ...extra } } };
  const args = [mock, ...paths.flatMap(path => ['--playbook', path]), ...(cache ? ['--cache-dir', join(dir, 'cache')] : ['--no-cache'])];
  const env = { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', HOME: dir, TMPDIR: dir };
  const run = spawnSync(process.execPath, args, { input: JSON.stringify(input), env, encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}
function compile(path) {
  const dir = dirname(path);
  const env = { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', HOME: dir, TMPDIR: dir };
  const run = spawnSync(process.execPath, [mock, '--compile-observations', path], { env, encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout);
}

test('one affine holder may route to different result labels', () => {
  const dir = workspace();
  const path = fixture(dir, 'affine.md', [block('user', '- any: true'), block('call bash', 'command: printf ok'),
    block('toolResult', '- contains: ok', '  pass:', '    to: YES', '- otherwise: true', '  pass:', '    to: NO'),
    block('say', '$label: YES', 'yes'), block('say', '$label: NO', 'no')]);
  assert.equal(compile(path).accepted, true);
  for (const [result, expected] of [['ok', 'yes'], ['bad', 'no']]) {
    const messages = [user('go')];
    const reply = invoke(dir, [path], messages);
    const call = reply.content.find(item => item.type === 'toolCall');
    messages.push({ role: 'assistant', content: reply.content }, { role: 'toolResult', toolCallId: call.id, toolName: 'bash', content: [{ type: 'text', text: result }] });
    assert.equal(say(invoke(dir, [path], messages)), expected);
  }
});

test('file-call child EOF returns to caller and caller continues', () => {
  const dir = workspace();
  fixture(dir, 'child.md', [block('say', 'child')]);
  const main = fixture(dir, 'main.md', [block('user', '- any: true'), block('segment', 'path: child.md'), block('say', 'returned')]);
  const messages = [user('go')];
  const reply = invoke(dir, [main], messages);
  assert.equal(say(reply), 'child');
  messages.push({ role: 'assistant', content: reply.content }, user('again'));
  assert.equal(say(invoke(dir, [main], messages)), 'returned');
});

test('multiple roots select the matching system, while judge faults never fall through', () => {
  const dir = workspace();
  const match = data => block('match', `data: ${data}`, 'cases:', '  - contains: wrong');
  const first = fixture(dir, 'first.md', [match('system'), block('user', '- any: true'), block('say', 'wrong')]);
  const second = fixture(dir, 'second.md', [block('match', 'data: system', 'cases:', '  - contains: right'), block('user', '- any: true'), block('say', 'selected')]);
  assert.equal(say(invoke(dir, [first, second], [user('go')], false, { system: 'right' })), 'selected');
  const fault = fixture(dir, 'fault.md', [block('match', 'data: system', 'cases:', '  - judge: exit 3'), block('user', '- any: true'), block('say', 'wrong')]);
  assert.equal(invoke(dir, [fault, second], [user('go')], false, { system: 'right' }).error.code, 'playbook_judge_error');
  const crash = fixture(dir, 'crash.md', [block('user', '- any: true'), block('segment', 'command: exit 3', 'cases:', '  - otherwise: true'), block('say', 'wrong')]);
  assert.equal(invoke(dir, [crash, second], [user('go')], false, { system: 'right' }).error.code, 'playbook_program_error');
});

test('forked hot continuations equal their cold branches', () => {
  const dir = workspace();
  const path = fixture(dir, 'fork.md', [block('user', '- exact: begin'), block('say', 'choose'),
    block('user', '- exact: a', '  pass:', '    to: A', '- exact: b', '  pass:', '    to: B'),
    block('say', '$label: A', 'branch-a'), block('say', '$label: B', 'branch-b')]);
  const initial = [user('begin')];
  const prompt = invoke(dir, [path], initial, true);
  const prefix = [...initial, { role: 'assistant', content: prompt.content }];
  for (const [answer, expected] of [['a', 'branch-a'], ['b', 'branch-b']]) {
    const messages = [...prefix, user(answer)];
    const hot = invoke(dir, [path], messages, true);
    const cold = invoke(dir, [path], messages);
    assert.equal(say(hot), expected);
    assert.deepEqual(hot.content, cold.content);
  }
});

test('compaction marker cannot recreate an absent entry user', () => {
  const dir = workspace();
  const path = fixture(dir, 'compact.md', [block('match', 'data: compaction', 'cases:', '  - otherwise: true'), block('user', '- exact: start'), block('say', 'first'), block('user', '- exact: next'), block('say', 'finished')]);
  assert.equal(invoke(dir, [path], [user('next')], false, { compaction: 'lost-prefix' }).error.code, 'playbook_mismatch');
});

test('root user matches the startup input directly without an extra round', () => {
  const dir = workspace();
  const path = fixture(dir, 'root-entry.md', [block('user', '- exact: launch'), block('say', 'ack')]);
  const reply = invoke(dir, [path], [user('launch')]);
  assert.equal(say(reply), 'ack');
});

for (const [kind, prefix, bad] of [
  ['user', [], block('user', '- any: true', '  pass:', '    to: MISSING')],
  ['match system', [], block('match', 'data: system', 'cases:', '  - otherwise: true', '    pass:', '      to: MISSING')],
  ['match compaction', [], block('match', 'data: compaction', 'cases:', '  - otherwise: true', '    pass:', '      to: MISSING')],
  ['toolResult', [block('user', '- any: true'), block('call bash', 'command: echo ok')], block('toolResult', '- otherwise: true', '  pass:', '    to: MISSING')],
  ['internal', [block('user', '- any: true')], block('internal', 'command: echo ok', 'cases:', '  - otherwise: true', '    pass:', '      to: MISSING')],
  ['segment', [block('user', '- any: true')], block('segment', 'command: echo ok', 'cases:', '  - otherwise: true', '    pass:', '      to: MISSING')],
  ['aggregation', [block('user', '- any: true'), block('call bash', 'command: echo ok')], block('aggregation', 'command: echo ok', 'cases:', '  - otherwise: true', '    pass:', '      to: MISSING')]
]) {
  test(`compile validates ${kind} targets`, () => {
    const dir = workspace();
    const path = fixture(dir, 'invalid.md', [...prefix, bad]);
    const result = compile(path);
    assert.equal(result.accepted, false, JSON.stringify(result));
    assert.equal(result.error.class, 'playbook_invalid');
    assert.match(result.error.message, /MISSING/);
  });
}

test('compile rejects goto and standalone label blocks as unknown fences', () => {
  const dir = workspace();
  const gotopath = fixture(dir, 'goto.md', [block('user', '- any: true'), block('goto', 'to: x')]);
  const got = compile(gotopath);
  assert.equal(got.accepted, false);
  assert.match(got.error.message, /unknown fence/);
  const labelPath = fixture(dir, 'label.md', [block('label', 'x')]);
  assert.equal(compile(labelPath).accepted, false);
});
