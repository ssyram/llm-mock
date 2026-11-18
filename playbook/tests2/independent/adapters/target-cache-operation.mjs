import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8"));
if (!process.env.PLAYBOOK_ROOT) throw new Error("PLAYBOOK_ROOT is required");
if (input.now !== undefined && !Number.isFinite(input.now)) throw new Error("now must be numeric");
if (input.now !== undefined) Date.now = () => input.now;
const target = await import(pathToFileURL(join(process.env.PLAYBOOK_ROOT, "lang2/cache.mjs")));
const keySpace = input.keySpace ?? input.fileKeys;
let result;
if (input.operation === "save") {
  result = { key: target.save(input.dir, keySpace, input.messages, input.continuation, input.volatileCrossed, { now: input.now, emitted: input.emitted }) };
} else if (input.operation === "restore") {
  result = { hit: target.restore(input.dir, keySpace, input.messages, { now: input.now }) };
} else if (input.operation === "cleanup") {
  target.cleanup(input.dir, input.now);
  result = { cleaned: true };
} else if (input.operation === "sweep") {
  target.sweep(input.dir, input.now);
  result = { swept: true };
} else if (input.operation === "scheduleCleanup") {
  target.scheduleCleanup(input.dir);
  result = { scheduled: true };
} else if (input.operation === "key") {
  result = { key: target.keyFor(keySpace, input.messages, input.upto) };
} else if (input.operation === "acquire") {
  result = { lease: target.acquire(input.dir, input.key, { now: input.now, requestId: input.requestId, pid: input.pid }) };
} else if (input.operation === "release") {
  target.release(input.lease);
  result = { released: true };
} else if (input.operation === "leaseLive") {
  result = { live: target.leaseLive(input.path, input.now) };
} else if (input.operation === "capabilities") {
  result = { exports: Object.keys(target).sort() };
} else {
  throw new Error(`unknown cache operation ${input.operation}`);
}
process.stdout.write(JSON.stringify(result));
