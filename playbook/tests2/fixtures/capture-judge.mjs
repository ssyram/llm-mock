import { appendFileSync, readFileSync } from "node:fs";

const envelope = JSON.parse(readFileSync(0, "utf8"));
const record = { ...envelope };
try { record.file = JSON.parse(readFileSync(envelope.transcript, "utf8")); } catch { record.file = null; }
appendFileSync(process.env.PLAYBOOK_JUDGE_CAPTURE, `${JSON.stringify(record)}\n`);
process.stdout.write("pass");
