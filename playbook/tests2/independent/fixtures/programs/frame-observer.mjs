import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
const initial = input.with.local;
if (initial !== "unset") {
  process.stderr.write(`local frame leaked: ${JSON.stringify(initial)}`);
  process.exit(2);
}
process.stdout.write(JSON.stringify({
  result: "observed",
  values: { next: `seen:${input.with.token}` }
}));
