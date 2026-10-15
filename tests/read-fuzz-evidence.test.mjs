import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { createGunzip, gzipSync } from "node:zlib";
import { parseFuzzRecords } from "./read-fuzz-evidence.mjs";

test("fuzz evidence uses LF only, preserving Unicode line separators across chunks", async () => {
	const rows = [{ text: "a\u2028b\u2029c🚀\u0000\r\n" }, { text: "中文" }];
	const data = rows.map((row) => JSON.stringify(row) + "\n").join("");
	const chunks = Array.from(data);
	const actual = [];
	for await (const row of parseFuzzRecords(Readable.from(chunks))) actual.push(row);
	assert.deepEqual(actual, rows);
});

test("fuzz evidence reads independently appended gzip members as one record stream", async () => {
	const rows = [{ text: "中文🚀\u2028one" }, { text: "two\u2029" }];
	const compressed = Buffer.concat(rows.map((row) => gzipSync(JSON.stringify(row) + "\n")));
	const input = Readable.from([compressed]).pipe(createGunzip()).setEncoding("utf8");
	const actual = [];
	for await (const row of parseFuzzRecords(input)) actual.push(row);
	assert.deepEqual(actual, rows);
});

test("fuzz evidence refuses a partial trailing record", async () => {
	await assert.rejects(async () => {
		for await (const row of parseFuzzRecords(Readable.from(['{"text":"unfinished"}']))) assert.fail(JSON.stringify(row));
	}, /missing LF terminator/);
});
