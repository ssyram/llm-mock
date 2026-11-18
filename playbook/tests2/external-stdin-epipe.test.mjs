import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, mkdtempSync, openSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runExternalProgram } from '../program-exec.mjs';
import { runJudgeCommand } from '../judge-exec.mjs';
import { runAggregator, runSegment } from '../program-runtime.mjs';
import { runExternal, parseProgramOutput } from '../lang2/external.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = resolve(root, 'tests2/independent/fixtures/programs/structured-value.mjs');
const command = (source) => `${JSON.stringify(process.execPath)} -e ${JSON.stringify(source)}`;
const fixtureCommand = `${JSON.stringify(process.execPath)} ${JSON.stringify(fixture)}`;
const large = 'x'.repeat(4 * 1024 * 1024);
const messages = [{ role: 'user', content: large }];
const envelope = { transcript: '/dev/null', pointer: 0, with: { payload: large } };
const options = { cwd: root, timeoutMs: 5000 };
const externalOptions = { messages, cwd: root, timeoutMs: 5000 };

function raw(cmd) {
  const result = spawnSync(cmd, { shell: true, cwd: root, input: JSON.stringify(envelope), encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 });
  return { error: result.error?.code ?? null, status: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr };
}

test('real no-read fixture reproduces EPIPE with successful exit and complete JSON stdout', () => {
  const result = raw(fixtureCommand);
  assert.deepEqual({ error: result.error, status: result.status, signal: result.signal, stderr: result.stderr },
    { error: 'EPIPE', status: 0, signal: null, stderr: '' });
  assert.deepEqual(JSON.parse(result.stdout), { result: 'ready', values: { payload: { enabled: true, items: ['one', 'two'] } } });
});

test('v2 segment accepts the completed no-read fixture and retains structured values', () => {
  const result = parseProgramOutput(JSON.stringify({ result: 'ready', values: { payload: { enabled: true, items: ['one', 'two'] } } }), 'segment', messages, 'test');
  assert.deepEqual(result.output, { result: 'ready', values: { payload: { enabled: true, items: ['one', 'two'] } } });
});

test('value-reference integration preserves whole and mixed references after early close', () => {
  const artifacts = resolve(root, '../target/test-artifacts/external-stdin-epipe');
  mkdirSync(artifacts, { recursive: true });
  const dir = mkdtempSync(join(artifacts, 'value-reference-'));
  const request = { api: 'openai-completions', keyId: 'independent-local', request: { context: {
    messages: [{ role: 'user', content: 'begin' }], system: large
  } } };
  const file = join(dir, 'input.json');
  writeFileSync(file, JSON.stringify(request), { flag: 'wx' });
  const fd = openSync(file, 'r');
  let result;
  try {
    result = spawnSync(process.execPath, [resolve(root, 'mock2.mjs'), '--playbook',
      resolve(root, 'tests2/independent/fixtures/expected-parse/value-reference.md'), '--no-cache'],
      { cwd: dir, stdio: [fd, 'pipe', 'pipe'], encoding: 'utf8', timeout: 15000 });
  } finally { closeSync(fd); }
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const reply = JSON.parse(result.stdout);
  assert.equal(reply.error, undefined, JSON.stringify(reply));
  const args = reply.content.find((item) => item.type === 'toolCall').arguments;
  assert.deepEqual(args.payload, { enabled: true, items: ['one', 'two'] });
  assert.equal(typeof args.caption, 'string');
  assert.equal(typeof args.literal, 'string');
});

test('v1 segment and aggregator retain their existing JSON and plaintext contracts', () => {
  const json = command('process.stdout.write(JSON.stringify({result:"ready"}))');
  const segment = { kind: 'segment', index: 1, command: json, cases: [{ matcher: 'exact', value: 'ready' }] };
  assert.deepEqual(runSegment(segment, messages, 1, { judgeCwd: root, judgeTimeoutMs: 5000 }), { nextIndex: 1, consumed: 1 });
  const invalid = runSegment({ ...segment, command: command('process.stdout.write("invalid")') }, messages, 1, { judgeCwd: root, judgeTimeoutMs: 5000 });
  assert.equal(invalid.error?.code, 'playbook_program_error');
  assert.match(invalid.error.message, /must be JSON/);
  const aggregate = { kind: 'aggregator', index: 2, command: command('process.stdout.write("complete")'), cases: [{ matcher: 'exact', value: 'complete' }] };
  assert.deepEqual(runAggregator(aggregate, messages, 1, [], { judgeCwd: root, judgeTimeoutMs: 5000 }), { nextIndex: 2 });
});

