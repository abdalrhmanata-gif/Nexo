"use client";

import { FormEvent, useEffect, useState } from "react";
import { LocalizedText, fill, useTranslate } from "./localized-text";
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
  const t = useTranslate();
  const router = useRouter();
  const [status, setStatus] = useState<ActionStatus>(action.status);
  const [followUp, setFollowUp] = useState(followUpInputValue(action.followUpAt));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setStatus(action.status);
    setFollowUp(followUpInputValue(action.followUpAt));
  }, [action.id, action.status, action.followUpAt, action.version]);

  if (isTerminalActionStatus(action.status)) {
    return <p className="action-final">{fill(t("{state} — no further changes."), { state: actionStatusLabel(action.status, t) })}</p>;
  }

  const options: ActionStatus[] = [action.status, ...allowedNextStatuses(action.status)];
  const wantsFollowUp = supportsFollowUp(status);
  const losesFollowUp = Boolean(action.followUpAt) && !wantsFollowUp;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/missions/${missionId}/actions/${action.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          expectedVersion: action.version,
          ...(wantsFollowUp ? { followUpAt: followUp ? new Date(`${followUp}T09:00:00`).toISOString() : null } : {}),
        }),
      });
      if (response.status === 409) {
        setMessage(t("This action changed elsewhere. Showing the latest saved state."));
        router.refresh();
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error ? t(payload.error) : t("Action update was not accepted."));
        return;
      }
      setMessage(t("Action saved."));
      router.refresh();
    } catch {
      setMessage(t("The action could not be saved. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="action-control-group">
    <div className="action-control">
      <label className="visually-hidden" htmlFor={`status-${action.id}`}>{fill(t("Status for {title}"), { title: action.title })}</label>
      <select
        id={`status-${action.id}`}
        name="status"
        value={status}
        disabled={busy}
        onChange={(event) => setStatus(event.target.value as ActionStatus)}
      >
        {options.map((value) => <option key={value} value={value}>{actionStatusLabel(value, t)}</option>)}
      </select>
      {wantsFollowUp && <>
        <label className="visually-hidden" htmlFor={`follow-up-${action.id}`}>{fill(t("Follow up on {title}"), { title: action.title })}</label>
        <input
          id={`follow-up-${action.id}`}
          type="date"
          name="followUpAt"
          value={followUp}
          disabled={busy}
          onChange={(event) => setFollowUp(event.target.value)}
        />
      </>}
      <button className="button button-small" type="submit" disabled={busy}>{busy ? t("Saving…") : t("Save")}</button>
    </div>
    {wantsFollowUp && <p className="action-hint"><LocalizedText en="Optional: the date you intend to check back. Leave empty for no reminder." /></p>}
    {losesFollowUp && <p className="action-hint"><LocalizedText en="Saving this will remove the follow-up date, because it only applies while Waiting." /></p>}
    {message && <p className="field-error" role="alert">{message}</p>}
  </form>;
}
