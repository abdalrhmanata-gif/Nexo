import { invitationEmail } from "./team-invitations.mjs";

// Sends an invitation through Resend's HTTP API, from the same verified
// subdomain as the account emails. RESEND_API_KEY is set in Netlify by the
// owner; without it nothing is sent and the caller hands out the link instead.

const FROM = "ZAVQERA <no-reply@auth.zavqera.com>";

export async function sendInvitationEmail(input: { to: string; inviterEmail: string; link: string; role: string; idempotencyKey: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const { subject, html, text } = invitationEmail({ inviterEmail: input.inviterEmail, link: input.link, role: input.role });
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // A retried request for the same invitation sends one email.
        "Idempotency-Key": `invitation-${input.idempotencyKey}`,
      },
      body: JSON.stringify({ from: FROM, to: [input.to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
