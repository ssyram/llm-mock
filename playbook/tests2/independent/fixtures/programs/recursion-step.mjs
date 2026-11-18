import { readFileSync } from "node:fs";

const envelope = JSON.parse(readFileSync(0, "utf8"));
const remaining = Number(envelope.with.remaining);
if (!Number.isInteger(remaining) || remaining < 0) {
  process.stderr.write("remaining must be a non-negative integer");
  process.exit(2);
}
process.stdout.write(JSON.stringify({
  result: remaining === 0 ? "done" : "recurse",
  values: { next: Math.max(0, remaining - 1) }
}));
