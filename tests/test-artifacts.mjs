import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const artifactDir = resolve(process.env.MOCK_TEST_ARTIFACTS ?? resolve(root, "target/test-artifacts"));
mkdirSync(artifactDir, { recursive: true });
export const artifactPath = (name) => resolve(artifactDir, name);
