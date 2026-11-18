// 缓存清理 worker：scheduleCleanup 派发的独立进程。持锁清理、退出；锁即
// singleflight——并发派发的一方拿不到锁即退出。陈旧锁（清理进程已死）按
// 锁目录 mtime 超时偷取。
import { sweep } from "./cache.mjs";
import { mkdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const STALE = 60000 + 300000;
const dir = process.argv[2];
if (dir) {
	const lock = join(dir, ".cleanup-lock");
	try {
		mkdirSync(lock);
	} catch {
		try {
			if (Date.now() - statSync(lock).mtimeMs < STALE) process.exit(0);
			rmSync(lock, { recursive: true, force: true });
			mkdirSync(lock);
		} catch {
			process.exit(0);
		}
	}
	try {
		sweep(dir);
	} finally {
		try { rmSync(lock, { recursive: true, force: true }); } catch { /* 已释放 */ }
	}
}
