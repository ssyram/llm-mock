import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { showcaseCases } from "../contract/full-showcase-scenarios.mjs";
import { runShowcaseCase } from "../support/run-showcase-case.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const playbookRoot = join(repo, "playbook");
const playbook = join(playbookRoot, "examples2/full-showcase/showcase.md");
const mount = join(playbookRoot, "examples2/full-showcase/transport/mount.mjs");
const serverBin = process.env.MOCK_SERVER_BIN ?? join(repo, "target/debug/mock-llm-server");
process.env.PLAYBOOK_ROOT = playbookRoot;
if (!existsSync(serverBin)) throw new Error(`mock server unavailable: ${serverBin}`);
const available = [...showcaseCases.map((item) => ({ ...item, inputs: ["1", item.input] })),
  { id: "invalid-first", inputs: ["invalid"], invalid: true }];
const option = process.argv.slice(2);
if (option.length && (option.length !== 2 || option[0] !== "--case")) throw new Error("usage: run-full-showcase-pi.mjs [--case CASE]");
const selected = option.length ? available.filter((item) => item.id === option[1]) : available;
if (!selected.length) throw new Error(`unknown case: ${option[1]}`);
const base = process.env.PLAYBOOK_PI_ARTIFACTS ?? join(repo, "target/test-artifacts/playbook-pi");
mkdirSync(base, { recursive: true });
const runDir = mkdtempSync(join(base, "full-showcase-"));
console.log(JSON.stringify({ runDir, playbook, cases: selected.map((item) => item.id), partialSelection: Boolean(option.length) }, null, 2));
const cases = [];
for (const testCase of selected) {
  const result = await runShowcaseCase({ testCase, runDir: join(runDir, testCase.id), playbook, serverBin, mount });
  cases.push({ case: result.case, status: result.status, runDir: result.runDir, failure: result.failure?.message ?? null });
  console.log(`${result.status.toUpperCase()} ${result.case}: ${result.runDir}`);
}
const summary = { playbook, cases, partialSelection: Boolean(option.length), status: cases.every((item) => item.status === "passed") ? "passed" : "failed" };
writeFileSync(join(runDir, "run.json"), JSON.stringify(summary, null, 2));
if (summary.status !== "passed") process.exitCode = 1;
