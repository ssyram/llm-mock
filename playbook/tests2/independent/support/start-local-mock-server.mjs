import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isolatedEnvironment } from "./isolated-environment.mjs";

const minimalReply = {
  content: [{ type: "text", text: "bootstrap" }],
  api: "openai-completions",
  provider: "local",
  model: "bootstrap",
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  stopReason: "stop",
  timestamp: 0
};

export async function startLocalMockServer({ serverBin, runDir, mountCommand }) {
  const serverDir = join(runDir, "server");
  const captureDir = join(runDir, "captures");
  mkdirSync(serverDir, { recursive: true });
  mkdirSync(captureDir, { recursive: true });
  mkdirSync(join(runDir, "tmp"), { recursive: true });
  const replyPath = join(serverDir, "bootstrap-reply.json");
  const registryPath = join(serverDir, "registry.json");
  const mountsPath = join(serverDir, "mounts.json");
  writeFileSync(replyPath, JSON.stringify(minimalReply));
  writeFileSync(registryPath, JSON.stringify({ entries: [{ keyId: "bootstrap", matcher: { type: "any" }, reply: { type: "file", path: replyPath } }] }));
  writeFileSync(mountsPath, JSON.stringify({}));
  const args = ["--port", "0", "--registry", registryPath, "--capture-dir", captureDir, "--mounts-file", mountsPath];
  const child = spawn(serverBin, args, {
    cwd: runDir,
    env: isolatedEnvironment(runDir)
  });
  const stdoutLog = createWriteStream(join(serverDir, "stdout.log"));
  const stderrLog = createWriteStream(join(serverDir, "stderr.log"));
  let output = "";
  let spawnError;
  child.once("error", (error) => {
    spawnError = error;
  });
  child.stdout.on("data", (chunk) => {
    output += String(chunk);
    stdoutLog.write(chunk);
  });
  child.stderr.on("data", (chunk) => stderrLog.write(chunk));
  let port;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const match = output.match(/listening on http:\/\/127\.0\.0\.1:(\d+)/);
    if (match) {
      port = Number(match[1]);
      break;
    }
    if (spawnError) {
      await stopChild(child, stdoutLog, stderrLog);
      throw spawnError;
    }
    if (child.exitCode !== null) {
      await stopChild(child, stdoutLog, stderrLog);
      throw new Error(`mock server exited ${child.exitCode}; see ${serverDir}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!port) {
    await stopChild(child, stdoutLog, stderrLog);
    throw new Error(`mock server did not become ready; see ${serverDir}`);
  }
  const baseUrl = `http://127.0.0.1:${port}`;
  const registrationArgs = ["add", mountCommand, "--name", "contract", "--server-url", baseUrl];
  const registration = spawnSync(serverBin, registrationArgs, { cwd: runDir, env: isolatedEnvironment(runDir), encoding: "utf8", timeout: 30000 });
  writeFileSync(join(serverDir, "registration.stdout"), registration.stdout ?? "");
  writeFileSync(join(serverDir, "registration.stderr"), registration.stderr ?? "");
  if (registration.error) {
    await stopChild(child, stdoutLog, stderrLog);
    throw registration.error;
  }
  if (registration.status !== 0) {
    await stopChild(child, stdoutLog, stderrLog);
    throw new Error(`mount registration exited ${registration.status}: ${registration.stderr}`);
  }
  return {
    baseUrl,
    captureDir,
    command: [serverBin, ...args],
    registrationCommand: [serverBin, ...registrationArgs],
    stop: () => stopChild(child, stdoutLog, stderrLog)
  };
}

async function stopChild(child, stdoutLog, stderrLog) {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000))
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
  stdoutLog.end();
  stderrLog.end();
}
