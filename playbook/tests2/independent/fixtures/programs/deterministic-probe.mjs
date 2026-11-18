import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = resolve(process.env.PLAYBOOK_TEST_ARTIFACT_DIR, input.with.observationFile);
let count = 0;
try {
  count = JSON.parse(readFileSync(file, "utf8")).count;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
writeFileSync(file, JSON.stringify({ count: count + 1 }));
process.stdout.write(JSON.stringify({ result: "stable" }));
