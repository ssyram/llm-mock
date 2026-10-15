// pi-ai import shim: the repo-local pi-mono checkout's dist/ is stale
// (built against the pre-rename @sinclair/typebox), so import from src/.
// Node >= 23 strips TS types natively. Locked at pi-ai 1.2.0 (HEAD 371cc25).
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const testsDir = dirname(fileURLToPath(import.meta.url));
export const piAiSrc = resolve(testsDir, "../../pi-mono/packages/ai/src");

export const piAi = await import(`${piAiSrc}/index.ts`);
export const occ = await import(`${piAiSrc}/api/openai-completions.ts`);
export const ores = await import(`${piAiSrc}/api/openai-responses.ts`);
export const am = await import(`${piAiSrc}/api/anthropic-messages.ts`);
export const gai = await import(`${piAiSrc}/api/google-generative-ai.ts`);
export const tm = await import(`${piAiSrc}/api/transform-messages.ts`);
export const azure = await import(`${piAiSrc}/api/azure-openai-responses.ts`);
export const codex = await import(`${piAiSrc}/api/openai-codex-responses.ts`);
export const vertex = await import(`${piAiSrc}/api/google-vertex.ts`);
export const bedrock = await import(`${piAiSrc}/api/bedrock-converse-stream.ts`);
export const mistral = await import(`${piAiSrc}/api/mistral-conversations.ts`);
export const pm = await import(`${piAiSrc}/api/pi-messages.ts`);
export const sampling = await import(`${piAiSrc}/api/constrained-sampling.ts`);
export const text = await import(`${piAiSrc}/utils/text.ts`);
