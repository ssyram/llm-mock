import { readdirSync } from "node:fs";
import { basename, join } from "node:path";

const excluded = new Set(["node_modules", "artifacts", "fixtures", "retired", "integrations"]);

function walk(root, predicate) {
  if (excluded.has(basename(root))) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return excluded.has(entry.name) ? [] : walk(path, predicate);
    return entry.isFile() && predicate(entry.name) ? [path] : [];
  });
}

export function discoverTests(roots) {
  const files = [...new Set(roots.flatMap((root) => walk(root, (name) => name.endsWith(".test.mjs"))))].sort();
  if (!files.length) throw new Error("no active *.test.mjs files selected");
  return files;
}

export function discoverSources(root) {
  const files = walk(root, (name) => name.endsWith(".mjs")).sort();
  if (!files.length) throw new Error("no active .mjs sources selected");
  return files;
}
