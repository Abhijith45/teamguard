/**
 * Transactional Email Dispatcher Service via Resend (TASK-505 / UD-005)
 * Dispatches organization member invitation emails via the Resend API,
 * with resilient sandbox/test outbox fallback when RESEND_API_KEY is not configured.
 */

// In-memory delivered email outbox for test verification and local sandbox inspection
const emailOutbox = [];

export function getDeliveredEmails() {
  return [...emailOutbox];
}

export function getLastDeliveredEmail() {
  return emailOutbox.length > 0 ? emailOutbox[emailOutbox.length - 1] : null;
}

export function clearDeliveredEmails() {
  emailOutbox.length = 0;
}

/**
 * Builds the responsive HTML template for member invitations.
 */
function buildInvitationHtml({
  organizationName,
  inviterName,
  roleName,
  department,
  inviteUrl,
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to join ${organizationName} on TeamGuard</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #f1f5f9; margin: 0; padding: 40px 20px; }
    .card { max-width: 560px; margin: 0 auto; background-color: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 36px 32px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
    .logo { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 20px; color: #6366f1; letter-spacing: -0.02em; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 15px; line-height: 1.6; color: #94a3b8; margin: 0 0 16px; }
    .strong { color: #f8fafc; font-weight: 600; }
    .meta-box { background-color: #1e293b; border-left: 4px solid #6366f1; padding: 14px 18px; border-radius: 6px; margin: 20px 0 28px; }
    .meta-item { font-size: 14px; color: #cbd5e1; margin: 4px 0; }
    .meta-item span { color: #94a3b8; }
    .btn-container { margin: 32px 0 24px; text-align: center; }
    .btn { display: inline-block; background-color: #6366f1; color: #ffffff !important; font-weight: 600; font-size: 15px; padding: 12px 32px; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4); }
    .fallback-url { word-break: break-all; font-size: 13px; color: #818cf8; background: #0f172a; padding: 10px 14px; border-radius: 6px; border: 1px solid #1e293b; }
    .footer { font-size: 12px; color: #64748b; margin-top: 36px; border-top: 1px solid #1e293b; padding-top: 20px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🛡️ TeamGuard</div>
    <h1>Join ${organizationName} on TeamGuard</h1>
    <p><strong class="strong">${inviterName}</strong> has invited you to collaborate in the <strong class="strong">${organizationName}</strong> workspace on TeamGuard.</p>
    
    <div class="meta-box">
      <div class="meta-item"><span>Role:</span> <strong class="strong">${roleName}</strong></div>
      ${department ? `<div class="meta-item"><span>Department:</span> <strong class="strong">${department}</strong></div>` : ""}
      <div class="meta-item"><span>Expires In:</span> 7 days</div>
    </div>

    <div class="btn-container">
      <a href="${inviteUrl}" class="btn" target="_blank" rel="noopener noreferrer">Accept Invitation</a>
    </div>

    <p style="font-size: 13px; color: #64748b; margin-bottom: 8px;">If the button above does not work, copy and paste this link into your browser:</p>
    <div class="fallback-url">${inviteUrl}</div>

    <div class="footer">
      This invitation was dispatched to this email address. If you were not expecting this invitation, you can safely ignore this email.
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Builds the plain text fallback for email clients that do not render HTML.
 */
function buildInvitationText({
  organizationName,
  inviterName,
  roleName,
  department,
  inviteUrl,
}) {
  return `
TeamGuard Member Invitation

${inviterName} has invited you to collaborate in ${organizationName} on TeamGuard.

Role: ${roleName}
${department ? `Department: ${department}\n` : ""}Expires: In 7 days

To accept this invitation, open the link below:
${inviteUrl}

If you were not expecting this invitation, you can safely ignore this email.
  `.trim();
}

/**
 * Dispatches a transactional invitation email via Resend (or sandbox mock).
 *
 * @param {object} params
 * @param {string} params.to - Recipient email address
 * @param {string} params.organizationName - Name of the tenant organization
 * @param {string} params.inviterName - Name of the inviting administrator
 * @param {string} params.roleName - Name of the role being assigned
 * @param {string} [params.department] - Optional department string
 * @param {string} params.inviteUrl - Full acceptance URL with raw token
 * @returns {Promise<{ delivered: boolean, id?: string, sandbox?: boolean }>}
 */
export async function sendInvitationEmail({
  to,
  organizationName,
  inviterName,
  roleName,
  department,
  inviteUrl,
}) {
  const subject = `You've been invited to join ${organizationName} on TeamGuard`;
  const html = buildInvitationHtml({
    organizationName,
    inviterName,
    roleName,
    department,
    inviteUrl,
  });
  const text = buildInvitationText({
    organizationName,
    inviterName,
    roleName,
    department,
    inviteUrl,
  });

  const record = {
    to,
    subject,
    organizationName,
    inviterName,
    roleName,
    department,
    inviteUrl,
    html,
    text,
    timestamp: new Date().toISOString(),
  };

  const apiKey = process.env.RESEND_API_KEY;
  const isTestOrDev = process.env.NODE_ENV === "test" || !apiKey;

  if (isTestOrDev) {
    // Record into in-memory sandbox outbox
    emailOutbox.push({
      id: `mock-email-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...record,
      sandbox: true,
    });

    return {
      delivered: true,
      id: emailOutbox[emailOutbox.length - 1].id,
      sandbox: true,
    };
  }

  // Live Resend API Integration
  try {
    const fromAddress = process.env.EMAIL_FROM || "TeamGuard <onboarding@resend.dev>";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[EmailService] Resend API error:", response.status, errBody);
      // Fallback to storing in outbox rather than crashing the caller
      emailOutbox.push({
        id: `resend-err-${Date.now()}`,
        ...record,
        error: errBody,
        sandbox: false,
      });
      return { delivered: false, error: errBody };
    }

    const data = await response.json();
    emailOutbox.push({
      id: data.id,
      ...record,
      sandbox: false,
    });

    return { delivered: true, id: data.id, sandbox: false };
  } catch (err) {
    console.error("[EmailService] Failed to dispatch via Resend:", err);
    emailOutbox.push({
      id: `resend-fail-${Date.now()}`,
      ...record,
      error: err.message,
      sandbox: true,
    });
    return { delivered: false, error: err.message };
  }
}
