import test from "node:test";
import assert from "node:assert/strict";

const ITSM_TICKET_REGEX = /^TG-[0-9]{4,8}$/;

function validateBreakGlassForm({ ticketId, justification, designatedMemberId, mfaToken }) {
  const errors = {};

  if (!mfaToken) {
    errors.mfa = "MFA step-up verification is required";
  }

  if (!ticketId || typeof ticketId !== "string" || !ITSM_TICKET_REGEX.test(ticketId.trim())) {
    errors.ticketId = "ITSM ticket ID must match format TG-XXXX (4-8 digits)";
  }

  if (!justification || typeof justification !== "string" || justification.trim().length < 20) {
    errors.justification = "Justification must be at least 20 characters documenting reason";
  }

  if (!designatedMemberId) {
    errors.designatedMemberId = "Please select an active member of the target tenant";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

function calculateAggregateMetrics(tenants = []) {
  const totalTenants = tenants.length;
  const suspendedTenants = tenants.filter((t) => Boolean(t.isSuspended)).length;
  const activeTenants = totalTenants - suspendedTenants;
  const totalMembers = tenants.reduce((acc, t) => acc + (t.activeMemberCount || 0), 0);
  return { totalTenants, activeTenants, suspendedTenants, totalMembers };
}

test("TASK-501 [FE REQ 1 / Ticket Validation]: Enforces strict ITSM format TG-XXXX (4 to 8 digits)", () => {
  assert.equal(ITSM_TICKET_REGEX.test("TG-1234"), true);
  assert.equal(ITSM_TICKET_REGEX.test("TG-849201"), true);
  assert.equal(ITSM_TICKET_REGEX.test("TG-12345678"), true);

  assert.equal(ITSM_TICKET_REGEX.test("TG-123"), false, "Too short");
  assert.equal(ITSM_TICKET_REGEX.test("TG-123456789"), false, "Too long");
  assert.equal(ITSM_TICKET_REGEX.test("INC-12345"), false, "Wrong prefix");
  assert.equal(ITSM_TICKET_REGEX.test("tg-1234"), false, "Lowercase prefix rejected");
  assert.equal(ITSM_TICKET_REGEX.test(""), false, "Empty rejected");
});

test("TASK-501 [FE REQ 2 / Break-Glass Validation]: Validates required form parameters", () => {
  // Invalid empty form
  const emptyRes = validateBreakGlassForm({});
  assert.equal(emptyRes.isValid, false);
  assert.ok(emptyRes.errors.mfa);
  assert.ok(emptyRes.errors.ticketId);
  assert.ok(emptyRes.errors.justification);
  assert.ok(emptyRes.errors.designatedMemberId);

  // Short justification
  const shortJust = validateBreakGlassForm({
    mfaToken: "valid-token",
    ticketId: "TG-994400",
    justification: "Account locked",
    designatedMemberId: 5,
  });
  assert.equal(shortJust.isValid, false);
  assert.equal(shortJust.errors.justification, "Justification must be at least 20 characters documenting reason");

  // Valid break-glass submission
  const valid = validateBreakGlassForm({
    mfaToken: "valid-token",
    ticketId: "TG-994400",
    justification: "Primary tenant administrator departed company; designated replacement authorized by CISO.",
    designatedMemberId: 5,
  });
  assert.equal(valid.isValid, true);
  assert.deepEqual(valid.errors, {});
});

test("TASK-501 [FE REQ 3 / Aggregate Metrics]: Accurately calculates tenant aggregates", () => {
  const sampleTenants = [
    { id: 1, name: "Acme Corp", isSuspended: false, activeMemberCount: 12 },
    { id: 2, name: "Nova Labs", isSuspended: true, activeMemberCount: 5 },
    { id: 3, name: "Starlight", isSuspended: false, activeMemberCount: 8 },
  ];

  const metrics = calculateAggregateMetrics(sampleTenants);
  assert.equal(metrics.totalTenants, 3);
  assert.equal(metrics.activeTenants, 2);
  assert.equal(metrics.suspendedTenants, 1);
  assert.equal(metrics.totalMembers, 25);
});
