import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";
import { signAccessToken } from "../src/lib/tokens.js";
import { cache } from "../src/lib/cache.js";

describe("TASK-CACHE: Multi-Tier Caching Integration & ETag Testing", () => {
  let server;
  let baseUrl;
  let acmeOrg;
  let superAdminUser;
  let superAdminToken;

  const api = async (path, options = {}) => {
    const res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    let data;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      data = await res.json().catch(() => ({}));
    } else {
      data = await res.text().catch(() => "");
    }
    return { status: res.status, headers: res.headers, data };
  };

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    acmeOrg = await prisma.organization.findUnique({ where: { slug: "acme-corp" } });
    superAdminUser = await prisma.user.findUnique({ where: { email: "admin@teamguard.io" } });
    superAdminToken = signAccessToken(superAdminUser.id);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("REQ 1 [Platform Cache Diagnostics]: GET /api/platform/cache-stats returns telemetry", async () => {
    const res = await api("/api/platform/cache-stats");
    assert.equal(res.status, 200);
    assert.equal(res.data.status, "healthy");
    assert.ok(res.data.cache);
    assert.equal(typeof res.data.cache.hits, "number");
    assert.equal(typeof res.data.cache.misses, "number");
    assert.equal(typeof res.data.cache.size, "number");
  });

  test("REQ 2 [Tenant Membership Cache Hit]: Subsequent resolveTenant requests hit cache", async () => {
    cache.clear();

    // 1st request -> cache miss, populates cache
    const res1 = await api("/api/reports/summary", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res1.status, 200);

    const membershipKey = `membership:${acmeOrg.id}:${superAdminUser.id}`;
    const cachedEntry = cache.get(membershipKey);
    assert.ok(cachedEntry, "Membership should be present in cache");
    assert.ok(Array.isArray(cachedEntry.permissions), "Cached permissions should be an array");

    // 2nd request -> cache hit
    const preHitCount = cache.getStats().hits;
    const res2 = await api("/api/reports/summary", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res2.status, 200);
    const postHitCount = cache.getStats().hits;
    assert.ok(postHitCount > preHitCount, "Hits counter should increase on subsequent request");
  });

  test("REQ 3 [Conditional HTTP 304 / ETag]: Responds with 304 Not Modified when ETag matches", async () => {
    // 1st request to get ETag
    const res1 = await api("/api/reports/summary", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });
    assert.equal(res1.status, 200);
    const etag = res1.headers.get("etag");
    assert.ok(etag, "Server must return an ETag header on JSON responses");

    // 2nd request with If-None-Match
    const res2 = await api("/api/reports/summary", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
        "if-none-match": etag,
      },
    });
    assert.equal(res2.status, 304, "Server must respond with HTTP 304 Not Modified when ETag matches");
  });

  test("REQ 4 [Tag-Based Invalidation on Task Mutation]: Modifying a task purges tenant dashboard & reports cache", async () => {
    // Prime the summary cache
    await api("/api/reports/summary", {
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
    });

    const summaryKey = `reports:summary:${acmeOrg.id}`;
    assert.ok(cache.get(summaryKey) !== undefined, "Reports summary should be cached");

    // Create a temporary task
    const activeProject = await prisma.project.findFirst({
      where: { organizationId: acmeOrg.id, deletedAt: null },
    });

    const taskRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${superAdminToken}`,
        "x-organization-id": String(acmeOrg.id),
      },
      body: {
        title: "Cache Invalidation Probe Task",
        projectId: activeProject.id,
        priority: "LOW",
        status: "TODO",
      },
    });
    assert.equal(taskRes.status, 201);

    // Verify cache was purged for reports & dashboard
    assert.equal(cache.get(summaryKey), undefined, "Reports summary cache must be purged on task mutation");

    // Cleanup task
    if (taskRes.data?.id) {
      await api(`/api/tasks/${taskRes.data.id}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${superAdminToken}`,
          "x-organization-id": String(acmeOrg.id),
        },
      });
    }
  });
});
