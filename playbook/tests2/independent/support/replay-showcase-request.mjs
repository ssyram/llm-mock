import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindShell, bindReply } from "../../../examples2/full-showcase/transport/bind-shell.mjs";
import { runMock2Request } from "./run-mock2-request.mjs";

function cacheEntries(dir) {
  try {
    return Object.fromEntries(readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => {
      const entry = JSON.parse(readFileSync(join(dir, name), "utf8"));
      return [name, { savedAt: entry.savedAt, usedAt: entry.usedAt }];
    }));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export function replayShowcaseRequest({ playbook, input, artifactDir, cacheDir = null }) {
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, "provider-input.json"), JSON.stringify(input, null, 2));
  const before = cacheDir ? cacheEntries(cacheDir) : {};
  const binding = bindShell(input, "pi");
  const result = runMock2Request({ playbook, input: binding.request, artifactDir, cacheDir });
  const reply = bindReply(result.output, binding);
  writeFileSync(join(artifactDir, "provider-reply.json"), JSON.stringify(reply, null, 2));
  const after = cacheDir ? cacheEntries(cacheDir) : {};
  const hits = Object.keys(before).filter((name) => after[name] &&
    after[name].savedAt === before[name].savedAt && after[name].usedAt > before[name].usedAt);
  const witness = { before, after, touchedExistingEntries: hits };
  writeFileSync(join(artifactDir, "cache-witness.json"), JSON.stringify(witness, null, 2));
  return { reply, witness, command: result.command };
}
