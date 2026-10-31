"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { MissionLifecycleStatus } from "../lib/view-models";
import {
  allowedNextMissionStatuses,
  composeMissionObjective,
  isTerminalMissionStatus,
  missionStatusLabel,
} from "../lib/mission-content.mjs";
import { useUiTranslation } from "./localized-text";

export function MissionMutationControls({
  missionId,
  name,
  intent,
  criteria,
  status,
  version,
}: {
  missionId: string;
  name: string;
  intent: string;
  criteria: string[];
  status: MissionLifecycleStatus;
  version: number;
}) {
  const router = useRouter();
  const t = useUiTranslation();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/missions/${missionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 409) {
        setMessage(t("This mission changed elsewhere. Showing the latest saved state."));
        router.refresh();
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error ?? t("Mission update was not accepted."));
        return;
      }
      setMessage(t("Mission saved."));
      router.refresh();
    } catch {
      setMessage(t("The mission could not be saved. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  // The stored objective holds the name, the intent and the success criteria
  // together. Editing only one of them would previously overwrite the whole
  // column, so all three are always recomposed here.
  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextName = String(form.get("name") ?? "").trim();
    const nextIntent = String(form.get("intent") ?? "").trim();
    const nextCriteria = String(form.get("criteria") ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!nextName || !nextIntent) {
      setMessage(t("A mission needs both a name and an intent."));
      return;
    }
    await send({
      objective: composeMissionObjective({ name: nextName, intent: nextIntent, criteria: nextCriteria }),
      expectedVersion: version,
    });
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send({ status: String(form.get("status") ?? ""), expectedVersion: version });
  }

  const nextStates = allowedNextMissionStatuses(status);

  return <div className="form-grid">
    <form onSubmit={saveDetails}>
      <div className="field"><label htmlFor="mission-name">{t("Mission name")}</label><input id="mission-name" name="name" defaultValue={name} required /></div>
      <div className="field"><label htmlFor="mission-intent">{t("Intent")}</label><textarea id="mission-intent" name="intent" defaultValue={intent} required /></div>
      <div className="field">
        <label htmlFor="mission-criteria">{t("Success criteria")}</label>
        <textarea id="mission-criteria" name="criteria" defaultValue={criteria.join("\n")} />
        <small>{t("One per line. These describe what good looks like, not the work itself.")}</small>
      </div>
      <button className="button button-small" type="submit" disabled={busy}>{t("Save mission")}</button>
    </form>

    {isTerminalMissionStatus(status)
      ? <p className="action-final">{t(missionStatusLabel(status))} — {t("Mission is closed")}.</p>
      : <form key={status} onSubmit={transition}>
        <div className="field">
          <label htmlFor="status">{t("Mission state")}</label>
          <select id="status" name="status" defaultValue={nextStates[0]} disabled={busy}>
            {nextStates.map((item) => <option key={item} value={item}>{t(missionStatusLabel(item))}</option>)}
          </select>
          <small>{t("Currently")} {t(missionStatusLabel(status)).toLowerCase()}. {t("Only states this mission can legally move to are listed.")}</small>
        </div>
        <button className="button button-small" type="submit" disabled={busy}>{t("Move mission")}</button>
      </form>}
    {message && <div className="field-error" role="alert">{message}</div>}
  </div>;
}
