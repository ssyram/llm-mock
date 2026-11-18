#!/usr/bin/env node
// CCA result_ref 封套解引用适配器（只读、可复用的领域组件；通用 matcher 不
// 含任何 result_ref 特例）。语义对齐 CCA 的 _dereference/result_view：
//  - 输入文本先按「整段 JSON，否则最后一行以 { 开头的 JSON」取候选；
//  - 候选是对象且带 result_ref.path ⇒ 读取该文件并解析为完整对象；
//  - 候选不带 result_ref.path ⇒ 它本身就是完整对象（CCA 现网样本形态）；
//  - 封套若提供 sha256 / bytes 则逐一校验（防“合法 JSON 被篡改”；CCA 现网
//    封套目前只带 path，此时本适配器不伪造校验）。
// 缺 path 键值 / 文件缺失 / 读失败 / 校验不符 / 引用文件不是 JSON ⇒ 硬错误
// （抛出带原因的 Error；CLI 形态退出码 3），绝不降级成摘要或 no-match。
// CLI：stdin=工具结果文本，stdout=完整对象 JSON；任何失败 stderr+exit 3。
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const fail = (message) => {
	throw new Error(`result_ref: ${message}`);
};

export function parseCandidateJson(text) {
	const whole = String(text ?? "").trim();
	if (whole.startsWith("{")) {
		try {
			return JSON.parse(whole);
		} catch {
			// 落到逐行候选，与 CCA tool_json 的两种 CLI stdout 形状一致。
		}
	}
	for (const line of [...String(text ?? "").split("\n")].reverse()) {
		if (!line.startsWith("{")) continue;
		try {
			return JSON.parse(line);
		} catch {
			continue;
		}
	}
	fail(`tool text carries no JSON object: ${JSON.stringify(String(text ?? "").slice(0, 300))}`);
}

export function dereference(value, { cwd = process.cwd() } = {}) {
	if (!("result_ref" in value)) return value;
	const reference = value.result_ref;
	if (typeof reference !== "object" || reference === null || Array.isArray(reference)) fail("result_ref must be a mapping with a path");
	const path = reference.path;
	if (typeof path !== "string" || path === "") fail("result_ref.path must be a non-empty string");
	const file = isAbsolute(path) ? path : resolve(cwd, path);
	let raw;
	try {
		raw = readFileSync(file, "utf8");
	} catch (error) {
		fail(`unreadable reference ${JSON.stringify(path)}: ${error.message}`);
	}
	if (typeof reference.bytes === "number" && Number.isInteger(reference.bytes) && reference.bytes >= 0 && Buffer.byteLength(raw, "utf8") !== reference.bytes) {
		fail(`bytes mismatch for ${JSON.stringify(path)}: envelope says ${reference.bytes}, file has ${Buffer.byteLength(raw, "utf8")}`);
	}
	if (typeof reference.sha256 === "string") {
		const actual = createHash("sha256").update(raw, "utf8").digest("hex");
		if (actual !== reference.sha256) fail(`sha256 mismatch for ${JSON.stringify(path)}: envelope says ${reference.sha256}, file has ${actual}`);
	}
	try {
		return JSON.parse(raw);
	} catch (error) {
		fail(`referenced file ${JSON.stringify(path)} is not valid JSON: ${error.message}`);
	}
}

export function dereferenceToolText(text, options) {
	const value = parseCandidateJson(text);
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		fail(`tool text is not a JSON object: ${JSON.stringify(String(text ?? "").slice(0, 300))}`);
	}
	return dereference(value, options);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname;
if (invokedDirectly) {
	let input = "";
	process.stdin.on("data", (chunk) => (input += chunk));
	process.stdin.on("end", () => {
		try {
			process.stdout.write(JSON.stringify(dereferenceToolText(input)));
		} catch (error) {
			process.stderr.write(`${error.message}\n`);
			process.exit(3);
		}
	});
}
