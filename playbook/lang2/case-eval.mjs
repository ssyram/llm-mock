// next-language cases 裁决：有序首匹配。原子匹配器（exact/contains/any/
// otherwise）只处理明确选出的 subject；judge/judger 是 translation 命令，
// envelope 与外接程序同构（{transcript, pointer, subject?}），stdout 恰为
// pass|fail。程序故障=playbook_judge_error 硬停，绝不作 no-match。
import { runJudgeCommand } from "../judge-exec.mjs";
import { runExternalProgram } from "../program-exec.mjs";
import { deepEqual } from "../transcript-check.mjs";

const programFail = (code, message) => ({ error: { status: 422, code, message } });

function matchesAtom(item, subject) {
	if (item.matcher === "any" || item.matcher === "otherwise") return true;
	if (item.matcher === "exact") return deepEqual(subject, item.value);
	if (item.matcher === "contains") return typeof subject === "string" && subject.includes(item.value);
	return false;
}

export function evaluateCases(cases, subject, judgeEnv) {
	if (!Array.isArray(cases) || cases.length === 0) {
		return programFail("playbook_invalid", "cases 为空：无法裁决");
	}
	if (judgeEnv.translate) {
		const outcome = runExternalProgram(judgeEnv.translate, { transcript: judgeEnv.transcript, pointer: judgeEnv.pointer, subject }, { cwd: judgeEnv.cwd, timeoutMs: judgeEnv.timeoutMs });
		if (outcome.error) return outcome.error.code === "playbook_program_error" ? outcome : programFail("playbook_program_error", `translate: ${outcome.error.message}`);
		let translated;
		try {
			translated = JSON.parse(outcome.stdout);
		} catch (error) {
			return programFail("playbook_program_error", `translate stdout 必须是单 JSON 值: ${error}`);
		}
		subject = translated;
	}
	let ordinal = 0;
	for (const item of cases) {
		ordinal += 1;
		if (item.matcher !== "judge" && item.matcher !== "judger") {
			if (matchesAtom(item, subject)) return { case: item };
			continue;
		}
		const envelope = judgeEnv.forCase(ordinal, item);
		const outcome = runJudgeCommand(item.value, envelope, { cwd: judgeEnv.cwd, timeoutMs: judgeEnv.timeoutMs });
		if (outcome.error) return outcome;
		if (outcome.pass) return { case: item };
	}
	return { noMatch: true };
}

export function describeCases(cases) {
	return `${cases.length} case(s) [${cases.map((item) => `${item.matcher}: ${JSON.stringify(item.value)}`).join("; ")}]`;
}
