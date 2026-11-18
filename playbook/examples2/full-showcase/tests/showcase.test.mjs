import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const artifacts = process.env.MOCK_TEST_ARTIFACTS ?? join(root, 'target/test-artifacts/full-showcase');
const playbook = join(here, '../showcase.md');
const mock = join(root, 'playbook/mock2.mjs');
const tools = reply => reply.content.filter(block => block.type === 'toolCall');
const text = reply => reply.content.filter(block => block.type === 'text').map(block => block.text).join('\n');

for (const [answer, status] of [['2', 'FIXED'], ['3', 'KEPT'], ['请帮我修复', 'FIXED'], ['暂停', 'KEPT'], ['不要修复', 'KEPT']]) {
  test(`showcase locally replays branch ${answer} and authentic shell effects`, () => {
    mkdirSync(artifacts, { recursive: true });
    const dir = mkdtempSync(join(artifacts, 'mock-replay-'));
    const env = { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin', HOME: dir, TMPDIR: dir };
    const messages = [{ role: 'user', content: '1' }];
    const ids = [];
    let batch = 0;
    function runUntilText() {
      for (let guard = 0; guard < 20; guard++) {
        const input = { api: 'openai-completions', model: 'local', request: { context: { messages } } };
        const call = spawnSync(process.execPath, [mock, '--playbook', playbook, '--cache-dir', join(dir, 'cache')], { input: JSON.stringify(input), env, encoding: 'utf8', timeout: 10000 });
        assert.equal(call.status, 0, call.stderr);
        const reply = JSON.parse(call.stdout);
        assert.equal(reply.error, undefined, JSON.stringify(reply.error));
        assert.doesNotMatch(text(reply), /# Full showcase:|\bread-segment\b|\brounds\b/);
        const calls = tools(reply);
        messages.push({ role: 'assistant', content: reply.content });
        if (!calls.length) return text(reply);
        if (batch++ === 0) assert.equal(calls.length, 2, 'initial calls are one batch');
        for (const tool of calls) {
          assert.ok(!ids.includes(tool.id), `duplicate ID ${tool.id}`);
          ids.push(tool.id);
          const execution = spawnSync('/bin/sh', ['-c', tool.arguments.command], { cwd: dir, env, encoding: 'utf8', timeout: 5000 });
          assert.equal(execution.status, 0, execution.stderr);
          messages.push({ role: 'toolResult', toolCallId: tool.id, toolName: tool.name, content: [{ type: 'text', text: execution.stdout }], isError: false });
        }
      }
      assert.fail('bounded tool loop did not reach user input');
    }
    assert.match(runUntilText(), /请输入 2/);
    messages.push({ role: 'user', content: answer });
    assert.match(runUntilText(), /演练完成/);
    assert.equal(ids.length, 9);
    assert.equal(readFileSync(join(dir, 'trace.txt'), 'utf8'), 'round=0|frame=seen-0|payload=case-0\nround=1|frame=seen-1|payload=case-1\nround=2|frame=seen-2|payload=case-2\n');
    assert.equal(readFileSync(join(dir, 'status.txt'), 'utf8'), `status=${status}\n`);
    assert.equal(readFileSync(join(dir, 'sample.txt'), 'utf8'), `sample=${status === 'FIXED' ? 'FIXED' : 'buggy'}\n`);
  });
}
