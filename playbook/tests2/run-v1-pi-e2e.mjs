import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startServer } from "../../tests/harness.mjs";
import { testMarkdownPlaybookPi } from "../tests/pi-e2e.mjs";

const base = resolve(process.env.MOCK_TEST_ARTIFACTS ?? "target/test-artifacts/playbook-v1-pi");
mkdirSync(base, { recursive: true });
const dir = mkdtempSync(join(base, "v1-pi-"));
const server = await startServer(0);
const captures = () => readdirSync(server.captureDir).filter((name) => name.startsWith("req-")).sort()
  .map((name) => JSON.parse(readFileSync(join(server.captureDir, name), "utf8")));
const run = (bin, args, options = {}) => spawnSync(bin, args, {
  encoding: "utf8", timeout: 90000, maxBuffer: 8 * 1024 * 1024, ...options
});
try {
  const evidence = await testMarkdownPlaybookPi({ dir, baseUrl: `http://127.0.0.1:${server.port}`, run, captures });
  console.log(`PASS v1 Pi report, case, affine, and walk: ${evidence}`);
} finally {
  await server.stop();
}
