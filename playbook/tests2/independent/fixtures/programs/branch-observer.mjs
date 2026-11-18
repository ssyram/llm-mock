import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
const file = resolve(process.env.PLAYBOOK_TEST_ARTIFACT_DIR, input.with.file);
writeFileSync(file, String(input.with.mode));
process.stdout.write(JSON.stringify({ result: "recorded" }));
