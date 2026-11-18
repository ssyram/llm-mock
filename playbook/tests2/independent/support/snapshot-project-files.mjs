import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    if (entry.isSymbolicLink()) throw new Error(`project snapshot refuses symlink ${path}`);
    return [path];
  });
}

export function snapshotProjectFiles(projectDir) {
  return Object.fromEntries(filesUnder(projectDir).sort().map((path) => {
    const content = readFileSync(path);
    return [relative(projectDir, path), {
      size: content.length,
      sha256: createHash("sha256").update(content).digest("hex")
    }];
  }));
}
