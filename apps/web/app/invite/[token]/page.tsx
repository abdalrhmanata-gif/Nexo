"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Invitation = { email: string; role: string; status: string; expiresAt: string };

export default function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [status, setStatus] = useState("Loading invitation…");

  useEffect(() => {
    params.then(({ token: value }) => {
      setToken(value);
      fetch(`/api/business/invitations/${encodeURIComponent(value)}`)
        .then(async (response) => {
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Invitation not found.");
          setInvitation(data.invitation);
          setStatus("");
        })
        .catch((error) => setStatus(error instanceof Error ? error.message : "Invitation not found."));
    });
  }, [params]);

  const accept = async () => {
    setStatus("Accepting invitation…");
    const response = await fetch(`/api/business/invitations/${encodeURIComponent(token)}`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setStatus("Sign in with the invited email, then open this invitation link again.");
      return;
    }
    if (!response.ok) {
      setStatus(data.error || "Invitation could not be accepted.");
      return;
    }
    setInvitation(data.invitation);
    setStatus("You are now a member of this workspace.");
  };

  return <div className="container">
    <p className="eyebrow">ZAVQERA invitation</p>
    <h1>Join a workspace</h1>
    {invitation ? <section className="card">
      <p>You were invited as <strong>{invitation.role}</strong> using <strong>{invitation.email}</strong>.</p>
      <p className="action-hint">This invitation expires {new Date(invitation.expiresAt).toLocaleString()}.</p>
      {invitation.status === "PENDING"
        ? <button className="button" type="button" onClick={accept}>Accept invitation</button>
        : <p className="status status-waiting">Invitation is {invitation.status.toLowerCase()}.</p>}
      {status && <p role="status">{status}</p>}
      <p><Link href="/auth/sign-in">Sign in</Link> with the invited email if you are not signed in.</p>
    </section> : <section className="card"><p role="status">{status}</p></section>}
  </div>;
}
