"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActionStatus, MissionAction } from "../lib/view-models";
import {
  actionStatusLabel,
  allowedNextStatuses,
  followUpInputValue,
  isTerminalActionStatus,
  supportsFollowUp,
} from "../lib/mission-content.mjs";

export function ActionMutationControls({ missionId, action }: { missionId: string; action: MissionAction }) {
  const router = useRouter();
  const [status, setStatus] = useState<ActionStatus>(action.status);
  const [followUp, setFollowUp] = useState(followUpInputValue(action.followUpAt));
  const [actionVersion, setActionVersion] = useState(action.version);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    // A delayed router.refresh() response must never roll an accepted
    // mutation version back behind the latest server-confirmed value.
    if (action.version < actionVersion) return;
    setActionVersion(action.version);
    setStatus(action.status);
    setFollowUp(followUpInputValue(action.followUpAt));
  }, [action.id, action.status, action.followUpAt, action.version, actionVersion]);

  if (isTerminalActionStatus(action.status)) {
    return <p className="action-final">{actionStatusLabel(action.status)} — no further changes.</p>;
  }

  const options: ActionStatus[] = [status, ...allowedNextStatuses(status)];
  const wantsFollowUp = supportsFollowUp(status);
  const losesFollowUp = Boolean(followUp) && !wantsFollowUp;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/missions/" + missionId + "/actions/" + action.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          expectedVersion: actionVersion,
          ...(wantsFollowUp ? { followUpAt: followUp ? new Date(followUp + "T09:00:00").toISOString() : null } : {}),
        }),
      });
      if (response.status === 409) {
        setMessage("This action changed elsewhere. Showing the latest saved state.");
        router.refresh();
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error ?? "Action update was not accepted.");
        return;
      }

      const payload = await response.json().catch(() => null) as { action?: MissionAction } | null;
      const savedAction = payload?.action;
      if (!savedAction
        || savedAction.id !== action.id
        || !Number.isSafeInteger(savedAction.version)
        || savedAction.version <= actionVersion) {
        setMessage("Action saved, but its new version could not be confirmed. Refresh before changing it again.");
        router.refresh();
        return;
      }

      // Use the authoritative response before re-enabling Save. An immediate
      // next transition must use the new expectedVersion, not stale page props.
      setActionVersion(savedAction.version);
      setStatus(savedAction.status);
      setFollowUp(followUpInputValue(savedAction.followUpAt));
      setMessage("Action saved.");
      router.refresh();
    } catch {
      setMessage("The action could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="action-control-group" data-action-version={actionVersion}>
    <div className="action-control">
      <label className="visually-hidden" htmlFor={"status-" + action.id}>Status for {action.title}</label>
      <select
        id={"status-" + action.id}
        name="status"
        value={status}
        disabled={busy}
        onChange={(event) => setStatus(event.target.value as ActionStatus)}
      >
        {options.map((value) => <option key={value} value={value}>{actionStatusLabel(value)}</option>)}
      </select>
      {wantsFollowUp && <>
        <label className="visually-hidden" htmlFor={"follow-up-" + action.id}>Follow up on {action.title}</label>
        <input
          id={"follow-up-" + action.id}
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
