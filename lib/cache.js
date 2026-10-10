// In-memory TTL cache with a size cap and in-flight request sharing, so many
// browsers looking at the same area cause a single upstream request.

export class TtlCache {
  constructor({ maxEntries = 2000, now = Date.now } = {}) {
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map();
    this.inflight = new Map();
  }

  get(key) {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expires <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return e.value;
  }

  set(key, value, ttlMs) {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
  }

  /**
   * Return the cached value for `key`, or run `load()` once (sharing the
   * promise with concurrent callers) and cache its result for `ttl(value)` ms.
   */
  async wrap(key, load, ttl) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const p = (async () => {
      try {
        const value = await load();
        const ms = typeof ttl === 'function' ? ttl(value) : ttl;
        if (ms > 0) this.set(key, value, ms);
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, p);
    return p;
  }
}
