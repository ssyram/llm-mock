// Markdown playbook 解析器：认 ```say/```assistant/```call <tool>/```expect/
// ```user/```toolResult/```end/```aggregator/```segment 九种内容块，外加
// ```response … ```/response 显式分组（组内 say/call/expect/toolResult 合并成
// 一条 assistant 消息：文本 + 多个 toolCalls）。标题、prose 与 <a id="…"></a>
// 锚点行只用于阅读/定位/跳转，绝不进入模型输出；锚点不得声明在 response 组
// 内部（组必须整组进入，不能半途落入）。空 say 块透明：不产出文本、不作为
// 分组屏障、不生成空 assistant 消息。user 与 toolResult 块体是 case 列表
//（或 user 旧 mapping 便捷写法）；aggregator/segment 块体是 {command, cases}。
// pass.to 在收集全部锚点后统一解析，随后运行 AFFINE/aggregator 结构分析
//（affine-analysis.mjs）。输出扁平 steps 序列，运行时按序消费。
import { analyzeAffine } from "./affine-analysis.mjs";
import { parseCases } from "./parse-cases.mjs";
import { parseProgramBlock } from "./parse-programs.mjs";
import { parseMapping, PlaybookError, snippet } from "./parse-yaml.mjs";

const FENCE_OPEN = /^```[ \t]*(\S.*?)[ \t]*$/;
const FENCE_CLOSE = /^```[ \t]*$/;
const ANCHOR = /^[ \t]*<a id="([^"]+)"><\/a>[ \t]*$/;
const ALLOWED = ["say", "assistant", "call", "expect", "user", "toolResult", "end", "aggregator", "segment", "response", "/response"];
const GROUP_ONLY = ["say", "assistant", "call", "expect", "toolResult"];

function bodyText(lines) {
	if (lines.length > 0 && lines[0] === "") lines = lines.slice(1);
	if (lines.length > 0 && lines[lines.length - 1] === "") lines = lines.slice(0, -1);
	return lines.join("\n");
}

function describeWhere(step) {
	return `step ${step.index}${step.heading ? ` (under heading "${step.heading}")` : ""}`;
}

function expectBlock(body, step) {
	const { mapping } = parseMapping(body, `expect ${describeWhere(step)}`);
	const unknown = Object.keys(mapping).filter((key) => !["exit_code", "contains"].includes(key));
	if (unknown.length > 0) throw new PlaybookError(`unknown expect key(s) ${unknown.join(", ")}; supported: exit_code, contains`, step.line, `expect ${describeWhere(step)}`);
	if (!("exit_code" in mapping) && !("contains" in mapping)) throw new PlaybookError("expect block requires exit_code and/or contains", step.line, `expect ${describeWhere(step)}`);
	if ("exit_code" in mapping && (!Number.isInteger(mapping.exit_code) || mapping.exit_code < 0)) throw new PlaybookError(`expect exit_code must be a non-negative integer, got ${JSON.stringify(mapping.exit_code)}`, step.line, `expect ${describeWhere(step)}`);
	if ("contains" in mapping && typeof mapping.contains !== "string") throw new PlaybookError(`expect contains must be a string, got ${JSON.stringify(mapping.contains)}`, step.line, `expect ${describeWhere(step)}`);
	return { kind: "expect", ...(mapping.exit_code !== undefined ? { exitCode: mapping.exit_code } : {}), ...(mapping.contains !== undefined ? { contains: mapping.contains } : {}), ...step };
}

function endBlock(body, step) {
	if (body.some((line) => line.trim() !== "")) throw new PlaybookError("end block takes no body; write ```end on its own line", step.line, `end ${describeWhere(step)}`);
	return { kind: "end", ...step };
}

function callBlock(info, body, step) {
	const parts = info.split(/\s+/);
	if (parts.length !== 2 || parts[1] === "") throw new PlaybookError(`call block info must be "call <toolName>", got "${info}"`, step.line, "call");
	const { mapping, sawAny } = parseMapping(body, `call ${describeWhere(step)}`);
	if (!sawAny) throw new PlaybookError("call block requires a non-empty parameter mapping", step.line, `call ${describeWhere(step)}`);
	return { kind: "call", tool: parts[1], params: mapping, ...step };
}

