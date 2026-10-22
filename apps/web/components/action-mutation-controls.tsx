"use client";

import { FormEvent, useState } from "react";
import type { ActionStatus, MissionAction } from "../lib/view-models";

const statuses: ActionStatus[] = ["PENDING", "RUNNING", "COMPLETED", "BLOCKED", "CANCELLED"];

export function ActionMutationControls({ missionId, action }: { missionId: string; action: MissionAction }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const status = new FormData(event.currentTarget).get("status");
    const response = await fetch(`/api/missions/${missionId}/actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, expectedVersion: action.version }),
    });
    if (response.status === 409) {
      setMessage("This action changed elsewhere. Refreshing the authoritative state…");
      window.setTimeout(() => window.location.reload(), 900);
      return;
    }
    setBusy(false);
    if (response.ok) {
      window.location.reload();
      return;
    }
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.error ?? "Action update was not accepted.");
  }

  return <form onSubmit={submit} className="action-control">
    <select name="status" defaultValue={action.status} aria-label={`Status for ${action.title}`} disabled={busy}>
      {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
    </select>
    <button className="button button-small" type="submit" disabled={busy}>Save</button>
    {message && <span className="field-error" role="alert">{message}</span>}
  </form>;
}
