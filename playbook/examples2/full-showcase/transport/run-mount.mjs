import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bindShell, bindReply } from './bind-shell.mjs';

const dir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const hostIndex = args.indexOf('--host');
const cacheIndex = args.indexOf('--cache-dir');
const host = args[hostIndex + 1];
const cacheDir = args[cacheIndex + 1];
try {
  if (hostIndex < 0 || cacheIndex < 0 || !host || !cacheDir) throw new Error('usage: mount.mjs --host pi|oc|cc --cache-dir PATH');
  const input = JSON.parse(readFileSync(0, 'utf8'));
  const binding = bindShell(input, host);
  const mock = resolve(dir, '../../../mock2.mjs');
  const playbook = resolve(dir, '../showcase.md');
  const result = spawnSync(process.execPath, [mock, '--playbook', playbook, '--cache-dir', cacheDir], { input: JSON.stringify(binding.request), encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`playback failed: ${result.error?.message ?? result.stderr}`);
  const reply = bindReply(JSON.parse(result.stdout), binding);
  process.stdout.write(JSON.stringify(reply));
} catch (error) {
  process.stdout.write(JSON.stringify({ error: { status: 422, code: 'playbook_binding_error', message: error.message } }));
}
