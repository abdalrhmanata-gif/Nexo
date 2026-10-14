function escapeHtml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return value.replace(/[&<>"']/g, (character) => entities[character] ?? character);
}

export async function sendWorkspaceInvitationEmail(input, options) {
  const apiKey = options?.apiKey?.trim();
  const from = options?.from?.trim();
  if (!apiKey || !from) return { ok: false, reason: "EMAIL_NOT_CONFIGURED" };

  const recipient = escapeHtml(input.email);
  const role = escapeHtml(input.role);
  const link = escapeHtml(input.inviteUrl);
  const expiry = new Date(input.expiresAt).toUTCString();
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from,
      to: [input.email],
      subject: "You’ve been invited to join a ZAVQERA workspace",
      text: `You have been invited to join a ZAVQERA workspace as ${input.role}. Accept the invitation: ${input.inviteUrl}\n\nThis secure link expires on ${expiry}. If you were not expecting this invitation, you can ignore this email.`,
      html: `<!doctype html><html><body style="margin:0;background:#f6f8fa;font-family:Arial,Helvetica,sans-serif;color:#17212b"><div style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dbe2e8;border-radius:12px"><p style="font-size:12px;letter-spacing:2px;font-weight:bold;color:#087f78">ZAVQERA · WORKSPACE INVITATION</p><h1 style="font-size:28px;color:#16324f">Work better together.</h1><p>You’ve been invited to join a ZAVQERA workspace as <strong>${role}</strong>.</p><p>Accept the invitation using the secure link below. You must sign in with the invited email address (${recipient}).</p><p style="margin:28px 0"><a href="${link}" style="display:inline-block;background:#16324f;color:#fff;text-decoration:none;padding:13px 20px;border-radius:6px;font-weight:bold">Accept invitation</a></p><p style="font-size:13px;color:#65717c">This link expires on ${escapeHtml(expiry)}. If you weren’t expecting this invitation, you can ignore this email.</p><p style="font-size:12px;color:#65717c">ZAVQERA keeps AI work, permissions, and outcomes in one place.</p></div></body></html>`,
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return { ok: false, reason: "EMAIL_PROVIDER_REJECTED" };
  return { ok: true };
}
