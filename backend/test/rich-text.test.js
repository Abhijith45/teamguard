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

test("TASK-504: TipTap / ProseMirror Rich Text WYSIWYG Editor (UD-004 / US-COLLAB-004)", async (t) => {
  const admin = await getAuthSession("super-admin");
  const member = await getAuthSession("team-member");
  const viewer = await getAuthSession("stakeholder");

  // Create a designated test project for rich text verification
  const projRes = await api("/api/projects", {
    method: "POST",
    headers: {
      authorization: `Bearer ${admin.token}`,
      "x-organization-id": admin.orgId,
    },
    body: {
      name: `Rich Text Test Project ${Date.now()}`,
      description: "Project for rich text WYSIWYG validation",
    },
  });
  assert.equal(projRes.status, 201);
  const projectId = projRes.data.project.id;

  await t.test("REQ 1 [US-COLLAB-004 / AC 1]: Rich text HTML description in task creation persists faithfully", async () => {
    const richDescription = `
      <h1>Architecture Design</h1>
      <p>This is a <strong>bold statement</strong> and an <em>italic emphasis</em>.</p>
      <ul>
        <li>First item</li>
        <li>Second item</li>
      </ul>
      <pre><code>const a = 42;</code></pre>
      <blockquote>Security and RBAC first.</blockquote>
      <a href="https://example.com/spec">Documentation Link</a>
    `;

    const res = await api("/api/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin.token}`,
        "x-organization-id": admin.orgId,
      },
      body: {
        projectId,
        title: "Task with Rich Text Spec",
        description: richDescription,
      },
    });

    assert.equal(res.status, 201);
    const task = res.data.task;
    assert.ok(task.description.includes("<h1>Architecture Design</h1>"));
    assert.ok(task.description.includes("<strong>bold statement</strong>"));
    assert.ok(task.description.includes("<em>italic emphasis</em>"));
    assert.ok(task.description.includes("<li>First item</li>"));
    assert.ok(task.description.includes("<pre><code>const a = 42;</code></pre>"));
    assert.ok(task.description.includes("<blockquote>Security and RBAC first.</blockquote>"));
    assert.ok(task.description.includes('href="https://example.com/spec"'));
    assert.ok(task.description.includes('rel="noopener noreferrer"'));
  });

  await t.test("REQ 2 [US-COLLAB-004 / AC 2]: XSS attack vectors in task description are sanitized and rendered inert", async () => {
    const maliciousPayload = `
      <p>Clean intro</p>
      <script>alert('XSS-TASK')</script>
      <a href="javascript:alert('XSS-LINK')">Malicious Link</a>
      <img src="x" onerror="alert('XSS-IMG')" />
      <iframe src="https://evil.com"></iframe>
    `;

    const res = await api("/api/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin.token}`,
        "x-organization-id": admin.orgId,
      },
      body: {
        projectId,
        title: "XSS Defense Task",
        description: maliciousPayload,
      },
    });

    assert.equal(res.status, 201);
    const desc = res.data.task.description;
    assert.ok(!desc.includes("<script>"), "script tag must be stripped");
    assert.ok(!desc.includes("alert('XSS-TASK')"), "script body must be stripped");
    assert.ok(!desc.includes("javascript:"), "javascript: scheme must be stripped");
    assert.ok(!desc.includes("onerror"), "onerror inline handler must be stripped");
    assert.ok(!desc.includes("<iframe"), "iframe tag must be stripped");
    assert.ok(desc.includes("<p>Clean intro</p>"), "benign elements must be preserved");
  });

  await t.test("REQ 3 [US-COLLAB-004 / AC 3]: Task description exceeding 64 KB is rejected with HTTP 400 Bad Request", async () => {
    // Generate string exceeding 64KB (65536 bytes)
    const giantContent = "<p>" + "A".repeat(66000) + "</p>";

    const res = await api("/api/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin.token}`,
        "x-organization-id": admin.orgId,
      },
      body: {
        projectId,
        title: "Oversized Task Description",
        description: giantContent,
      },
    });

    assert.equal(res.status, 400);
    assert.equal(res.data.error, "Description exceeds maximum allowed size of 64KB");
  });

  await t.test("REQ 4 [US-COLLAB-004 / AC 3]: Task description update exceeding 64 KB is rejected with HTTP 400", async () => {
    // Create regular task
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin.token}`,
        "x-organization-id": admin.orgId,
      },
      body: {
        projectId,
        title: "Normal Task for Update",
        description: "<p>Initial description</p>",
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;

    const giantContent = "<p>" + "B".repeat(66000) + "</p>";
    const updateRes = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${admin.token}`,
        "x-organization-id": admin.orgId,
      },
      body: {
        description: giantContent,
      },
    });

    assert.equal(updateRes.status, 400);
    assert.equal(updateRes.data.error, "Description exceeds maximum allowed size of 64KB");
  });

  await t.test("REQ 5 [US-COLLAB-004 / AC 4]: Unauthorized actor without permission cannot update task description", async () => {
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin.token}`,
        "x-organization-id": admin.orgId,
      },
      body: {
        projectId,
        title: "Restricted Task",
        description: "<p>Original admin text</p>",
      },
    });
    assert.equal(createRes.status, 201);
    const taskId = createRes.data.task.id;

    // Viewer attempting to update task description
    const res = await api(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${viewer.token}`,
        "x-organization-id": viewer.orgId,
      },
      body: {
        description: "<p>Tampered by viewer</p>",
      },
    });

    assert.equal(res.status, 403);
  });

  await t.test("REQ 6 [US-COLLAB-004 / AC 1 & 2]: Comment with rich text formatting persists and sanitizes XSS", async () => {
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin.token}`,
        "x-organization-id": admin.orgId,
      },
      body: {
        projectId,
        title: "Task for Comment Rich Text",
        description: "<p>Discussion target</p>",
      },
    });
    const taskId = createRes.data.task.id;

    const richComment = `
      <p>Here is my review with <strong>bold</strong> feedback and <code>inline code</code>:</p>
      <ul><li>Item A</li><li>Item B</li></ul>
      <script>alert('COMMENT_XSS')</script>
      <a href="javascript:doEvil()">Bad</a>
      <a href="https://github.com/teamguard">Good</a>
    `;

    const commentRes = await api(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${member.token}`,
        "x-organization-id": member.orgId,
      },
      body: {
        content: richComment,
      },
    });

    assert.equal(commentRes.status, 201);
    const c = commentRes.data.comment;
    assert.ok(c.content.includes("<strong>bold</strong>"));
    assert.ok(c.content.includes("<code>inline code</code>"));
    assert.ok(c.content.includes("<li>Item A</li>"));
    assert.ok(!c.content.includes("<script>"));
    assert.ok(!c.content.includes("alert('COMMENT_XSS')"));
    assert.ok(!c.content.includes("javascript:"));
    assert.ok(c.content.includes('href="https://github.com/teamguard"'));
  });

  await t.test("REQ 7 [US-COLLAB-004 / AC 3]: Comment exceeding 16 KB is rejected with HTTP 400 Bad Request", async () => {
    const createRes = await api("/api/tasks", {
      method: "POST",
      headers: {
        authorization: `Bearer ${admin.token}`,
        "x-organization-id": admin.orgId,
      },
      body: {
        projectId,
        title: "Task for Giant Comment",
      },
    });
    const taskId = createRes.data.task.id;

    // Generate comment exceeding 16KB (16384 bytes)
    const giantComment = "<p>" + "C".repeat(17000) + "</p>";

    const commentRes = await api(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${member.token}`,
        "x-organization-id": member.orgId,
      },
      body: {
        content: giantComment,
      },
    });

    assert.equal(commentRes.status, 400);
    assert.equal(commentRes.data.error, "Comment exceeds maximum allowed size of 16KB");
  });
});
