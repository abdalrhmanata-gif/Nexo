"use client";

import { FormEvent, useState } from "react";
import type { ActionStatus, MissionAction } from "../lib/view-models";
import {
  actionStatusLabel,
  allowedNextStatuses,
  followUpInputValue,
  isTerminalActionStatus,
  supportsFollowUp,
} from "../lib/mission-content.mjs";

export function ActionMutationControls({ missionId, action }: { missionId: string; action: MissionAction }) {
  const [status, setStatus] = useState<ActionStatus>(action.status);
  const [followUp, setFollowUp] = useState(followUpInputValue(action.followUpAt));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  if (isTerminalActionStatus(action.status)) {
    return <p className="action-final">{actionStatusLabel(action.status)} — no further changes.</p>;
  }

  const options: ActionStatus[] = [action.status, ...allowedNextStatuses(action.status)];
  const wantsFollowUp = supportsFollowUp(status);
  const losesFollowUp = Boolean(action.followUpAt) && !wantsFollowUp;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/missions/${missionId}/actions/${action.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        expectedVersion: action.version,
        // Only sent when Waiting is the target state. Every other state clears
        // the follow-up in the database, so sending one would be rejected.
        ...(wantsFollowUp ? { followUpAt: followUp ? new Date(`${followUp}T09:00:00`).toISOString() : null } : {}),
      }),
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

  return <form onSubmit={submit} className="action-control-group">
    <div className="action-control">
      <label className="visually-hidden" htmlFor={`status-${action.id}`}>Status for {action.title}</label>
      <select
        id={`status-${action.id}`}
        name="status"
        value={status}
        disabled={busy}
        onChange={(event) => setStatus(event.target.value as ActionStatus)}
      >
        {options.map((value) => <option key={value} value={value}>{actionStatusLabel(value)}</option>)}
      </select>
      {wantsFollowUp && <>
        <label className="visually-hidden" htmlFor={`follow-up-${action.id}`}>Follow up on {action.title}</label>
        <input
          id={`follow-up-${action.id}`}
          type="date"
          name="followUpAt"
          value={followUp}
          disabled={busy}
          onChange={(event) => setFollowUp(event.target.value)}
        />
      </>}
      <button className="button button-small" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
    </div>
    {wantsFollowUp && <p className="action-hint">Optional: the date you intend to check back. Leave empty for no reminder.</p>}
    {losesFollowUp && <p className="action-hint">Saving this will remove the follow-up date, because it only applies while Waiting.</p>}
    {message && <p className="field-error" role="alert">{message}</p>}
  </form>;
}
