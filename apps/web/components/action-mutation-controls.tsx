"use client";

import { FormEvent, useState } from "react";
import type { ActionStatus, MissionAction } from "../lib/view-models";
import { ACTION_STATUS_ORDER, actionStatusLabel } from "../lib/mission-content.mjs";

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
    <label className="visually-hidden" htmlFor={`status-${action.id}`}>Status for {action.title}</label>
    <select id={`status-${action.id}`} name="status" defaultValue={action.status} disabled={busy}>
      {(ACTION_STATUS_ORDER as ActionStatus[]).map((status) => <option key={status} value={status}>{actionStatusLabel(status)}</option>)}
    </select>
    <button className="button button-small" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
    {message && <span className="field-error" role="alert">{message}</span>}
  </form>;
}
