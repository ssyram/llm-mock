import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isolatedEnvironment } from "../independent/support/isolated-environment.mjs";

function tapCount(stdout, name) {
  const match = stdout.match(new RegExp(`^# ${name} (\\d+)$`, "m"));
  return match ? Number(match[1]) : null;
}

export function executeJob(job, { repo, runDir, extraEnv = {} }) {
  const dir = join(runDir, job.id);
  mkdirSync(dir, { recursive: true });
  const env = isolatedEnvironment(dir, { ...extraEnv, MOCK_TEST_ARTIFACTS: join(dir, "evidence"),
    PLAYBOOK_PI_ARTIFACTS: join(dir, "pi-artifacts"), PLAYBOOK_INDEPENDENT_ARTIFACTS: join(dir, "independent-artifacts") });
  const started = Date.now();
  const result = spawnSync(job.command[0], job.command.slice(1), {
    cwd: repo, env, encoding: "utf8", timeout: job.timeoutMs ?? 180000, maxBuffer: 32 * 1024 * 1024
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const stdoutFile = join(dir, "stdout.log");
  const stderrFile = join(dir, "stderr.log");
  writeFileSync(stdoutFile, stdout);
  writeFileSync(stderrFile, stderr);
  const counts = job.testFile ? { total: tapCount(stdout, "tests"), passed: tapCount(stdout, "pass"),
    failed: tapCount(stdout, "fail"), skipped: tapCount(stdout, "skipped") } : null;
  const casesObserved = job.testFile ? [...stdout.matchAll(/^(?:ok|not ok) \d+ - (.+)$/gm)].map((match) => match[1]) : [];
  const onlyFileWrapper = casesObserved.length === 1 && casesObserved[0] === job.command.at(-1);
  const noTests = job.testFile && (!(counts.total > 0) || onlyFileWrapper);
  const passed = result.status === 0 && result.signal === null && !result.error && !noTests && (!counts || counts.failed === 0);
  const skipReasons = job.testFile ? casesObserved.filter((name) => /# SKIP\b/i.test(name)) : [];
  return { ...job, status: passed ? "passed" : "failed", exit: result.status, signal: result.signal,
    error: result.error?.message ?? (noTests ? "test file reported zero tests" : null), durationMs: Date.now() - started,
    counts, casesObserved, skipReasons, stdoutFile, stderrFile };
}
