import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mergeCliFlags } from "./merge-cli-flags.mjs";
import { isolatedEnvironment } from "./isolated-environment.mjs";

export function runIsolatedPiSession({ runDir, baseUrl, messages = ["start", "continue"] }) {
  const agentDir = join(runDir, "pi-agent");
  const projectDir = join(runDir, "project");
  const sessionDir = join(runDir, "pi-sessions");
  const tempDir = join(runDir, "tmp");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(sessionDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });
  writeFileSync(join(agentDir, "models.json"), JSON.stringify({
    providers: {
      contract: {
        baseUrl: `${baseUrl}/contract/v1`,
        api: "openai-completions",
        apiKey: "contract",
        models: [{ id: "mock-m", name: "Mock", reasoning: false, contextWindow: 100000, maxTokens: 1024 }]
      }
    }
  }));
  const baseFlags = [
    "--print", "--offline", "--approve", "--no-extensions", "--no-skills",
    "--no-prompt-templates", "--no-themes", "--no-context-files", "--no-mcp",
    "--thinking", "off", "--tools", "bash", "--system-prompt", "local-contract",
    "--model", "contract/mock-m", "--session-dir", sessionDir
  ];
  const env = isolatedEnvironment(runDir, { PI_CODING_AGENT_DIR: agentDir });
  const turns = [];
  for (const [index, message] of messages.entries()) {
    const turn = runTurn({ runDir, projectDir, env, baseFlags, label: `turn-${index + 1}`, message, extra: index ? ["-c"] : [] });
    turns.push(turn);
    if (turn.status !== 0 || turn.signal || turn.error) break;
  }
  return { agentDir, projectDir, sessionDir, turns };
}

function runTurn({ runDir, projectDir, env, baseFlags, label, message, extra }) {
  const piBin = process.env.PI_BIN ?? "pi";
  const args = mergeCliFlags(baseFlags, extra, [message]);
  const result = spawnSync(piBin, args, {
    cwd: projectDir,
    env,
    encoding: "utf8",
    timeout: 90000,
    maxBuffer: 8 * 1024 * 1024
  });
  const stdoutFile = join(runDir, `${label}.stdout`);
  const stderrFile = join(runDir, `${label}.stderr`);
  writeFileSync(stdoutFile, result.stdout ?? "");
  writeFileSync(stderrFile, result.stderr ?? "");
  const record = { status: result.status, signal: result.signal, error: result.error?.message ?? null, stdoutFile, stderrFile, command: [piBin, ...args] };
  writeFileSync(join(runDir, `${label}.json`), JSON.stringify(record, null, 2));
  return { ...record, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}
