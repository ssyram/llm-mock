import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { assertNoDuplicateFlags } from "../support/merge-cli-flags.mjs";

export function compilePlaybook(playbook, cwd) {
  const raw = process.env.PLAYBOOK_COMPILE_COMMAND_JSON ?? JSON.stringify([
    process.execPath,
    join(process.env.PLAYBOOK_ROOT ?? "", "mock2.mjs"),
    "--compile-observations",
    "{playbook}"
  ]);
  let command;
  try {
    command = JSON.parse(raw);
  } catch {
    throw new Error("PLAYBOOK_COMPILE_COMMAND_JSON must be a JSON argv array");
  }
  if (!Array.isArray(command) || command.length === 0 || command.some((part) => typeof part !== "string")) {
    throw new Error("PLAYBOOK_COMPILE_COMMAND_JSON must be a non-empty JSON argv array of strings");
  }
  const rendered = command.map((part) => part.replaceAll("{playbook}", playbook).replaceAll("{cwd}", cwd));
  assertNoDuplicateFlags(rendered.slice(1));
  const tempDir = join(cwd, "tmp");
  mkdirSync(tempDir, { recursive: true });
  const result = spawnSync(rendered[0], rendered.slice(1), {
    cwd,
    env: {
      ...process.env,
      PLAYBOOK_TEST_ARTIFACT_DIR: cwd,
      TMPDIR: tempDir,
      XDG_CONFIG_HOME: join(cwd, "config"),
      XDG_CACHE_HOME: join(cwd, "cache")
    },
    input: "{}",
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`compile adapter exited ${result.status}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}
