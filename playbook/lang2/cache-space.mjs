// cache 键空间（输入命名空间）：request.md#10 —— messages 单独走前缀；其余一切
// 影响执行的可见输入（units 闭包哈希、外接脚本资源版本、api/model/system/
// tools/options/sessionSignal/compaction）全部纳入键。脚本版本策略：程序命令
// 文本随 unit 哈希；命令中可解析为本 unit 目录下真实文件的 token 自动内容哈
// 希；无法解析的 shell 依赖（PATH 二进制/URL/远程态）不追踪——复用视为假设
// 其确定性，或经 PLAYBOOK2_DEPS 显式声明（{"路径":"sha256"}，缺省不可复用
// 由调用方决定），边界见 external-program-protocol.md。
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

export function programCommandsOf(unit) {
	const commands = [];
	for (const node of unit.nodes) {
		if (node.kind === "segment" && node.form === "command") commands.push(node.command);
		if (node.kind === "rv" && node.aggregation) commands.push(node.aggregation.command);
	}
	return commands;
}

export function scriptVersionsOf(units, depsEnv = process.env.PLAYBOOK2_DEPS) {
	const versions = {};
	for (const unit of units) {
		for (const command of programCommandsOf(unit)) {
			for (const raw of String(command).split(/\s+/)) {
				const token = raw.replace(/^["']|["']$/g, "");
				if (!token || token.includes("://")) continue;
				const candidate = resolve(unit.path, "..", token);
				try {
					if (!statSync(candidate).isFile()) continue;
					versions[candidate] = sha256(readFileSync(candidate));
				} catch { /* 非文件 token（解释器名、参数等）：不追踪 */ }
			}
		}
	}
	if (depsEnv) {
		try {
			Object.assign(versions, JSON.parse(depsEnv));
		} catch { /* 声明非法则忽略，键空间仍含已自动识别部分 */ }
	}
	return versions;
}

export function keySpaceOf(units, input, depsEnv) {
	const unitHashes = {};
	for (const unit of units) unitHashes[unit.path] = unit.hash;
	const request = input?.request ?? {};
	const context = request.context ?? {};
	return {
		unitHashes,
		scriptVersions: scriptVersionsOf(units, depsEnv),
		api: input?.api ?? null,
		model: input?.model ?? null,
		sessionSignal: request.sessionSignal ?? null,
		compaction: request.compaction ?? context.compaction ?? null,
		system: typeof context.system === "string" ? context.system : null,
		tools: context.tools ?? null,
		options: request.options ?? null,
	};
}
