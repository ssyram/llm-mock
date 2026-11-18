import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function findJsonl(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return findJsonl(path);
    return entry.name.endsWith(".jsonl") ? [path] : [];
  });
}

export function readLatestPiSession(sessionDir) {
  const files = findJsonl(sessionDir).sort((left, right) => statSync(left).mtimeMs - statSync(right).mtimeMs);
  if (files.length === 0) throw new Error(`no Pi session JSONL found in ${sessionDir}`);
  return { ...readPiSessionFile(files.at(-1)), files };
}

export function readPiSessionFile(file) {
  const entries = readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const messages = entries.filter((entry) => entry.type === "message").map((entry) => entry.message);
  return { file, entries, messages };
}
