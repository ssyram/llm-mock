import { readFileSync } from "node:fs";

const envelope = JSON.parse(readFileSync(0, "utf8"));
process.stdout.write(String(envelope.subject).includes("explicit-compaction-marker") ? "pass" : "fail");
