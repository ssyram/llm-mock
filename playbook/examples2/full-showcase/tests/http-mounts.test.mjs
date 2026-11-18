import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalMockServer } from '../../../tests2/independent/support/start-local-mock-server.mjs';
import { isolatedEnvironment } from '../../../tests2/independent/support/isolated-environment.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const bin = process.env.MOCK_SERVER_BIN ?? join(repo, 'target/debug/mock-llm-server');
const mount = join(here, '../transport/mount.mjs');
const schemas = JSON.parse(readFileSync(join(here, 'fixtures/native-shell-schemas.json'), 'utf8'));
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const command = (dir, host) => [process.execPath, mount, '--host', host, '--cache-dir', join(dir, `cache-${host}`)].map(quote).join(' ');

function callsFromSse(raw, anthropic) {
  const events = raw.split('\n').filter(line => line.startsWith('data: ') && line !== 'data: [DONE]').map(line => JSON.parse(line.slice(6)));
  const slots = new Map();
  for (const event of events) {
    if (anthropic && event.type === 'content_block_start' && event.content_block?.type === 'tool_use') slots.set(event.index, { name: event.content_block.name, json: '' });
    if (anthropic && event.type === 'content_block_delta' && event.delta?.type === 'input_json_delta') slots.get(event.index).json += event.delta.partial_json;
    for (const delta of event.choices?.[0]?.delta?.tool_calls ?? []) {
      if (!slots.has(delta.index)) slots.set(delta.index, { name: delta.function?.name, json: '' });
      slots.get(delta.index).json += delta.function?.arguments ?? '';
    }
  }
  return [...slots.values()].map(slot => ({ name: slot.name, args: JSON.parse(slot.json || '{}') }));
}

test('synthetic HTTP reaches the same playbook through all three isolated mounts', async () => {
  const base = process.env.MOCK_TEST_ARTIFACTS ?? join(repo, 'target/test-artifacts/playbook-http');
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'three-mounts-'));
  const server = await startLocalMockServer({ serverBin: bin, runDir: dir, mountCommand: command(dir, 'pi') });
  try {
    const transcripts = [];
    for (const host of ['pi', 'oc', 'cc']) {
      const name = host === 'cc' ? 'Bash' : 'bash';
      const registration = spawnSync(bin, ['add', command(dir, host), '--name', host, '--server-url', server.baseUrl], { cwd: dir, env: isolatedEnvironment(dir), encoding: 'utf8', timeout: 10000 });
      assert.equal(registration.status, 0, registration.stderr);
      const anthropic = host === 'cc';
      const body = anthropic ? {
        model: 'showcase', max_tokens: 1024, messages: [{ role: 'user', content: '1' }],
        tools: [{ name, description: 'Local shell', input_schema: schemas[host].parameters }]
      } : {
        model: 'showcase', messages: [{ role: 'user', content: '1' }],
        tools: [{ type: 'function', function: { name, description: 'Local shell', parameters: schemas[host].parameters } }]
      };
      const route = anthropic ? `/${host}/v1/messages` : `/${host}/v1/chat/completions`;
      const response = await fetch(server.baseUrl + route, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer local-${host}`, 'x-api-key': `local-${host}`, 'anthropic-version': '2023-06-01' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
      const raw = await response.text();
      writeFileSync(join(dir, `${host}-response.sse`), raw);
      assert.equal(response.status, 200, raw);
      const calls = callsFromSse(raw, anthropic);
      assert.equal(calls.length, 2);
      assert.deepEqual(calls.map(call => call.name), [name, name]);
      transcripts.push(calls.map(call => call.args));
    }
    assert.deepEqual(transcripts[1], transcripts[0]);
    assert.deepEqual(transcripts[2], transcripts[0]);
  } finally {
    await server.stop();
  }
});
