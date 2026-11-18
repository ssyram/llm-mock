import { accessSync, constants, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isolatedEnvironment } from "./independent/support/isolated-environment.mjs";
import { executeJob } from "./local-suite/execute-job.mjs";
import { suitePlan } from "./local-suite/suite-plan.mjs";
import { suiteStatus } from "./local-suite/suite-result.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const playbook = join(repo, "playbook");
const server = process.env.MOCK_SERVER_BIN ?? join(repo, "target/debug/mock-llm-server");
const pi = process.env.PI_BIN ?? "pi";
const plan = suitePlan(repo);
if (process.argv.length > 3 || (process.argv[2] && process.argv[2] !== "--list")) throw new Error("usage: run-local-suite.mjs [--list]");
console.log(JSON.stringify({ selected: plan.jobs, selectedTestFiles: plan.selectedTestFiles, exclusions: plan.exclusions }, null, 2));
if (process.argv[2] === "--list") process.exit(0);
const base = join(repo, "target/test-artifacts/playbook-local-suite");
mkdirSync(base, { recursive: true });
const runDir = mkdtempSync(join(base, "suite-"));
const env = isolatedEnvironment(join(runDir, "preflight"));
let yaml = true;
try { createRequire(join(playbook, "package.json")).resolve("yaml"); }
catch (error) { if (error.code === "MODULE_NOT_FOUND") yaml = false; else throw error; }
let executable = true;
try { accessSync(server, constants.X_OK); } catch { executable = false; }
const piProbe = spawnSync(pi, ["--version"], { env, encoding: "utf8", timeout: 10000 });
const piMissing = ["ENOENT", "EACCES"].includes(piProbe.error?.code);
const preflight = {
  yaml: { available: yaml, reason: yaml ? null : `yaml dependency missing under ${playbook}/node_modules` },
  server: { available: executable, reason: executable ? null : `mock server executable missing: ${server}` },
  pi: { available: !piMissing, healthy: piProbe.status === 0 && !piProbe.error && !piProbe.signal,
    reason: piMissing ? `Pi executable unavailable: ${piProbe.error.message}` : null,
    probeStatus: piProbe.status, probeSignal: piProbe.signal, probeError: piProbe.error?.message ?? null }
};
const summary = { runDir, preflight, selected: plan.jobs, exclusions: plan.exclusions, results: [], status: "running" };
const resultsFile = join(runDir, "results.json");
console.log(JSON.stringify({ runDir, preflight }, null, 2));
for (const job of plan.jobs) {
  const missing = job.needs.filter((name) => !preflight[name].available);
  let result;
  if (missing.length) {
    result = { ...job, status: "unavailable", exit: null, signal: null, counts: null, durationMs: 0,
      skipReasons: missing.map((name) => preflight[name].reason) };
  } else {
    result = executeJob(job, { repo, runDir, extraEnv: { PLAYBOOK_ROOT: playbook, MOCK_SERVER_BIN: server, PI_BIN: pi } });
    if (job.id === "pi-full-showcase") result.caseRuns = readCaseRuns(join(runDir, job.id, "pi-artifacts"));
  }
  summary.results.push(result);
  writeFileSync(resultsFile, JSON.stringify(summary, null, 2));
  console.log(`${result.status.toUpperCase()} ${job.id} ${job.file ?? ""} exit=${result.exit}`);
}
summary.status = suiteStatus(summary.results, yaml);
writeFileSync(resultsFile, JSON.stringify(summary, null, 2));
console.log(`RESULT ${summary.status} ${resultsFile}`);
if (summary.status !== "passed") process.exitCode = 1;

function readCaseRuns(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.startsWith("full-showcase-")).flatMap((name) => {
    const root = join(directory, name);
    const summaryPath = join(root, "run.json");
    if (!existsSync(summaryPath)) return [{ status: "partial", directory: root }];
    const result = JSON.parse(readFileSync(summaryPath, "utf8"));
    return result.cases.map((item) => {
      const path = join(item.runDir, "run.json");
      return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : { ...item, status: "partial" };
    });
  });
}
