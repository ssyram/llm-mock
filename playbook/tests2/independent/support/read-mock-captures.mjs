import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function readMockCaptures(captureDir) {
  const files = readdirSync(captureDir).filter((name) => name.startsWith("req-")).sort().map((name) => join(captureDir, name));
  return { files, records: files.map((file) => JSON.parse(readFileSync(file, "utf8"))) };
}
