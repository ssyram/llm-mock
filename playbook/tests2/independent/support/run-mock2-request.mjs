import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isolatedEnvironment } from "./isolated-environment.mjs";

export function runMock2Request({ playbook, input, artifactDir, cacheDir = null, timeoutMs = 30000 }) {
  const playbookRoot = process.env.PLAYBOOK_ROOT;
  if (!playbookRoot) throw new Error("PLAYBOOK_ROOT is required");
  mkdirSync(artifactDir, { recursive: true });
  mkdirSync(join(artifactDir, "tmp"), { recursive: true });
  mkdirSync(join(artifactDir, "config"), { recursive: true });
  mkdirSync(join(artifactDir, "cache"), { recursive: true });
  const args = [
    join(playbookRoot, "mock2.mjs"),
    "--playbook", playbook,
    "--judge-timeout-ms", "5000",
    ...(cacheDir ? ["--cache-dir", cacheDir] : ["--no-cache"])
  ];
  const processDir = mkdtempSync(join(artifactDir, "process-"));
  writeFileSync(join(processDir, "input.json"), JSON.stringify(input, null, 2));
  const result = spawnSync(process.execPath, args, {
    cwd: artifactDir,
    env: isolatedEnvironment(artifactDir),
    input: JSON.stringify(input),
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 8 * 1024 * 1024
  });
  writeFileSync(join(processDir, "stdout.txt"), result.stdout ?? "");
  writeFileSync(join(processDir, "stderr.txt"), result.stderr ?? "");
  writeFileSync(join(processDir, "process.json"), JSON.stringify({ command: [process.execPath, ...args], status: result.status, signal: result.signal, error: result.error?.message ?? null }, null, 2));
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal) throw new Error(`mock2 exited ${result.status}, signal ${result.signal}: ${result.stderr}`);
  return {
    output: JSON.parse(result.stdout),
    stderr: result.stderr,
    processDir,
    command: [process.execPath, ...args]
  };
}

export function unifiedInput(messages, context = {}) {
  return {
    api: "openai-completions",
    keyId: "independent-local",
    request: { context: { ...context, messages } }
  };
}
