import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isValidEmail,
  normalizeEmail,
  isInvitationIdentityMatch,
  getInvitationExpiryStatus,
  getInvitationBadge,
  extractInvitationToken,
} from "../src/features/invitations/invitation-utils.js";

describe("TASK-505 [Frontend]: Member Invitation Utilities & Verification Logic", () => {
  test("FE REQ 1 [Email Validation]: Accurately validates and normalizes recipient email", () => {
    assert.equal(isValidEmail("user@domain.com"), true);
    assert.equal(isValidEmail("  alice.smith+team@sub.example.co.uk  "), true);
    assert.equal(isValidEmail("not-an-email"), false);
    assert.equal(isValidEmail("missing@domain"), false);
    assert.equal(isValidEmail(""), false);
    assert.equal(isValidEmail(null), false);

    assert.equal(normalizeEmail("  Alice@Domain.COM  "), "alice@domain.com");
  });

  test("FE REQ 2 [Identity Invariant]: Matches user email against invitation recipient case-insensitively", () => {
    assert.equal(
      isInvitationIdentityMatch("Alice@Company.com", "alice@company.com"),
      true
    );
    assert.equal(
      isInvitationIdentityMatch("  bob@acme.org  ", "BOB@ACME.ORG"),
      true
    );
    assert.equal(
      isInvitationIdentityMatch("intruder@evil.com", "victim@acme.org"),
      false
    );
    assert.equal(isInvitationIdentityMatch(null, "victim@acme.org"), false);
  });

  test("FE REQ 3 [Expiry Status Math]: Correctly calculates remaining window and marks expired links", () => {
    const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const futureStatus = getInvitationExpiryStatus(futureDate);
    assert.equal(futureStatus.isExpired, false);
    assert.ok(futureStatus.label.includes("d remaining"));

    const nearFutureDate = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const nearStatus = getInvitationExpiryStatus(nearFutureDate);
    assert.equal(nearStatus.isExpired, false);
    assert.ok(nearStatus.label.includes("h remaining"));

    const pastDate = new Date(Date.now() - 1000).toISOString();
    const pastStatus = getInvitationExpiryStatus(pastDate);
    assert.equal(pastStatus.isExpired, true);
    assert.equal(pastStatus.label, "Expired");
  });

  test("FE REQ 4 [Status Badges]: Resolves visual status pill types accurately", () => {
    assert.equal(
      getInvitationBadge({ status: "REVOKED" }).type,
      "revoked"
    );
    assert.equal(
      getInvitationBadge({ status: "ACCEPTED" }).type,
      "accepted"
    );
    assert.equal(
      getInvitationBadge({
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      }).type,
      "pending"
    );
    assert.equal(
      getInvitationBadge({
        status: "PENDING",
        expiresAt: new Date(Date.now() - 86400000).toISOString(),
      }).type,
      "expired"
    );
  });

  test("FE REQ 5 [Token Extraction]: Safely extracts raw token from query params or URLs", () => {
    assert.equal(
      extractInvitationToken("http://localhost:5173/invite/accept?token=abc123xyz"),
      "abc123xyz"
    );
    assert.equal(
      extractInvitationToken("?token=987fedcba&other=1"),
      "987fedcba"
    );
    assert.equal(
      extractInvitationToken("token=singletoken"),
      "singletoken"
    );
    assert.equal(extractInvitationToken("http://localhost:5173/dashboard"), null);
    assert.equal(extractInvitationToken(""), null);
    assert.equal(extractInvitationToken(null), null);
  });
});
