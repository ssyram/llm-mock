// 缓存契约测试（直接 import 真实 lang2/cache.mjs，注入时钟；不伪造产品行为）。
// 新语义：键空间=输入命名空间（messages 除外）；TTL 只管空闲；租约按请求独立
// （pid 存活实证，活请求永不清）；清理经 worker singleflight。
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquire, cleanup, keyFor, release, restore, save, scheduleCleanup, TTL_MS } from "../lang2/cache.mjs";

const dir = () => mkdtempSync(join(tmpdir(), "pb2cache-"));
const space = { unitHashes: { "r.md": "h1" }, api: "openai-completions" };
const otherSpace = { unitHashes: { "r.md": "h2" }, api: "openai-completions" };
const messages = (n) => Array.from({ length: n }, (_, i) => ({ role: i === 0 ? "user" : "x", content: `m${i}` }));

test("save→restore 命中：continuation 往返且刷新 usedAt；键空间分叉不命中", () => {
	const d = dir();
	save(d, space, messages(2), { mark: 1 }, false, { now: 1000 });
	const hit = restore(d, space, messages(3), { now: 2000 });
	assert.equal(hit.prefixLen, 2);
	assert.equal(hit.continuation.mark, 1);
	const raw = JSON.parse(readFileSync(join(d, `${keyFor(space, messages(2), 2)}.json`), "utf8"));
	assert.equal(raw.usedAt, 2000);
	assert.equal(restore(d, otherSpace, messages(3), { now: 2001 }), null, "输入命名空间不同（unit hash）不共享缓存");
});

test("TTL 边界：到期（含恰 TTL）不可恢复，且 restore 不刷新过期条目", () => {
	const d = dir();
	save(d, space, messages(2), { mark: 2 }, false, { now: 1000 });
	assert.equal(restore(d, space, messages(3), { now: 1000 + TTL_MS }), null, "恰 300000ms 边界=到期");
	const raw = JSON.parse(readFileSync(join(d, `${keyFor(space, messages(2), 2)}.json`), "utf8"));
	assert.equal(raw.usedAt, 1000, "拒收不得刷新 usedAt");
	assert.equal(restore(d, space, messages(3), { now: 1000 + TTL_MS - 1 }).prefixLen, 2, "边界内仍可恢复");
});

test("volatileCrossed 条目永不恢复", () => {
	const d = dir();
	save(d, space, messages(2), { mark: 3 }, true, { now: 1000 });
	assert.equal(restore(d, space, messages(3), { now: 1100 }), null);
});

test("按请求独立租约：同 key 两请求各持各租约；先 release 不失另一请求保护", () => {
	const d = dir();
	save(d, space, messages(2), { mark: 4 }, false, { now: 1000 });
	const key = keyFor(space, messages(2), 2);
	const first = acquire(d, key, { now: 1000, requestId: "req-a" });
	const second = acquire(d, key, { now: 1001, requestId: "req-b" });
	assert.ok(first && second, "每请求独立租约，互不 busy");
	cleanup(d, 1000 + TTL_MS + 5000);
	assert.ok(readdirSync(d).some((n) => n.endsWith(".json")), "存活租约下的条目不得删除");
	release(first);
	cleanup(d, 1000 + TTL_MS + 5000);
	assert.ok(readdirSync(d).some((n) => n.endsWith(".json")), "另一请求租约仍在：条目仍受保护");
	release(second);
	cleanup(d, 1000 + TTL_MS + 5000);
	assert.ok(!readdirSync(d).some((n) => n.endsWith(".json")), "全部 release 后过期条目删除");
});

test("pid 存活实证：仍运行进程的租约不被 TTL 判死（acquireAt 已超 TTL）", () => {
	const d = dir();
	save(d, space, messages(2), { mark: 5 }, false, { now: 1000 });
	const key = keyFor(space, messages(2), 2);
	const lease = acquire(d, key, { now: 1000, requestId: "live-proc", pid: process.pid });
	cleanup(d, 1000 + TTL_MS * 10);
	assert.ok(readdirSync(d).some((n) => n.endsWith(".json")), "本进程存活：租约活跃，条目不清");
	release(lease);
	cleanup(d, 1000 + TTL_MS * 10);
	assert.ok(!readdirSync(d).some((n) => n.endsWith(".json")));
});

test("死进程租约（pid 不存在）不阻塞清理", () => {
	const d = dir();
	save(d, space, messages(2), { mark: 6 }, false, { now: 1000 });
	const key = keyFor(space, messages(2), 2);
	const lease = acquire(d, key, { now: 1000, requestId: "dead-proc", pid: 999999999 });
	assert.ok(lease);
	cleanup(d, 1000 + TTL_MS + 60000);
	assert.ok(!readdirSync(d).some((n) => n.endsWith(".json")), "进程不存在=租约死，条目可删");
});

test("scheduleCleanup 派发独立 worker（不阻塞、singleflight）", async () => {
	const d = dir();
	save(d, space, messages(2), { mark: 7 }, false, { now: 1000 });
	mkdirSync(join(d, ".cleanup-lock"));
	scheduleCleanup(d);
	await new Promise((r) => setTimeout(r, 50));
	assert.ok(readdirSync(d).some((n) => n.endsWith(".json")), "锁被持有=已有清理在跑，本轮跳过");
	rmSync(join(d, ".cleanup-lock"), { recursive: true, force: true });
	scheduleCleanup(d);
	await new Promise((r) => setTimeout(r, 900));
	assert.ok(!readdirSync(d).some((n) => n.endsWith(".json")), "worker 后台清掉过期条目");
	assert.ok(!readdirSync(d).includes(".cleanup-lock"), "worker 释放锁");
});

test("E2E：开/关缓存同 transcript 逐字节同回复（miss/hit 等价）", async () => {
	const { session } = await import("./helpers/run-mock2.mjs");
	const example = join(import.meta.dirname, "..", "examples2", "loop-import.md");
	const cacheDir = dir();
	const withCache = session({ playbook: example, cacheDir });
	const cold = session({ playbook: example });
	const replies = async (s) => {
		s.pushUser("开始");
		const out = [];
		let reply = s.call().reply;
		let guard = 0;
		while (!reply.error && guard < 6) {
			guard += 1;
			out.push(JSON.stringify(reply.content));
			if (reply.stopReason !== "toolUse") break;
			s.pushToolResults(reply, {});
			reply = s.call().reply;
		}
		return out;
	};
	const a = await replies(withCache);
	const b = await replies(cold);
	assert.deepEqual(a, b);
	const again = await replies(session({ playbook: example, cacheDir }));
	assert.deepEqual(again, a, "同 cacheDir 二次会话（全命中）等价");
});
