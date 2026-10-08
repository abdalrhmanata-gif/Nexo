"use client";
import { useState } from "react";

export default function BusinessInvitePage() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [status, setStatus] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus("Creating invitation…");
    setInviteLink("");

    const response = await fetch("/api/business/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setStatus(data.error || "Invitation could not be created.");
      return;
    }

    const token = typeof data.inviteToken === "string" ? data.inviteToken : "";
    setInviteLink(token ? `${window.location.origin}/invite/${token}` : "");
    setStatus("Invitation created. Share the one-time invitation link with your teammate.");
    setEmail("");
  };

  return <div className="container">
    <p className="eyebrow">Business workspace</p>
    <h1>Invite a teammate</h1>
    <p className="detail-intent">Choose the least privilege role they need. Invitations expire after 7 days. The raw token is shown only once and is never stored in the database.</p>
    <form className="card" onSubmit={submit}>
      <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" autoComplete="email" /></label>
      <label>Role<select value={role} onChange={(event) => setRole(event.target.value)}><option value="member">Member</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label>
      <button className="button" type="submit">Create invitation</button>
      {status && <p role="status">{status}</p>}
      {inviteLink && <div className="card">
        <p className="eyebrow">Secure invitation link</p>
        <input readOnly value={inviteLink} aria-label="Secure invitation link" onFocus={(event) => event.currentTarget.select()} />
        <button className="button button-small" type="button" onClick={() => navigator.clipboard?.writeText(inviteLink)}>Copy link</button>
      </div>}
    </form>
  </div>;
}
