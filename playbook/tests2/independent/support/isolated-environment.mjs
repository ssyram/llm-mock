import { mkdirSync } from "node:fs";
import { join } from "node:path";

export function isolatedEnvironment(runDir, extra = {}) {
  const locations = {
    HOME: "home", TMPDIR: "tmp", XDG_CONFIG_HOME: "config", XDG_CACHE_HOME: "cache",
    XDG_DATA_HOME: "data", XDG_STATE_HOME: "state"
  };
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", LANG: "C.UTF-8", PI_OFFLINE: "1" };
  for (const [name, dir] of Object.entries(locations)) {
    env[name] = join(runDir, dir);
    mkdirSync(env[name], { recursive: true });
  }
  return { ...env, PLAYBOOK_TEST_ARTIFACT_DIR: runDir, ...extra };
}
