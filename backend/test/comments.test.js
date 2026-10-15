import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/app.js";
import { prisma } from "../config/prisma.js";

let server;
let baseUrl;

test.before(async () => {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

async function api(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = {
    "content-type": "application/json",
    ...options.headers,
  };
  let bodyPayload;
  if (typeof options.body === "string") {
    bodyPayload = options.body;
  } else if (options.body !== undefined) {
    bodyPayload = JSON.stringify(options.body);
  }
  const response = await fetch(url, {
    ...options,
    headers,
    body: bodyPayload,
  });
  let data = null;
  const text = await response.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data, headers: response.headers };
}

async function getAuthSession(persona = "super-admin", organizationSlug = "acme-corp") {
  const res = await api("/api/demo/switch-persona", {
    method: "POST",
    body: { persona, organizationSlug },
  });
  assert.equal(res.status, 200, `Failed to authenticate persona: ${persona}`);
  return {
    token: res.data.accessToken,
    orgId: res.data.activeOrganization.id,
    user: res.data.user,
  };
}

test("TASK-302: Collaborative Task Comments, 15m Window & Moderation", async (t) => {
  const adminSession = await getAuthSession("super-admin", "acme-corp");
  const memberSession = await getAuthSession("team-member", "acme-corp");
  const pmSession = await getAuthSession("project-manager", "acme-corp");

  // Create an active project and task for testing
  const projRes = await api("/api/projects", {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminSession.token}`,
      "x-organization-id": String(adminSession.orgId),
    },
    body: {
      name: "Comment Test Project",
      key: `COMM_${Date.now().toString().slice(-4)}`,
      description: "Project for comments verification",
      status: "ACTIVE",
    },
  });
  assert.equal(projRes.status, 201);
  const projectId = projRes.data.project.id;

  const taskRes = await api("/api/tasks", {
    method: "POST",
    headers: {
      authorization: `Bearer ${adminSession.token}`,
      "x-organization-id": String(adminSession.orgId),
    },
    body: {
      projectId,
      title: "Task for Comment Discussions",
      description: "Testing 15m window and moderation",
      priority: "HIGH",
      assigneeId: memberSession.user.id,
    },
  });
  assert.equal(taskRes.status, 201);
  const taskId = taskRes.data.task.id;

  // Track created comments
  let memberCommentId;
  let adminCommentId;

  await t.test(
    "REQ 1 [US-COLLAB-001 / TG-COLLAB-001]: Post a valid comment returning HTTP 201 and author details",
    async () => {
      const res = await api(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${memberSession.token}`,
          "x-organization-id": String(memberSession.orgId),
        },
        body: {
          content: "Initial technical feedback on task architecture.",
        },
      });

      assert.equal(res.status, 201);
      assert.ok(res.data.comment?.id);
      assert.equal(
        res.data.comment.content,
        "Initial technical feedback on task architecture."
      );
      assert.equal(res.data.comment.authorId, memberSession.user.id);
      assert.equal(res.data.comment.author?.name, memberSession.user.name);
      assert.equal(res.data.comment.editedAt, null);
      assert.ok(res.data.comment.createdAt);

      memberCommentId = res.data.comment.id;

      // Verify task commentsCount incremented
      const checkTask = await prisma.task.findUnique({
        where: { id: taskId },
      });
      assert.equal(checkTask.commentsCount, 1);
    }
  );

  await t.test(
    "REQ 2 [US-COLLAB-001]: Reject empty or whitespace-only comment with HTTP 400 Bad Request",
    async () => {
      const emptyRes = await api(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${memberSession.token}`,
          "x-organization-id": String(memberSession.orgId),
        },
        body: { content: "" },
      });
      assert.equal(emptyRes.status, 400);

      const whitespaceRes = await api(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${memberSession.token}`,
          "x-organization-id": String(memberSession.orgId),
        },
        body: { content: "    \n   " },
      });
      assert.equal(whitespaceRes.status, 400);
    }
  );

  await t.test(
    "REQ 3 [US-COLLAB-001 / XSS Defense]: Sanitizes malicious script injection payload in comment",
    async () => {
      const res = await api(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminSession.token}`,
          "x-organization-id": String(adminSession.orgId),
        },
        body: {
          content:
            "Safe header <script>alert('pwned')</script> and <img src=x onerror=alert(1)> with <strong>bold</strong> text.",
        },
      });

      assert.equal(res.status, 201);
      assert.ok(!res.data.comment.content.includes("<script>"));
      assert.ok(!res.data.comment.content.includes("onerror"));
      assert.ok(res.data.comment.content.includes("<strong>bold</strong>"));
      adminCommentId = res.data.comment.id;
    }
  );

  await t.test(
    "REQ 4 [US-COLLAB-001]: Non-existent parent task returns HTTP 404 Not Found",
    async () => {
      const res = await api(`/api/tasks/9999999/comments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${memberSession.token}`,
          "x-organization-id": String(memberSession.orgId),
        },
        body: { content: "Orphan comment" },
      });
      assert.equal(res.status, 404);
    }
  );

  await t.test(
    "REQ 5 [US-TENANT-005]: Cross-tenant comment attempt returns HTTP 404 Not Found",
    async () => {
      // Create second tenant
      const otherOrg = await prisma.organization.upsert({
        where: { slug: "other-corp" },
        update: {},
        create: { name: "Other Corp", slug: "other-corp" },
      });

      const res = await api(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminSession.token}`,
          "x-organization-id": String(otherOrg.id),
        },
        body: { content: "Cross-tenant intrusion attempt" },
      });
      // Admin is not in other-corp, returns 403 or 404
      assert.ok(res.status === 403 || res.status === 404);
    }
  );

  await t.test(
    "REQ 6 [US-PROJ-005 / BR-009]: Reject comment creation on task in an archived project (HTTP 400)",
    async () => {
      // Create archived project
      const archivedProj = await prisma.project.create({
        data: {
          organizationId: adminSession.orgId,
          name: "Archived Project for Comments",
          key: `ARCH_${Date.now().toString().slice(-4)}`,
          isArchived: true,
          status: "ARCHIVED",
        },
      });

      const archivedTask = await prisma.task.create({
        data: {
          organizationId: adminSession.orgId,
          projectId: archivedProj.id,
          title: "Archived Task",
          creatorId: adminSession.user.id,
        },
      });

      const res = await api(`/api/tasks/${archivedTask.id}/comments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminSession.token}`,
          "x-organization-id": String(adminSession.orgId),
        },
        body: { content: "Should fail on archived project" },
      });

      assert.equal(res.status, 400);
      assert.equal(res.data.code, "PROJECT_ARCHIVED");
    }
  );

  await t.test(
    "REQ 7 [US-COLLAB-001]: List comments chronologically (createdAt: asc)",
    async () => {
      const res = await api(`/api/tasks/${taskId}/comments`, {
        method: "GET",
        headers: {
          authorization: `Bearer ${memberSession.token}`,
          "x-organization-id": String(memberSession.orgId),
        },
      });

      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.comments));
      assert.equal(res.data.total, 2);
      assert.equal(res.data.comments[0].id, memberCommentId);
      assert.equal(res.data.comments[1].id, adminCommentId);
    }
  );

  await t.test(
    "REQ 8 [US-COLLAB-002 / TG-COLLAB-002]: Author edits comment within 15-minute window",
    async () => {
      const res = await api(`/api/tasks/${taskId}/comments/${memberCommentId}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${memberSession.token}`,
          "x-organization-id": String(memberSession.orgId),
        },
        body: {
          content: "Updated technical feedback with clarified requirements.",
        },
      });

      assert.equal(res.status, 200);
      assert.equal(
        res.data.comment.content,
        "Updated technical feedback with clarified requirements."
      );
      assert.ok(res.data.comment.editedAt !== null);
    }
  );

  await t.test(
    "REQ 9 [US-COLLAB-002]: Non-author is rejected when attempting to edit someone else's comment (HTTP 403)",
    async () => {
      const res = await api(`/api/tasks/${taskId}/comments/${memberCommentId}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${adminSession.token}`,
          "x-organization-id": String(adminSession.orgId),
        },
        body: {
          content: "Admin trying to edit member's comment",
        },
      });

      assert.equal(res.status, 403);
      assert.equal(res.data.code, "CANNOT_EDIT_OTHERS_COMMENT");
    }
  );

  await t.test(
    "REQ 10 [US-COLLAB-002]: Author edit rejected with HTTP 403 after 15-minute window expires",
    async () => {
      // Artificially age the member comment beyond 15 minutes (20 minutes ago)
      await prisma.comment.update({
        where: { id: memberCommentId },
        data: {
          createdAt: new Date(Date.now() - 20 * 60 * 1000),
        },
      });

      const res = await api(`/api/tasks/${taskId}/comments/${memberCommentId}`, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${memberSession.token}`,
          "x-organization-id": String(memberSession.orgId),
        },
        body: {
          content: "Attempting edit after 15m expiration",
        },
      });

      assert.equal(res.status, 403);
      assert.equal(res.data.code, "COMMENT_EDIT_WINDOW_EXPIRED");
    }
  );

  await t.test(
    "REQ 11 [US-COLLAB-002]: Author deletion rejected with HTTP 403 after 15-minute window expires",
    async () => {
      const res = await api(`/api/tasks/${taskId}/comments/${memberCommentId}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${memberSession.token}`,
          "x-organization-id": String(memberSession.orgId),
        },
      });

      assert.equal(res.status, 403);
      assert.equal(res.data.code, "COMMENT_DELETE_WINDOW_EXPIRED");
    }
  );

  await t.test(
    "REQ 12 [US-COLLAB-002]: Non-author non-moderator cannot delete someone else's comment (HTTP 403)",
    async () => {
      // Member tries to delete Admin's comment
      const res = await api(`/api/tasks/${taskId}/comments/${adminCommentId}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${memberSession.token}`,
          "x-organization-id": String(memberSession.orgId),
        },
      });

      assert.equal(res.status, 403);
      assert.equal(res.data.code, "CANNOT_DELETE_OTHERS_COMMENT");
    }
  );

  await t.test(
    "REQ 13 [US-COLLAB-003 / TG-COLLAB-003]: Moderator (Admin/PM) can delete any comment after 15 minutes",
    async () => {
      // Member comment is aged > 15 minutes from REQ 10
      // Super Admin deletes it as moderator
      const res = await api(`/api/tasks/${taskId}/comments/${memberCommentId}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${adminSession.token}`,
          "x-organization-id": String(adminSession.orgId),
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.deletedCommentId, memberCommentId);

      // Verify task commentsCount decremented to 1
      const checkTask = await prisma.task.findUnique({
        where: { id: taskId },
      });
      assert.equal(checkTask.commentsCount, 1);
    }
  );

  await t.test(
    "REQ 14 [US-COLLAB-002]: Author can delete their own comment within 15-minute window",
    async () => {
      // Admin posts a fresh comment
      const freshRes = await api(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${adminSession.token}`,
          "x-organization-id": String(adminSession.orgId),
        },
        body: { content: "Quick typo comment to delete" },
      });
      assert.equal(freshRes.status, 201);
      const freshCommentId = freshRes.data.comment.id;

      // Admin deletes within 15 minutes
      const delRes = await api(`/api/tasks/${taskId}/comments/${freshCommentId}`, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${adminSession.token}`,
          "x-organization-id": String(adminSession.orgId),
        },
      });
      assert.equal(delRes.status, 200);
      assert.equal(delRes.data.success, true);
    }
  );

  await t.test(
    "REQ 15 [Audit Trail]: Structured AuditLog entries emitted for comment creation, update, and deletion",
    async () => {
      const logs = await prisma.auditLog.findMany({
        where: {
          organizationId: adminSession.orgId,
          resourceType: "TASK",
          resourceId: String(taskId),
          action: {
            in: ["COMMENT_CREATE", "COMMENT_UPDATE", "COMMENT_DELETE"],
          },
        },
      });

      const actions = logs.map((l) => l.action);
      assert.ok(actions.includes("COMMENT_CREATE"), "Missing COMMENT_CREATE audit log");
      assert.ok(actions.includes("COMMENT_UPDATE"), "Missing COMMENT_UPDATE audit log");
      assert.ok(actions.includes("COMMENT_DELETE"), "Missing COMMENT_DELETE audit log");
    }
  );
});
