// mock2 挂载驱动：按请求序 spawn mock2.mjs、回喂 transcript、模拟宿主工具执行。
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const mock2 = join(here, "..", "..", "mock2.mjs");

export function session({ playbook, cacheDir, timeoutMs = 15000 } = {}) {
	const messages = [];
	const call = (extraArgs = []) => {
		const input = { api: "openai-completions", model: "mock-m", request: { context: { messages } } };
		const done = spawnSync(process.execPath, [mock2, "--playbook", playbook, "--judge-timeout-ms", String(timeoutMs), ...(cacheDir ? ["--cache-dir", cacheDir] : ["--no-cache"]), ...extraArgs], {
			input: JSON.stringify(input), encoding: "utf8", timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024,
		});
		if (done.status !== 0) throw new Error(`mock2 exited ${done.status}: ${done.stderr}`);
		return { reply: JSON.parse(done.stdout), stderr: done.stderr, stdout: done.stdout };
	};
	const pushUser = (text) => messages.push({ role: "user", content: text });
	const pushToolResults = (reply, texts) => {
		messages.push({ role: "assistant", content: reply.content });
		const calls = reply.content.filter((b) => b.type === "toolCall");
		for (let i = 0; i < calls.length; i += 1) {
			messages.push({ role: "toolResult", toolCallId: calls[i].id, toolName: calls[i].name, content: [{ type: "text", text: texts[calls[i].id] ?? `out:${calls[i].name}` }] });
		}
	};
	return { messages, call, pushUser, pushToolResults };
}

export const errorOf = (result) => result.error?.code ?? result.reply?.error?.code;
export const callsOf = (reply) => (reply.content ?? reply.reply?.content ?? []).filter((b) => b.type === "toolCall");
export const textOf = (reply) => (reply.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
