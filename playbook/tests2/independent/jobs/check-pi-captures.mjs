import { showcaseCases, fullShowcaseScenario } from "../contract/full-showcase-scenarios.mjs";
import { checkPiFrontiers } from "../oracle/pi-frontiers.mjs";
import { readMockCaptures } from "../support/read-mock-captures.mjs";
import { readPiSessionFile } from "../support/read-pi-session.mjs";

const args = process.argv.slice(2);
if (args.length !== 6 || args[0] !== "--session" || args[2] !== "--captures" || args[4] !== "--case") {
  throw new Error("usage: check-pi-captures.mjs --session FILE --captures DIR --case CASE");
}
const testCase = showcaseCases.find((item) => item.id === args[5]);
if (!testCase) throw new Error(`unknown case ${args[5]}`);
const session = readPiSessionFile(args[1]);
const captures = readMockCaptures(args[3]).records.filter((record) => record.keyId === "contract");
const result = checkPiFrontiers({ session, captures, expected: fullShowcaseScenario(testCase) });
console.log(JSON.stringify({ status: result.status, replayed: false, case: testCase.id,
  frontiers: result.frontiers.map(({ seq, index, state, outcome }) => ({ seq, index, state, outcome })) }, null, 2));
if (result.status !== "complete") process.exitCode = 1;
