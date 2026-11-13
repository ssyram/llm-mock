#!/usr/bin/env node
// 合成分页 fixture 生成器：按 scc_query.scc_members 的分页契约生成只读样本
// —— page_start=start、page_size=len(page)、next_after=page[-1]（还有更多成
// 员时），末页 next_after=null；members 是带 id 的行对象。产出：
//   members.json / page-i.json（完整对象）/ env-i.json（result_ref 封套，含
//   sha256+bytes，路径可绝对或相对 fixture 目录）/ manifest.json（cursor→页）。
// 用法：node cca-make-fixtures.mjs <outDir> <total> <pageSize> [--paths absolute|relative]
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";

const rawArgs = process.argv.slice(2);
const flagAt = rawArgs.indexOf("--paths");
const pathStyle = flagAt === -1 ? "absolute" : rawArgs[flagAt + 1];
const [outDir, totalArg, sizeArg] = rawArgs;
const total = Number.parseInt(totalArg ?? "", 10);
const pageSize = Number.parseInt(sizeArg ?? "", 10);
if (!outDir || !Number.isInteger(total) || total < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 256) {
	process.stderr.write("usage: node cca-make-fixtures.mjs <outDir> <total>=1.. <pageSize>=1..256 [--paths absolute|relative]\n");
	process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const ids = Array.from({ length: total }, (_, i) => `m${String(i + 1).padStart(2, "0")}`);
const row = (id, i) => ({ id, file: `synthetic-${id}.c`, line: i + 1, reason: "synthetic fixture" });
const manifest = { total, page_size: pageSize, pages: [] };
for (let start = 0, page = 0; start < total; start += pageSize, page++) {
	const slice = ids.slice(start, start + pageSize);
	const end = start + slice.length;
	const pageObject = {
		phase: "synthetic",
		task_id: "synthetic-walk",
		total,
		page_start: start,
		page_size: slice.length,
		members: slice.map((id) => row(id, ids.indexOf(id))),
		next_after: end < total ? slice[slice.length - 1] : null,
	};
	const pageFile = `page-${page}.json`;
	const raw = `${JSON.stringify(pageObject, null, 2)}\n`;
	writeFileSync(join(outDir, pageFile), raw);
	const refPath = pathStyle === "relative" ? pageFile : join(outDir, pageFile);
	const envelope = { result_ref: { path: refPath, sha256: createHash("sha256").update(raw, "utf8").digest("hex"), bytes: Buffer.byteLength(raw, "utf8") } };
	const envelopeFile = `env-${page}.json`;
	writeFileSync(join(outDir, envelopeFile), `${JSON.stringify(envelope, null, 2)}\n`);
	manifest.pages.push({ cursor: start === 0 ? null : ids[start - 1], envelope: envelopeFile, page: pageFile });
}
writeFileSync(join(outDir, "members.json"), `${JSON.stringify(ids, null, 2)}\n`);
writeFileSync(join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`fixtures: ${total} members, ${manifest.pages.length} page(s) -> ${relative(process.cwd(), outDir) || outDir}`);
