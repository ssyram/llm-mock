import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export default function llmCorpusCapture(pi: ExtensionAPI) {
  let pending: Promise<void> = Promise.resolve();
  const initialized = new Set<string>();

  function observe(ctx: ExtensionContext, message?: Message): Promise<void> {
    const directory = join(ctx.cwd, ".pi", "mock-corpus");
    const sessionId = ctx.sessionManager.getSessionId();
    const base = join(directory, `capture-${sessionId}`);
    const metadata = {
      sessionId,
      provider: ctx.model?.provider ?? null,
      model: ctx.model?.id ?? null,
      api: ctx.model?.api ?? null,
      startedAt: Date.parse(ctx.sessionManager.getHeader()?.timestamp ?? "") || Date.now(),
      captureStartedAt: Date.now(),
    };

    async function logError(error: unknown): Promise<void> {
      try {
        // Error messages may contain captured content; record only name and filesystem code.
        const record = {
          loggedAt: Date.now(),
          name: error instanceof Error ? error.name : "UnknownError",
          code: error instanceof Error && "code" in error ? error.code : null,
        };
        await appendFile(`${base}.errors.jsonl`, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      } catch {
        // A read-only/full filesystem can prevent both capture and its error log.
      }
    }

    let line: string | undefined;
    try {
      if (message) line = `${JSON.stringify({ capturedAt: Date.now(), message })}\n`;
    } catch (error) {
      pending = pending.then(() => logError(error));
      return pending;
    }

    pending = pending.then(async () => {
      try {
        if (!initialized.has(base)) {
          await mkdir(directory, { recursive: true, mode: 0o700 });
          try {
            await writeFile(`${base}.meta.json`, `${JSON.stringify(metadata)}\n`, {
              flag: "wx",
              mode: 0o600,
            });
          } catch (error) {
            if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
          }
          initialized.add(base);
        }
        if (line !== undefined) await appendFile(`${base}.jsonl`, line, { mode: 0o600 });
      } catch (error) {
        await logError(error);
      }
    });
    return pending;
  }

  pi.on("session_start", (_event, ctx) => observe(ctx));
  pi.on("message_end", (event, ctx) => {
    const message = event.message;
    if (
      message.role === "system" ||
      message.role === "user" ||
      message.role === "assistant" ||
      message.role === "toolResult"
    ) {
      return observe(ctx, message);
    }
  });
  pi.on("session_shutdown", async () => {
    await pending;
  });
}
