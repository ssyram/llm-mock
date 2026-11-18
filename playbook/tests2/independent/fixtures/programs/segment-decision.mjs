import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const envelope = JSON.parse(readFileSync(0, "utf8"));
if (envelope.with.observationFile) {
  const file = resolve(process.env.PLAYBOOK_TEST_ARTIFACT_DIR, envelope.with.observationFile);
  writeFileSync(file, JSON.stringify({ mode: envelope.with.mode }));
}
process.stdout.write(JSON.stringify({ result: envelope.with.mode === "skip" ? "skip" : "continue" }));
