// next-language 前缀 continuation 缓存：磁盘 store。语义（冻结）：
// - 键空间 = cache-space.mjs 的输入命名空间（messages 除外）+ 消息前缀；
// - 条目按裸真实前缀（messages 原样，含全部宿主元数据）保存：{continuation,
//   reply}。不拼接 synthetic assistant、不抹元数据归一。完全重复请求
//   （prefixLen == messages.length）由调用方原样重放 entry.reply；宿主回显+
//   新输入按最长前缀恢复 continuation（pendingEcho/lastReply 核对回显阶段），
//   真实 hit 由此产生；
// - TTL=300000ms 只管空闲条目；到期（含恰边界）不可恢复，restore 拒收且绝不
//   刷新过期条目 usedAt；
// - 活跃保护 = 按请求独立租约 `<key>.lease.<requestId>`（内容 {pid,
//   acquiredAt}）：存活以 pid 实证（process.kill(pid,0)），仍运行请求永不算
//   死租约；cleanup 见任一存活租约即跳过该条目；release 只删自己的租约文件；
// - volatile 之后保存的 checkpoint 永不恢复（volatileCrossed）；
// - 清理由独立 worker 进程执行（scheduleCleanup 派发、锁 singleflight、不阻
//   塞主回复）；now 可注入供测试。
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

export const TTL_MS = 300000;
const LOCK_STALE_MS = 60000;

const sha = (text) => createHash("sha256").update(text).digest("hex");
const entryPath = (dir, key) => join(dir, `${key}.json`);
const leaseGlob = (dir, key) => readdirSync(dir).filter((n) => n.startsWith(`${key}.lease.`));

function readEntry(path) {
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

const expired = (entry, now) => entry.usedAt === undefined || now - entry.usedAt >= TTL_MS;

export function keyFor(keySpace, messages, upto) {
	return sha(JSON.stringify({ keySpace, prefix: messages.slice(0, upto) }));
}

export function restore(dir, keySpace, messages, { now = Date.now() } = {}) {
	for (let upto = messages.length; upto >= 0; upto -= 1) {
		const key = keyFor(keySpace, messages, upto);
		const path = entryPath(dir, key);
		const entry = readEntry(path);
		if (!entry || entry.volatileCrossed) continue;
		if (expired(entry, now)) continue;
		entry.usedAt = now;
		try {
			writeFileSync(path, JSON.stringify(entry), { flag: "w" });
		} catch { /* touch best-effort */ }
		return { continuation: entry.continuation, prefixLen: upto, key, reply: entry.reply ?? null };
	}
	return null;
}

export function save(dir, keySpace, messages, continuation, volatileCrossed, { now = Date.now(), reply } = {}) {
	try {
		mkdirSync(dir, { recursive: true });
		const key = keyFor(keySpace, messages, messages.length);
		writeFileSync(entryPath(dir, key), JSON.stringify({ savedAt: now, usedAt: now, volatileCrossed, continuation, reply: reply ?? null }), { flag: "w" });
		return key;
	} catch {
		return null;
	}
}

// 租约：每请求一份（requestId 唯一）；不排队不阻塞，只是活跃实证。
export function acquire(dir, key, { now = Date.now(), requestId, pid = process.pid } = {}) {
	if (!requestId) throw new Error("acquire 需要 requestId（每请求唯一）");
	try {
		mkdirSync(dir, { recursive: true });
		const file = `${key}.lease.${requestId}`;
		writeFileSync(join(dir, file), JSON.stringify({ pid, acquiredAt: now }), { flag: "wx" });
		return { dir, key, requestId, file };
	} catch {
		return null;
	}
}

export function release(lease) {
	if (!lease) return;
	try {
		rmSync(join(lease.dir, lease.file), { force: true });
	} catch { /* 释放 best-effort；进程死亡由 pid 存活判定兜底 */ }
}

export function leaseLive(path, now = Date.now()) {
	try {
		const lease = JSON.parse(readFileSync(path, "utf8"));
		if (typeof lease.pid === "number") {
			try {
				process.kill(lease.pid, 0);
				return true;
			} catch (error) {
				if (error.code === "EPERM") return true;
				return false;
			}
		}
		return now - (lease.acquiredAt ?? 0) < TTL_MS;
	} catch {
		return false;
	}
}

function lockDir(dir) {
	try {
		mkdirSync(join(dir, ".cleanup-lock"), { recursive: false });
		return true;
	} catch {
		return false;
	}
}

export function sweep(dir, now = Date.now()) {
	let names;
	try {
		names = readdirSync(dir);
	} catch {
		return;
	}
	for (const name of names) {
		if (!name.endsWith(".json")) continue;
		const key = name.slice(0, -".json".length);
		const entry = readEntry(entryPath(dir, key));
		if (entry && !expired(entry, now)) continue;
		let guarded = false;
		try {
			for (const lease of leaseGlob(dir, key)) {
				if (leaseLive(join(dir, lease), now)) { guarded = true; break; }
			}
		} catch { /* 目录消失：无保护 */ }
		if (!guarded) {
			try { rmSync(entryPath(dir, key), { force: true }); } catch { /* 并发 */ }
		}
	}
}

export function cleanup(dir, now = Date.now()) {
	if (!lockDir(dir)) return;
	try {
		sweep(dir, now);
	} finally {
		try { rmSync(join(dir, ".cleanup-lock"), { recursive: true, force: true }); } catch { /* 下轮偷 */ }
	}
}

// 独立清理 worker 派发：锁被持=已有清理在跑（singleflight），否则后台进程执
// 行，不阻塞主回复。
export function scheduleCleanup(dir) {
	try {
		if (!lockDir(dir)) return;
		rmSync(join(dir, ".cleanup-lock"), { recursive: true, force: true });
		const worker = spawn(process.execPath, [join(import.meta.dirname, "cache-cleanup.mjs"), dir], { detached: true, stdio: "ignore" });
		worker.unref();
	} catch { /* 派发失败：下次请求再试 */ }
}