function pushStep(steps, info, body, heading, line, nearestAnchor, group) {
	const step = { index: steps.length + 1, heading, line, ...(nearestAnchor ? { nearestAnchor } : {}), ...(group ? { groupId: group.id } : {}) };
	const word = info.split(/\s+/)[0];
	if (group && !GROUP_ONLY.includes(word)) {
		throw new PlaybookError(`"${word}" is not allowed inside a response group; group members may only be ${GROUP_ONLY.join(", ")}`, line, `response group member ${describeWhere(step)}`);
	}
	if (word === "say" || word === "assistant") {
		const text = bodyText(body);
		if (text === "") return;
		steps.push({ kind: "say", text, ...step });
	} else if (word === "call") {
		if (group) group.sawCall = true;
		steps.push(callBlock(info, body.join("\n"), step));
	} else if (word === "expect") {
		steps.push(expectBlock(body.join("\n"), step));
	} else if (word === "user" || word === "toolResult") {
		if (info !== word) throw new PlaybookError(`${word} block takes no arguments, got "${info}"`, line, `${word} ${describeWhere(step)}`);
		steps.push({ kind: word, cases: parseCases(body.join("\n"), word, describeWhere(step)), ...step });
	} else if (word === "end") {
		if (info !== "end") throw new PlaybookError(`end block takes no arguments, got "${info}"`, line);
		steps.push(endBlock(body, step));
	} else if (word === "aggregator" || word === "segment") {
		if (info !== word) throw new PlaybookError(`${word} block takes no arguments, got "${info}"`, line, `${word} ${describeWhere(step)}`);
		const { command, cases } = parseProgramBlock(body.join("\n"), word, describeWhere(step));
		steps.push({ kind: word, command, cases, ...step });
	} else if (word === "reply") {
		throw new PlaybookError('unknown block "reply"; reply was merged into say', line);
	} else {
		throw new PlaybookError(`unknown block "${word}"; allowed blocks: ${ALLOWED.join(", ")}`, line);
	}
}

function resolveTargets(steps, anchors) {
	for (const step of steps) {
		if (!["user", "toolResult", "aggregator", "segment"].includes(step.kind)) continue;
		for (const item of step.cases) {
			if (!item.pass) continue;
			const id = normalizeTarget(item.pass.to, step);
			const anchor = anchors.get(id);
			if (!anchor) throw new PlaybookError(`pass.to target ${JSON.stringify(item.pass.to)} is not a known <a id> anchor; known anchors: ${[...anchors.keys()].map((k) => JSON.stringify(k)).join(", ") || "(none)"}`, step.line, `${step.kind} ${describeWhere(step)}`);
			if (anchor.resumePos < step.index) throw new PlaybookError(`pass.to target "${id}" is backward (anchor resumes before step ${anchor.resumePos + 1}, case block is ${describeWhere(step)}); only forward jumps are allowed`, step.line, `${step.kind} ${describeWhere(step)}`);
			item.pass.to = id;
			item.pass.toIndex = anchor.resumePos;
		}
	}
}

function normalizeTarget(raw, step) {
	if (typeof raw !== "string" || raw === "") throw invalidTarget(raw, step);
	const id = raw.startsWith("#") ? raw.slice(1) : raw;
	if (id === "" || id.startsWith("#")) throw invalidTarget(raw, step);
	return id;
}

function invalidTarget(raw, step) {
	return new PlaybookError(`pass.to must be an anchor id (optionally with one leading #), got ${JSON.stringify(raw)}`, step.line, `${step.kind} ${describeWhere(step)}`);
}

