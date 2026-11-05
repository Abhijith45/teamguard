import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { CacheEngine } from "../src/lib/cache.js";

describe("CacheEngine: In-Memory LRU + TTL Multi-Tenant Store", () => {
  let cache;

  beforeEach(() => {
    cache = new CacheEngine({ maxEntries: 3, defaultTtlMs: 100 });
  });

  test("Stores and retrieves values within TTL", () => {
    cache.set("key1", { name: "Tenant A" });
    const val = cache.get("key1");
    assert.deepEqual(val, { name: "Tenant A" });
  });

  test("Returns undefined and increments misses on cache miss", () => {
    const val = cache.get("missing_key");
    assert.equal(val, undefined);
    assert.equal(cache.getStats().misses, 1);
  });

  test("Expires entries when TTL has elapsed", async () => {
    cache.set("expire_me", "data", { ttlMs: 30 });
    assert.equal(cache.get("expire_me"), "data");

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(cache.get("expire_me"), undefined);
  });

  test("Evicts Least Recently Used (LRU) entry when maxEntries is exceeded", () => {
    cache.set("k1", "val1");
    cache.set("k2", "val2");
    cache.set("k3", "val3");

    // Access k1 to make k2 the least recently used
    cache.get("k1");

    // Adding 4th entry exceeds maxEntries=3 -> should evict k2
    cache.set("k4", "val4");

    assert.equal(cache.get("k1"), "val1");
    assert.equal(cache.get("k2"), undefined, "k2 should have been evicted as LRU");
    assert.equal(cache.get("k3"), "val3");
    assert.equal(cache.get("k4"), "val4");
  });

  test("Invalidates all entries tagged with a specific tenant tag", () => {
    cache.set("perm:user1:org1", ["project:view"], { tags: ["tenant:1", "user:1"] });
    cache.set("perm:user2:org1", ["project:create"], { tags: ["tenant:1", "user:2"] });
    cache.set("perm:user3:org2", ["task:view"], { tags: ["tenant:2", "user:3"] });

    const purgedCount = cache.invalidateTags(["tenant:1"]);
    assert.equal(purgedCount, 2);

    assert.equal(cache.get("perm:user1:org1"), undefined);
    assert.equal(cache.get("perm:user2:org1"), undefined);
    assert.equal(cache.get("perm:user3:org2")?.[0], "task:view", "Tenant 2 entries must remain intact");
  });

  test("getOrSet fetches and caches on miss, serves from cache on subsequent calls", async () => {
    let callCount = 0;
    const fetcher = async () => {
      callCount++;
      return { answer: 42 };
    };

    const first = await cache.getOrSet("calc", fetcher, { ttlMs: 1000 });
    assert.deepEqual(first, { answer: 42 });
    assert.equal(callCount, 1);

    const second = await cache.getOrSet("calc", fetcher, { ttlMs: 1000 });
    assert.deepEqual(second, { answer: 42 });
    assert.equal(callCount, 1, "Fetcher should NOT be called again on cache hit");
  });

  test("Accurately tracks statistics and hit ratio", () => {
    cache.set("stat_k", "hello");
    cache.get("stat_k"); // hit 1
    cache.get("stat_k"); // hit 2
    cache.get("not_there"); // miss 1

    const stats = cache.getStats();
    assert.equal(stats.hits, 2);
    assert.equal(stats.misses, 1);
    assert.equal(stats.hitRatio, "66.7%");
  });
});
