import test from "node:test";
import assert from "node:assert/strict";
import {
  validateCommentContent,
  isWithin15MinWindow,
  getRemainingEditMinutes,
  canUserModerate,
  canEditComment,
  canDeleteComment,
  formatRelativeTime,
} from "./commentUtils.js";

test("TASK-302 [FE REQ 1 / Content Validation]: Rejects empty or whitespace-only inputs", () => {
  assert.equal(validateCommentContent("").valid, false);
  assert.equal(validateCommentContent("   \n\t  ").valid, false);
  assert.equal(validateCommentContent(null).valid, false);
  assert.equal(validateCommentContent(undefined).valid, false);

  const validRes = validateCommentContent("  Valid technical comment  ");
  assert.equal(validRes.valid, true);
  assert.equal(validRes.content, "Valid technical comment");

  const tooLong = "A".repeat(5001);
  assert.equal(validateCommentContent(tooLong).valid, false);
});

test("TASK-302 [FE REQ 2 / 15m Window Math]: Distinguishes between active and expired windows", () => {
  const now = Date.now();
  const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
  const fourteenMinAgo = new Date(now - 14 * 60 * 1000).toISOString();
  const sixteenMinAgo = new Date(now - 16 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();

  assert.equal(isWithin15MinWindow(fiveMinAgo, now), true);
  assert.equal(isWithin15MinWindow(fourteenMinAgo, now), true);
  assert.equal(isWithin15MinWindow(sixteenMinAgo, now), false);
  assert.equal(isWithin15MinWindow(oneHourAgo, now), false);
  assert.equal(isWithin15MinWindow(null, now), false);
});

test("TASK-302 [FE REQ 3 / Window Countdown]: Accurately calculates remaining edit minutes", () => {
  const now = Date.now();
  const fiveMinAgo = new Date(now - 5 * 60 * 1000).toISOString();
  const fifteenMinAgo = new Date(now - 15 * 60 * 1000).toISOString();
  const thirtyMinAgo = new Date(now - 30 * 60 * 1000).toISOString();

  assert.equal(getRemainingEditMinutes(fiveMinAgo, now), 10);
  assert.equal(getRemainingEditMinutes(fifteenMinAgo, now), 0);
  assert.equal(getRemainingEditMinutes(thirtyMinAgo, now), 0);
});

test("TASK-302 [FE REQ 4 / Moderation Authority]: Identifies moderator roles and permissions", () => {
  assert.equal(canUserModerate({ permissions: ["roles:manage"] }), true);
  assert.equal(canUserModerate({ permissions: ["task:delete"] }), true);
  assert.equal(canUserModerate({ roles: ["Super Admin"] }), true);
  assert.equal(canUserModerate({ roles: ["Project Manager"] }), true);
  assert.equal(canUserModerate({ roles: [{ name: "Admin" }] }), true);

  // Non-moderators
  assert.equal(canUserModerate({ permissions: ["task:view", "task:update:own"], roles: ["Team Member"] }), false);
  assert.equal(canUserModerate({ permissions: ["task:view"], roles: ["Stakeholder"] }), false);
  assert.equal(canUserModerate(), false);
});

test("TASK-302 [FE REQ 5 / Author Edit Restrictions]: Allows edit strictly within 15m for author", () => {
  const now = Date.now();
  const myCommentFresh = {
    id: 1,
    authorId: 42,
    createdAt: new Date(now - 4 * 60 * 1000).toISOString(),
  };
  const myCommentExpired = {
    id: 2,
    authorId: 42,
    createdAt: new Date(now - 20 * 60 * 1000).toISOString(),
  };
  const otherUserComment = {
    id: 3,
    authorId: 99,
    createdAt: new Date(now - 2 * 60 * 1000).toISOString(),
  };

  // Author within 15m
  assert.equal(canEditComment({ comment: myCommentFresh, currentUserId: 42, now }), true);

  // Author after 15m
  assert.equal(canEditComment({ comment: myCommentExpired, currentUserId: 42, now }), false);

  // Non-author within 15m
  assert.equal(canEditComment({ comment: otherUserComment, currentUserId: 42, now }), false);
});

test("TASK-302 [FE REQ 6 / Author vs Moderator Deletion]: Moderator can delete any comment, author only within 15m", () => {
  const now = Date.now();
  const myCommentFresh = {
    id: 1,
    authorId: 42,
    createdAt: new Date(now - 3 * 60 * 1000).toISOString(),
  };
  const myCommentExpired = {
    id: 2,
    authorId: 42,
    createdAt: new Date(now - 25 * 60 * 1000).toISOString(),
  };
  const otherUserCommentExpired = {
    id: 3,
    authorId: 88,
    createdAt: new Date(now - 30 * 60 * 1000).toISOString(),
  };

  // Author fresh: can delete
  assert.equal(
    canDeleteComment({ comment: myCommentFresh, currentUserId: 42, isModerator: false, now }),
    true
  );

  // Author expired: cannot delete
  assert.equal(
    canDeleteComment({ comment: myCommentExpired, currentUserId: 42, isModerator: false, now }),
    false
  );

  // Other user expired: moderator CAN delete
  assert.equal(
    canDeleteComment({ comment: otherUserCommentExpired, currentUserId: 42, isModerator: true, now }),
    true
  );

  // Other user expired: non-moderator CANNOT delete
  assert.equal(
    canDeleteComment({ comment: otherUserCommentExpired, currentUserId: 42, isModerator: false, now }),
    false
  );
});

test("TASK-302 [FE REQ 7 / Relative Time]: Formats relative times correctly", () => {
  const now = Date.now();
  assert.equal(formatRelativeTime(new Date(now - 10 * 1000), now), "Just now");
  assert.equal(formatRelativeTime(new Date(now - 5 * 60 * 1000), now), "5m ago");
  assert.equal(formatRelativeTime(new Date(now - 2 * 60 * 60 * 1000), now), "2h ago");
  assert.equal(formatRelativeTime(new Date(now - 3 * 24 * 60 * 60 * 1000), now), "3d ago");
});