test('no-read judges still validate pass/fail output', () => {
  assert.deepEqual(runJudgeCommand(command('process.stdout.write("pass")'), envelope, options), { pass: true });
  assert.deepEqual(runJudgeCommand(command('process.stdout.write("fail")'), envelope, options), { pass: false });
  const invalid = runJudgeCommand(command('process.stdout.write("invalid")'), envelope, options);
  assert.equal(invalid.error?.code, 'playbook_judge_error');
  assert.match(invalid.error.message, /stdout must be exactly/);
});

test('invalid v2 JSON remains a program error after a successful early close', () => {
  const bad = parseProgramOutput('invalid', 'segment', messages, 'test');
  assert.equal(bad.error?.code, 'playbook_program_error');
  assert.match(bad.error.message, /stdout 必须是单 JSON/);
});

test('explicit null pointer and non-boundary pointers are rejected', () => {
  const walk = [
    { role: 'user', content: 'go' },
    { role: 'assistant', content: [{ type: 'toolCall', id: 'p2_1', name: 'bash', arguments: {} }] },
    { role: 'toolResult', toolCallId: 'p2_1', content: [] },
  ];
  const badNull = parseProgramOutput(JSON.stringify({ pointer: null }), 'segment', walk, 'test');
  assert.equal(badNull.error?.code, 'playbook_program_error');
  const midReceipt = parseProgramOutput(JSON.stringify({ pointer: 2 }), 'segment', walk, 'test');
  assert.equal(midReceipt.error?.code, 'playbook_program_error');
  assert.match(midReceipt.error.message, /整单元边界/);
  const beyond = parseProgramOutput(JSON.stringify({ pointer: 4 }), 'segment', walk, 'test');
  assert.equal(beyond.error?.code, 'playbook_program_error');
});

test('nonzero no-read program and judge remain hard failures despite valid-looking stdout', () => {
  const program = command('process.stdout.write(JSON.stringify({result:"ready"})); process.exitCode=7');
  const judge = command('process.stdout.write("pass"); process.exitCode=7');
  const ended = raw(program);
  assert.equal(ended.error, 'EPIPE');
  assert.equal(ended.status, 7);
  assert.equal(ended.signal, null);
  const a = runExternalProgram(program, envelope, options);
  const b = runJudgeCommand(judge, envelope, options);
  assert.equal(a.error?.code, 'playbook_program_error');
  assert.match(a.error.message, /status 7/);
  assert.equal(b.error?.code, 'playbook_judge_error');
  assert.match(b.error.message, /status 7/);
});

test('timeout, signal, output limit and failure to start remain hard failures', () => {
  const slow = `exec ${command('setTimeout(() => {}, 10000)')}`;
  const signal = `exec ${command('process.kill(process.pid, "SIGTERM")')}`;
  const excessive = command('process.stdout.write("x".repeat(2 * 1024 * 1024))');
  for (const runner of [runExternalProgram, runJudgeCommand]) {
    const errorCode = runner === runExternalProgram ? 'playbook_program_error' : 'playbook_judge_error';
    const timed = runner(slow, envelope, { ...options, timeoutMs: 100 });
    assert.equal(timed.error?.code, errorCode);
    assert.match(timed.error.message, /timed out/);
    assert.equal(runner(signal, envelope, options).error?.code, errorCode);
    assert.equal(runner(excessive, envelope, options).error?.code, errorCode);
    assert.equal(runner(fixtureCommand, envelope, { ...options, cwd: resolve(root, 'missing-epipe-working-directory') }).error?.code, errorCode);
  }
});

test('runExternal routes through the new envelope and validates output against messages', () => {
  const ok = runExternal({ kind: 'segment', openIndex: 1, command: fixtureCommand }, { role: 'segment', transcript: '/dev/null', pointer: 0, with: {} }, externalOptions);
  assert.deepEqual(ok.output, { result: 'ready', values: { payload: { enabled: true, items: ['one', 'two'] } } });
  const bad = runExternal({ kind: 'segment', openIndex: 1, command: command('process.stdout.write(JSON.stringify({pointer: 5}))') }, { role: 'segment', transcript: '/dev/null', pointer: 0, with: {} }, externalOptions);
  assert.equal(bad.error?.code, 'playbook_program_error');
});
