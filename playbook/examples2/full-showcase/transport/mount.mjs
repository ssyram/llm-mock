import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const args = process.argv.slice(2);
const cacheIndex = args.indexOf('--cache-dir');
const pin = cacheIndex >= 0 && args[cacheIndex + 1] ? join(args[cacheIndex + 1], '.showcase-runtime-pin') : null;
if (pin && existsSync(pin)) {
  try {
    const mount = readFileSync(pin, 'utf8').trim();
    if (!mount) throw new Error('empty showcase runtime pin');
    const result = spawnSync(process.execPath, [mount, ...args], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    process.stdout.write(JSON.stringify({ error: { status: 422, code: 'playbook_binding_error', message: error.message } }));
  }
} else {
  await import('./run-mount.mjs');
}
