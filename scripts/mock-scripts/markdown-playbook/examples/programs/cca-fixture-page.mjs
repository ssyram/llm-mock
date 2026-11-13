#!/usr/bin/env node
// 合成取页器：模拟 CCA scc-members 工具的封套行为——按 cursor（上一页的
// next_after；首页不带 cursor）返回该页的 result_ref 封套 JSON。只读
// manifest.json 与对应 env 文件；未知 cursor / 缺 manifest / 坏 envelope 是
// 硬错误（非零退出），绝不猜测或返回相邻页。
// 用法：node cca-fixture-page.mjs <fixtureDir> [cursor]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [fixtureDir, cursorArg] = process.argv.slice(2);
if (!fixtureDir) {
	process.stderr.write("usage: node cca-fixture-page.mjs <fixtureDir> [cursor]\n");
	process.exit(2);
}
const die = (message) => {
	process.stderr.write(`fixture-page: ${message}\n`);
	process.exit(4);
};
let manifest;
try {
	manifest = JSON.parse(readFileSync(join(fixtureDir, "manifest.json"), "utf8"));
} catch (error) {
	die(`unreadable manifest: ${error.message}`);
}
const cursor = cursorArg === undefined || cursorArg === "null" ? null : cursorArg;
const entry = manifest.pages.find((page) => page.cursor === cursor);
if (!entry) die(`unknown cursor ${JSON.stringify(cursor)}; known cursors: ${manifest.pages.map((page) => JSON.stringify(page.cursor)).join(", ")}`);
let envelope;
try {
	envelope = readFileSync(join(fixtureDir, entry.envelope), "utf8");
} catch (error) {
	die(`unreadable envelope ${entry.envelope}: ${error.message}`);
}
process.stdout.write(envelope.trimEnd());