function validateSequence(steps) {
	if (steps.length === 0) throw new PlaybookError("playbook has no say/assistant/call/expect/user/toolResult/end blocks", 0);
	steps.forEach((step, i) => {
		const where = `${step.kind} ${describeWhere(step)}`;
		const prev = steps[i - 1];
		if ((step.kind === "expect" || step.kind === "toolResult") && prev?.kind !== "call") throw new PlaybookError(`${step.kind} must directly follow a call block (${where})`, step.line);
		if ((step.kind === "expect" || step.kind === "toolResult") && prev?.kind === "call" && (step.groupId ?? null) !== (prev.groupId ?? null)) throw new PlaybookError(`${step.kind} must follow a call block of the same response group (${where})`, step.line);
		if (step.kind === "end" && prev?.kind !== "say" && prev?.kind !== "toolResult") throw new PlaybookError(`end must directly follow a say/assistant block or a toolResult block (${where})`, step.line);
		if (step.kind === "user" && i > 0 && prev.kind !== "say" && prev.kind !== "end") {
			if (prev.kind === "user") throw new PlaybookError(`a user block cannot directly follow another user block (${where})`, step.line);
			throw new PlaybookError(`user block must follow a say block (or an end block when opening the next branch): the model turn must end with text before new user input arrives (${where})`, step.line);
		}
		if ((step.kind === "segment" || step.kind === "aggregator") && prev?.kind === "say") {
			throw new PlaybookError(`${step.kind} must not directly follow a say block (${where}): the text-only message would end the model turn before the ${step.kind} runs; put the ${step.kind} first or merge the say into a call group`, step.line);
		}
	});
	const last = steps[steps.length - 1];
	if (last.kind === "aggregator" || last.kind === "segment") throw new PlaybookError(`the playbook cannot end with a ${last.kind} block: after it runs there must be a say (or user block) ahead; add a closing say`, last.line);
}

export function parsePlaybook(markdown) {
	const lines = markdown.split(/\r?\n/);
	const steps = [];
	const anchors = new Map();
	let heading = null;
	let nearestAnchor = null;
	let open = null;
	let group = null;
	let groupSeq = 0;
	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];
		if (open) {
			if (FENCE_CLOSE.test(line)) {
				pushStep(steps, open.info, open.body, open.heading, open.line, open.anchor, group);
				open = null;
			} else {
				open.body.push(line);
			}
			continue;
		}
		if (FENCE_CLOSE.test(line)) throw new PlaybookError("closing fence without an open block", index + 1);
		const fence = FENCE_OPEN.exec(line);
		if (fence) {
			const info = fence[1];
			if (info === "response" || info === "/response") {
				if (info === "response") {
					if (group) throw new PlaybookError("nested response groups are not supported; close the current group with a ```/response line first", index + 1);
					group = { id: ++groupSeq, sawCall: false };
				} else {
					if (!group) throw new PlaybookError("```/response without an open response group", index + 1);
					if (!group.sawCall) throw new PlaybookError("a response group must contain at least one call block (use plain say blocks for text-only messages)", index + 1);
					group = null;
				}
				continue;
			}
			open = { info, body: [], heading, line: index + 1, anchor: nearestAnchor };
			continue;
		}
		const anchorMatch = ANCHOR.exec(line);
		if (anchorMatch) {
			if (group) throw new PlaybookError(`anchor "${anchorMatch[1]}" cannot be declared inside a response group: a group is entered as a whole, never mid-way`, index + 1);
			const id = anchorMatch[1];
			if (anchors.has(id)) throw new PlaybookError(`duplicate anchor id "${id}"`, index + 1);
			anchors.set(id, { id, resumePos: steps.length, line: index + 1 });
			nearestAnchor = id;
			continue;
		}
		const head = /^(#{1,6})[ \t]+(.*)$/.exec(line);
		if (head) heading = head[2].trim();
	}
	if (group) throw new PlaybookError("unclosed response group; add a ```/response line", 0);
	if (open) throw new PlaybookError(`unclosed block "${snippet(open.info)}"`, open.line);
	resolveTargets(steps, anchors);
	validateSequence(steps);
	analyzeAffine(steps);
	return steps;
}

export { PlaybookError, snippet, describeWhere };
