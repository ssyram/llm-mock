// next-language 装载器：文件 → unit（front matter + 三种管理单元 + matches +
// 编译检查）。按绝对路径缓存；文件调用的 path 相对所属文件解析。
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileChecks } from "./compile-checks.mjs";
import { PlaybookError } from "../parse-yaml.mjs";
import { parseBlocks } from "./parse-blocks.mjs";
import { parseFront } from "./parse-front.mjs";
import { buildNodes } from "./build-nodes.mjs";

const loading = new Set();

export function loadUnit(absPath, cache = new Map()) {
	const cached = cache.get(absPath);
	if (cached) return cached;
	const text = readFileSync(absPath, "utf8");
	const { params, vars, body } = parseFront(text);
	const blocks = parseBlocks(body);
	const { nodes, matches, labels } = buildNodes(blocks, absPath);
	const unit = {
		path: absPath, source: absPath, hash: createHash("sha256").update(text).digest("hex"),
		params, vars, nodes, matches, labels, front: { params, vars },
	};
	compileChecks(unit);
	cache.set(absPath, unit);
	if (loading.has(absPath)) return unit;
	loading.add(absPath);
	try {
		for (const node of unit.nodes) {
			if (node.kind !== "segment" || node.form !== "file") continue;
			const target = loadUnit(resolve(absPath, "..", node.path), cache);
			for (const key of Object.keys(node.with)) {
				if (!Object.prototype.hasOwnProperty.call(target.params, key)) {
					throw new PlaybookError(`with 键 ${key} 不是 ${target.path} 的形参（segment @${node.openIndex}）`, 0, absPath);
				}
			}
		}
	} finally {
		loading.delete(absPath);
	}
	return unit;
}

export function resolveImport(fromUnit, relPath) {
	return resolve(fromUnit.path, "..", relPath);
}

export function bindFrame(unit, withValues) {
	const params = { ...unit.params };
	for (const [key, value] of Object.entries(withValues ?? {})) {
		if (!Object.prototype.hasOwnProperty.call(unit.params, key)) {
			const error = new Error(`with 键 ${key} 不是 ${unit.path} 的形参`);
			error.code = "playbook_invalid";
			throw error;
		}
		params[key] = value;
	}
	return { path: unit.path, params, vars: { ...unit.vars } };
}
