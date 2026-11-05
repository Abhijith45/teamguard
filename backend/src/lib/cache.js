/**
 * In-Memory LRU + TTL Cache Engine with Tag-Based Multi-Key Invalidation.
 * Designed for high-throughput multi-tenant SaaS environments.
 * Zero external dependencies.
 */

class CacheEngine {
  constructor(options = {}) {
    this.maxEntries = options.maxEntries || 2000;
    this.defaultTtlMs = options.defaultTtlMs || 60 * 1000; // 60 seconds default
    this.store = new Map(); // key -> { value, expiresAt, tags, lastAccessed }
    this.tagMap = new Map(); // tag -> Set<key>
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      tagInvalidations: 0,
    };
  }

  /**
   * Retrieves a cached value if present and not expired.
   * Updates LRU access ordering.
   */
  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    const now = Date.now();
    if (entry.expiresAt && entry.expiresAt <= now) {
      // Lazy eviction on expired access
      this.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Refresh LRU position (delete & re-insert)
    entry.lastAccessed = now;
    this.store.delete(key);
    this.store.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Stores a value with optional TTL and invalidation tags.
   */
  set(key, value, options = {}) {
    const now = Date.now();
    const ttlMs = options.ttlMs !== undefined ? options.ttlMs : this.defaultTtlMs;
    const expiresAt = ttlMs > 0 ? now + ttlMs : null;
    const tags = Array.isArray(options.tags) ? options.tags : [];

    // If key already exists, clean up old tag mappings
    if (this.store.has(key)) {
      this._removeKeyFromTags(key);
    } else if (this.store.size >= this.maxEntries) {
      // Evict least recently used (first item in Map)
      this._evictLru();
    }

    const entry = {
      value,
      expiresAt,
      tags,
      lastAccessed: now,
    };

    this.store.set(key, entry);

    // Index tags
    for (const tag of tags) {
      if (!this.tagMap.has(tag)) {
        this.tagMap.set(tag, new Set());
      }
      this.tagMap.get(tag).add(key);
    }

    this.stats.sets++;
    return value;
  }

  /**
   * Deletes a single key and cleans up tag indexes.
   */
  delete(key) {
    const entry = this.store.get(key);
    if (!entry) return false;

    this._removeKeyFromTags(key);
    this.store.delete(key);
    this.stats.deletes++;
    return true;
  }

  /**
   * Bulk invalidates all keys indexed under any of the provided tags.
   * Essential for multi-tenant isolation and security event purges.
   */
  invalidateTags(tags = []) {
    const tagList = Array.isArray(tags) ? tags : [tags];
    const keysToDelete = new Set();

    for (const tag of tagList) {
      const keys = this.tagMap.get(tag);
      if (keys) {
        for (const k of keys) {
          keysToDelete.add(k);
        }
        this.tagMap.delete(tag);
      }
    }

    for (const k of keysToDelete) {
      const entry = this.store.get(k);
      if (entry) {
        this._removeKeyFromTags(k);
        this.store.delete(k);
        this.stats.deletes++;
      }
    }

    this.stats.tagInvalidations += keysToDelete.size;
    return keysToDelete.size;
  }

  /**
   * Wraps an asynchronous query with cache-aside semantics.
   */
  async getOrSet(key, fetcher, options = {}) {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const fresh = await fetcher();
    if (fresh !== undefined && fresh !== null) {
      this.set(key, fresh, options);
    }
    return fresh;
  }

  /**
   * Clears the entire store and tag indexes.
   */
  clear() {
    this.store.clear();
    this.tagMap.clear();
  }

  /**
   * Returns telemetry and performance metrics.
   */
  getStats() {
    const totalLookups = this.stats.hits + this.stats.misses;
    const hitRatio = totalLookups > 0 ? Number(((this.stats.hits / totalLookups) * 100).toFixed(1)) : 0;
    return {
      size: this.store.size,
      maxEntries: this.maxEntries,
      tagCount: this.tagMap.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRatio: `${hitRatio}%`,
      sets: this.stats.sets,
      deletes: this.stats.deletes,
      evictions: this.stats.evictions,
      tagInvalidations: this.stats.tagInvalidations,
    };
  }

  _evictLru() {
    const firstKey = this.store.keys().next().value;
    if (firstKey !== undefined) {
      this.delete(firstKey);
      this.stats.evictions++;
    }
  }

  _removeKeyFromTags(key) {
    const entry = this.store.get(key);
    if (entry && Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        const set = this.tagMap.get(tag);
        if (set) {
          set.delete(key);
          if (set.size === 0) {
            this.tagMap.delete(tag);
          }
        }
      }
    }
  }
}

// Global Singleton Instance
export const cache = new CacheEngine({
  maxEntries: 2000,
  defaultTtlMs: 60 * 1000,
});

export { CacheEngine };
