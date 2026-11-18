import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUnit } from '../lang2/load-unit.mjs';
import { callsOf, errorOf, session, textOf } from './helpers/run-mock2.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const artifacts = resolve(here, '../../target/test-artifacts/segment-unification');
const external = join(here, 'fixtures/segment-unification-program.mjs');
const block = (kind, ...body) => [`\`\`\`${kind}`, ...body, '```'].join('\n');
const user = block('user', '- any: true');
const cases = (...body) => ['cases:', ...body.map((line) => `  ${line}`)];
const program = (kind, mode, ...body) => block(kind, `command: node ${JSON.stringify(external)}`,
  'with:', `  mode: ${mode}`, ...body);

function fixture(name, parts) {
  mkdirSync(artifacts, { recursive: true });
  const dir = mkdtempSync(join(artifacts, `${name}-`));
  const path = join(dir, 'flow.md');
  writeFileSync(path, parts.join('\n\n'));
  return path;
}

for (const kind of ['segment', 'internal']) {
  test(`${kind}: pure result/values and pointer-only return preserve independent state`, () => {
    const path = fixture(kind, [
      '---\nvars:\n  count: 0\n---', user,
      program(kind, 'seed', ...cases('- exact: seed')),
      program(kind, 'result', ...cases('- exact: choose', '  pass:', '    to: selected')),
      block('say', 'wrong branch'),
      block('segment', '$label: selected', `command: node ${JSON.stringify(external)}`, 'with:', '  mode: values', 'save:', '  count: next', 'cases:', '    - exact: never'),
      block('say'), block('call bash', 'command: echo mid'),
      program(kind, 'pointer'),
      program(kind, 'check', ...cases('- exact: ok')),
      block('say', 'done={{ vars.count }}')
    ]);
    const s = session({ playbook: path });
    s.pushUser('go');
    const mid = s.call().reply;
    assert.equal(mid.error, undefined, JSON.stringify(mid.error));
    assert.equal(mid.stopReason, 'toolUse');
    s.pushToolResults(mid, {});
    const reply = s.call().reply;
    assert.equal(reply.error, undefined, JSON.stringify(reply.error));
    assert.equal(textOf(reply), 'done=42');
    assert.deepEqual(callsOf(reply), []);
    assert.equal(reply.stopReason, 'stop');
  });

  for (const cached of [false, true]) test(`${kind}: assistant + values resume after a tool receipt (${cached ? 'hot' : 'cold'})`, () => {
    const path = fixture(kind, [
      '---\nvars:\n  count: 0\n---', user,
      program(kind, 'interactive', '  saved: "{{ vars.count }}"', 'save:', '  count: next', ...cases('- exact: finished')),
      program(kind, 'after-interactive', '  saved: "{{ vars.count }}"', ...cases('- exact: ok')),
      block('say', 'finished={{ vars.count }}')
    ]);
    const s = session({ playbook: path, cacheDir: cached ? join(dirname(path), 'cache') : undefined });
    s.pushUser('go');
    const first = s.call().reply;
    assert.equal(first.error, undefined, JSON.stringify(first.error));
    assert.equal(first.stopReason, 'toolUse');
    assert.deepEqual(callsOf(first).map((call) => call.id), ['external-1']);
    s.pushToolResults(first, { 'external-1': 'actual external receipt' });
    const second = s.call().reply;
    assert.equal(second.error, undefined, JSON.stringify(second.error));
    assert.equal(textOf(second), 'finished=43');
    assert.deepEqual(callsOf(second), []);
  });

  for (const mode of ['missing-value', 'assistant-missing-value']) test(`${kind}: ${mode} fails before emitting a reply`, () => {
    const path = fixture(mode, ['---\nvars:\n  count: 0\n---', user,
      program(kind, mode, 'save:', '  count: next'), block('say', 'must not appear')]);
    const s = session({ playbook: path });
    s.pushUser('go');
    assert.equal(errorOf(s.call()), 'playbook_program_error');
  });

  test(`${kind}: empty output keeps the pre-existing cases failure`, () => {
    const path = fixture('empty', [user, program(kind, 'empty', ...cases('- exact: required')), block('say', 'must not appear')]);
    const s = session({ playbook: path });
    s.pushUser('go');
    assert.equal(errorOf(s.call()), 'playbook_mismatch');
  });

  test(`${kind}: result without cases now completes naturally (user ruling: no otherwise required)`, () => {
    const path = fixture('missing-cases', [user, program(kind, 'missing-cases'), block('say', 'continued')]);
    const s = session({ playbook: path });
    s.pushUser('go');
    assert.equal(textOf(s.call().reply), 'continued');
  });

  for (const [mode, expected] of [['stack', 'playbook_program_error'], ['pc', 'playbook_program_error'],
    ['continuation', 'playbook_program_error'], ['fault', 'playbook_program_error']]) {
    test(`${kind}: ${mode} remains a hard error`, () => {
      const path = fixture(mode, [user, program(kind, mode), block('say', 'must not appear')]);
      const s = session({ playbook: path });
      s.pushUser('go');
      assert.equal(errorOf(s.call()), expected);
    });
  }
}

