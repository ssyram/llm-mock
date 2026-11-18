import { assertNoDuplicateFlags } from "./merge-cli-flags.mjs";

const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export function renderMockMountCommand(playbook, playbookRoot, cacheDir) {
  const raw = process.env.PLAYBOOK_MOUNT_COMMAND_JSON;
  let argv;
  if (raw) {
    try {
      argv = JSON.parse(raw);
    } catch {
      throw new Error("PLAYBOOK_MOUNT_COMMAND_JSON must be a JSON argv array");
    }
  } else {
    argv = [process.execPath, "{root}/mock2.mjs", "--playbook", "{playbook}", "--cache-dir", "{cacheDir}"];
  }
  if (!Array.isArray(argv) || argv.length === 0 || argv.some((part) => typeof part !== "string")) {
    throw new Error("PLAYBOOK_MOUNT_COMMAND_JSON must be a non-empty JSON argv array of strings");
  }
  const rendered = argv.map((part) => part
    .replaceAll("{playbook}", playbook)
    .replaceAll("{root}", playbookRoot)
    .replaceAll("{cacheDir}", cacheDir));
  assertNoDuplicateFlags(rendered.slice(1));
  return rendered.map(shellQuote).join(" ");
}
