// judge 外接命令执行器：由播放器（本 mock 脚本进程）而非 Pi 工具执行。
// stdin 是 JSON envelope（message/context/location/targets），stdout 必须是
// 恰好 "pass" 或 "fail"（trim 后逐字相等），exit 0。非零退出、超时、非法输出
// 一律是 error（playbook_judge_error）：必须停止，绝不 fall through 到其他
// case/剧本；stderr 作为诊断进入错误消息。命令以剧本目录为 cwd（相对
// judges/ 路径可用），每个 judge 进程有有限超时（默认见 DEFAULT）。
// 契约要求 judge 只判断、无业务副作用、可重入：框架逐请求重建历史会重跑。
import { spawnSync } from "node:child_process";

export const DEFAULT_JUDGE_TIMEOUT_MS = 10000;

const snippet = (text, cap = 200) => {
	const flat = String(text ?? "").replace(/\s+/g, " ");
	return flat.length > cap ? `${flat.slice(0, cap)}…` : flat;
};

const judgeError = (message) => ({ error: { status: 422, code: "playbook_judge_error", message } });

export function runJudgeCommand(command, envelope, { cwd, timeoutMs = DEFAULT_JUDGE_TIMEOUT_MS }) {
	let result;
	try {
		result = spawnSync(command, { shell: true, input: JSON.stringify(envelope), timeout: timeoutMs, encoding: "utf8", cwd, maxBuffer: 1024 * 1024 });
	} catch (error) {
		return judgeError(`judge command could not be executed: ${error}`);
	}
	if (result.error) {
		if (result.error.code === "ETIMEDOUT" || result.signal) return judgeError(`judge command timed out after ${timeoutMs}ms and was killed: ${snippet(command)}`);
		return judgeError(`judge command failed to start: ${result.error.message} (${snippet(command)})`);
	}
	if (result.status !== 0) {
		return judgeError(`judge command must exit 0, got status ${result.status}: ${snippet(command)}; stderr: ${snippet(result.stderr)}`);
	}
	const out = String(result.stdout ?? "").trim();
	if (out === "pass") return { pass: true };
	if (out === "fail") return { pass: false };
	return judgeError(`judge command stdout must be exactly "pass" or "fail", got ${JSON.stringify(snippet(out))}: ${snippet(command)}; stderr: ${snippet(result.stderr)}`);
}
