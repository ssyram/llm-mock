import { appendFileSync, readFileSync } from "node:fs";

const envelope = JSON.parse(readFileSync(0, "utf8"));
appendFileSync(process.env.PLAYBOOK_PROGRAM_CAPTURE, `${JSON.stringify(envelope)}\n`);
process.stdout.write(JSON.stringify({ result: "program-result" }));
