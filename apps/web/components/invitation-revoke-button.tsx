"use client";
import { useState } from "react";

export function InvitationRevokeButton({ invitationId }: { invitationId: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const revoke = async () => {
    if (!window.confirm("Revoke this invitation? The link will stop working.")) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/business/invitations/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ invitationId }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "Could not revoke invitation.");
      return;
    }
    setMessage("Revoked");
    window.location.reload();
  };

  return <span>
    <button className="button button-small button-quiet" type="button" disabled={busy} onClick={revoke}>{busy ? "Revoking…" : "Revoke"}</button>
    {message && <span className="action-hint"> {message}</span>}
  </span>;
}
