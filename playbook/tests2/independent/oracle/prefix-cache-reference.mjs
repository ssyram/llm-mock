const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const isPrefix = (prefix, history) => prefix.length <= history.length && prefix.every((item, index) => same(item, history[index]));

export class ReferencePrefixCache {
  constructor({ ttlMs = 300000 } = {}) {
    this.ttlMs = ttlMs;
    this.entries = [];
    this.cleanupPromise = null;
    this.cleanupRuns = 0;
  }

  put({ namespace, prefix, continuation, checkpointIndex = prefix.length, volatileAt = Infinity, now = 0 }) {
    this.entries.push({
      namespace: structuredClone(namespace),
      prefix: structuredClone(prefix),
      continuation: structuredClone(continuation),
      checkpointIndex,
      volatileAt,
      lastUsed: now,
      active: 0
    });
  }

  acquire(namespace, history, now) {
    const matches = this.entries.filter((entry) =>
      same(entry.namespace, namespace)
      && entry.checkpointIndex < entry.volatileAt
      && now - entry.lastUsed < this.ttlMs
      && isPrefix(entry.prefix, history));
    matches.sort((left, right) => right.prefix.length - left.prefix.length);
    const entry = matches[0];
    if (!entry) return null;
    entry.active += 1;
    entry.lastUsed = now;
    let released = false;
    return {
      matchedLength: entry.prefix.length,
      continuation: structuredClone(entry.continuation),
      release: () => {
        if (released) return;
        released = true;
        entry.active -= 1;
      }
    };
  }

  cleanup(now) {
    if (this.cleanupPromise) return this.cleanupPromise;
    this.cleanupPromise = Promise.resolve().then(() => {
      this.cleanupRuns += 1;
      this.entries = this.entries.filter((entry) => entry.active > 0 || now - entry.lastUsed < this.ttlMs);
    }).finally(() => {
      this.cleanupPromise = null;
    });
    return this.cleanupPromise;
  }
}
