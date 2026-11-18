import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { discoverSources } from "./discover-files.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const files = discoverSources(root);
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8", timeout: 10000 });
  if (result.status !== 0 || result.error || result.signal) {
    failures++;
    process.stderr.write(`${file}: ${result.error?.message ?? result.stderr}\n`);
  }
}
console.log(JSON.stringify({ files, checked: files.length, failures }, null, 2));
if (failures) process.exitCode = 1;