for (const mode of ['aggregate-values', 'aggregate-reader', 'aggregate-missing-cases']) {
  test(`aggregation: ${mode} waits for the full batch and enters at the validation position`, () => {
    const path = fixture(mode, [
      '---\nvars:\n  count: 0\n---', user,
      block('call bash', 'command: echo one'), block('call bash', 'command: echo two'),
      program('aggregation', mode, 'save:', '  count: next'),
      program('segment', 'check-aggregate', ...cases('- exact: ok')),
      block('say', 'done={{ vars.count }}')
    ]);
    const s = session({ playbook: path });
    s.pushUser('go');
    const first = s.call().reply;
    const calls = callsOf(first);
    assert.equal(calls.length, 2);
    s.messages.push({ role: 'assistant', content: first.content });
    const receipt = (call) => ({ role: 'toolResult', toolCallId: call.id, toolName: 'bash', content: [{ type: 'text', text: 'ok' }] });
    s.messages.push(receipt(calls[0]));
    assert.equal(errorOf(s.call()), 'playbook_state');
    s.messages.push(receipt(calls[1]));
    const last = s.call();
    if (mode === 'aggregate-missing-cases') assert.equal(textOf(last.reply), 'done=0');
    else assert.equal(textOf(last.reply), `done=${mode === 'aggregate-values' ? 11 : 0}`);
  });
}

test('aggregation may return the next Response (continues N units), entry still validation', () => {
  const path = fixture('aggregate-assistant', [
    user,
    block('call bash', 'command: echo one'), block('call bash', 'command: echo two'),
    program('aggregation', 'aggregate-assistant'),
    block('say', 'after-external'),
  ]);
  const s = session({ playbook: path });
  s.pushUser('go');
  const first = s.call().reply;
  const calls = callsOf(first);
  s.messages.push({ role: 'assistant', content: first.content });
  for (const call of calls) s.messages.push({ role: 'toolResult', toolCallId: call.id, toolName: 'bash', content: [{ type: 'text', text: 'ok' }] });
  const second = s.call().reply;
  assert.equal(second.error, undefined, JSON.stringify(second.error));
  assert.equal(second.stopReason, 'toolUse');
  assert.deepEqual(callsOf(second).map((call) => call.id), ['external-1']);
  s.pushToolResults(second, {});
  const third = s.call().reply;
  assert.equal(textOf(third), 'after-external');
});

test('legacy spelling normalizes to the same program IR, including volatile', async () => {
  const { parseBlocks } = await import('../lang2/parse-blocks.mjs');
  const source = (kind) => program(kind, 'result', 'volatile: true', ...cases('- exact: choose'));
  const canonical = parseBlocks(source('segment'));
  assert.deepEqual(parseBlocks(source('internal')), canonical);
  assert.equal(canonical[0].kind, 'segment');
  assert.equal(canonical[0].volatile, true);
  assert.equal(Object.hasOwn(canonical[0], 'sourceKind'), false);
});

test('both spellings take the same compile checks for targets, save and references', () => {
  const invalid = [
    (kind) => program(kind, 'result', ...cases('- exact: choose', '  pass:', '    to: missing')),
    (kind) => program(kind, 'values', 'save:', '  p: next'),
    (kind) => program(kind, 'values', '  bad: "{{ vars.n + 1 }}"')
  ];
  for (const kind of ['segment', 'internal']) for (const make of invalid) {
    const path = fixture('compile', ['---\nparams:\n  p: 1\nvars:\n  n: 0\n---', user, make(kind)]);
    assert.throws(() => loadUnit(path), /label|save|引用|表达式/);
  }
});
