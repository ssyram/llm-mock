// 多剧本路由：mock.mjs 可重复 --playbook 挂载多份剧本，按显式 argv 顺序对
// 首条 user 输入求值；首个明确 match 的剧本被选中，此后同一会话的归属完全
// 由 transcript 的首条 user 消息确定性重建（每请求新进程也稳定），绝不依赖
// 进程内变量。no-match 才尝试下一个剧本；judge error 立即返回、绝不落到
// 后续剧本；全部 no-match / 没有可用首条 user 消息（如 compaction 后）都是
// 协议可见错误，不静默猜测归属。
import { evaluateCases } from "./case-matcher.mjs";
import { snippet } from "./parse-yaml.mjs";
import { userText } from "./playbook-runtime.mjs";

const error = (code, message) => ({ error: { status: 422, code, message } });

export function selectPlaybook(entries, messages) {
	let first = -1;
	for (let m = 0; m < messages.length; m++) {
		if (messages[m]?.role === "user") {
			first = m;
			break;
		}
	}
	if (first === -1) {
		return error("playbook_routing_unknown", `multi-playbook routing cannot be restored: the transcript contains no user message (session compacted or foreign client); playbooks in argv order: ${entries.map((e) => e.path).join(", ")}`);
	}
	const text = userText(messages[first]);
	for (const entry of entries) {
		const step = entry.steps[0];
		const verdict = evaluateCases(step, text, messages[first], { messages, index: first, ...entry.options });
		if (verdict.error) return verdict;
		if (verdict.noMatch) continue;
		return { selected: entry };
	}
	return error("playbook_no_match", `no playbook matched the first user input ${JSON.stringify(snippet(text))}; tried ${entries.length} playbook(s) in argv order: ${entries.map((e) => e.path).join(", ")}`);
}
