import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindShell, bindReply } from '../transport/bind-shell.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const artifact = process.env.MOCK_TEST_ARTIFACTS ?? join(root, 'target/test-artifacts/full-showcase');
const schemas = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures/native-shell-schemas.json'), 'utf8'));
const mount = join(root, 'playbook/examples2/full-showcase/transport/mount.mjs');
const inputs = [
  ['pi', 'req-000001-openai-completions.json', 'bash'],
  ['oc', 'req-000003-openai-completions.json', 'bash'],
  ['cc', 'req-000004-anthropic-messages.json', 'Bash']
];
const nativeInput = host => ({
  api: host === 'cc' ? 'anthropic-messages' : 'openai-completions', model: 'local',
  request: { context: { messages: [{ role: 'system', content: '', toolsAdded: [structuredClone(schemas[host])] }, { role: 'user', content: '1' }] } }
});

for (const [host, file, name] of inputs) {
  test(`${host}: captured schema plus synthetic local shell replay maps both directions`, () => {
    mkdirSync(artifact, { recursive: true });
    const dir = mkdtempSync(join(artifact, `binding-${host}-`));
    const env = { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', HOME: dir, TMPDIR: dir };
    const input = nativeInput(host);
    const messages = input.request.context.messages;
    const ids = [];
    let batch = 0;
    function untilText() {
      for (let guard = 0; guard < 20; guard++) {
        const run = spawnSync(process.execPath, [mount, '--host', host, '--cache-dir', join(dir, 'cache')], { input: JSON.stringify(input), env, encoding: 'utf8', timeout: 10000 });
        assert.equal(run.status, 0, run.stderr);
        const reply = JSON.parse(run.stdout);
        assert.equal(reply.error, undefined, JSON.stringify(reply.error));
        const calls = reply.content.filter(block => block.type === 'toolCall');
        messages.push({ role: 'assistant', content: reply.content });
        if (!calls.length) return reply.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
        if (batch++ === 0) assert.equal(calls.length, 2);
        for (const call of calls) {
          assert.equal(call.name, name);
          assert.ok(!ids.includes(call.id)); ids.push(call.id);
          const runTool = spawnSync('/bin/sh', ['-c', call.arguments.command], { cwd: dir, env, encoding: 'utf8', timeout: 5000 });
          assert.equal(runTool.status, 0, runTool.stderr);
          messages.push({ role: 'toolResult', toolCallId: call.id, toolName: name, content: [{ type: 'text', text: runTool.stdout }], isError: false });
        }
      }
      assert.fail('bounded synthetic replay did not stop');
    }
    assert.match(untilText(), /请输入 2/);
    messages.push({ role: 'user', content: '2' });
    assert.match(untilText(), /演练完成/);
    assert.equal(ids.length, 9);
    assert.equal(readFileSync(join(dir, 'sample.txt'), 'utf8'), 'sample=FIXED\n');
    assert.equal(readFileSync(join(dir, 'status.txt'), 'utf8'), 'status=FIXED\n');
    writeFileSync(join(dir, 'observation.json'), JSON.stringify({ host, schemaCapture: file, simulatedHost: true, input: ['1', '2'], nativeTool: name, callIds: ids, uniqueCalls: ids.length, branch: 'FIXED' }, null, 2));
  });
}

test('an existing cache can pin an adapter while fresh caches use the live product', () => {
  mkdirSync(artifact, { recursive: true });
  const dir = mkdtempSync(join(artifact, 'binding-pin-'));
  const cache = join(dir, 'cache');
  const pinned = join(dir, 'pinned.mjs');
  mkdirSync(cache);
  writeFileSync(pinned, `import { readFileSync } from 'node:fs'; const request = JSON.parse(readFileSync(0, 'utf8')); process.stdout.write(JSON.stringify({ pinned: true, host: process.argv[3], firstRole: request.request.context.messages[0].role }));`);
  const input = JSON.stringify(nativeInput('pi'));
  const invoke = () => {
    const result = spawnSync(process.execPath, [mount, '--host', 'pi', '--cache-dir', cache], { input, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  assert.equal(invoke().content.filter(item => item.type === 'toolCall').length, 2);
  writeFileSync(join(cache, '.showcase-runtime-pin'), pinned);
  assert.deepEqual(invoke(), { pinned: true, host: 'pi', firstRole: 'system' });
});

test('binding rejects missing tools and unknown required parameters', () => {
  const input = nativeInput('cc');
  const system = input.request.context.messages.find(message => message.role === 'system');
  const saved = system.toolsAdded;
  system.toolsAdded = [];
  assert.throws(() => bindShell(input, 'cc'), /expected one model-visible/);
  system.toolsAdded = saved;
  system.toolsAdded[0].parameters.required.push('nonexistent');
  assert.throws(() => bindShell(input, 'cc'), /unsupported required/);
  const binding = bindShell(nativeInput('cc'), 'cc');
  const unsafe = { content: [{ type: 'toolCall', id: 'x', name: 'bash', arguments: { command: 'printf test', dangerouslyDisableSandbox: true } }] };
  assert.throws(() => bindReply(unsafe, binding), /unsupported canonical shell argument/);
});

test('required description is inserted and stripped only when unchanged', () => {
  const input = nativeInput('cc');
  const schema = input.request.context.messages.find(message => message.role === 'system').toolsAdded[0].parameters;
  schema.required.push('description');
  const binding = bindShell(input, 'cc');
  const projected = bindReply({ content: [{ type: 'toolCall', id: 'x', name: 'bash', arguments: { command: 'printf test' } }] }, binding);
  assert.equal(projected.content[0].arguments.description, 'Run local showcase shell command');
  input.request.context.messages.push({ role: 'assistant', content: projected.content });
  assert.deepEqual(bindShell(input, 'cc').request.request.context.messages.at(-1).content[0].arguments, { command: 'printf test' });
  input.request.context.messages.at(-1).content[0].arguments.description = 'tampered';
  assert.throws(() => bindShell(input, 'cc'), /history changed/);
});
