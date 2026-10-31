"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { MissionLifecycleStatus } from "../lib/view-models";
import {
  allowedNextMissionStatuses,
  composeMissionObjective,
  isTerminalMissionStatus,
  missionStatusLabel,
} from "../lib/mission-content.mjs";

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
  const [missionStatus, setMissionStatus] = useState<MissionLifecycleStatus>(status);
  const [missionVersion, setMissionVersion] = useState(version);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Keep the client version monotonic: a delayed refresh cannot roll it back
    // behind a mutation response already accepted by the server.
    if (version < missionVersion) return;
    setMissionVersion(version);
    setMissionStatus(status);
  }, [version, status, missionVersion]);

  async function send(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/missions/" + missionId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 409) {
        setMessage("This mission changed elsewhere. Showing the latest saved state.");
        router.refresh();
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error ?? "Mission update was not accepted.");
        return;
      }

      const payload = await response.json().catch(() => null) as { mission?: { version?: number; lifecycleStatus?: MissionLifecycleStatus } } | null;
      const savedMission = payload?.mission;
      if (!savedMission
        || !Number.isSafeInteger(savedMission.version)
        || (savedMission.version ?? 0) <= missionVersion
        || !savedMission.lifecycleStatus) {
        setMessage("Mission saved, but its new version could not be confirmed. Refresh before changing it again.");
        router.refresh();
        return;
      }

      setMissionVersion(savedMission.version);
      setMissionStatus(savedMission.lifecycleStatus);
      setMessage("Mission saved.");
      router.refresh();
    } catch {
      setMessage("The mission could not be saved. Check your connection and try again.");
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
      setMessage("A mission needs both a name and an intent.");
      return;
    }
    await send({
      objective: composeMissionObjective({ name: nextName, intent: nextIntent, criteria: nextCriteria }),
      expectedVersion: missionVersion,
    });
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await send({ status: String(form.get("status") ?? ""), expectedVersion: missionVersion });
  }

  const nextStates = allowedNextMissionStatuses(missionStatus);

  return <div className="form-grid">
    <form onSubmit={saveDetails}>
      <div className="field"><label htmlFor="mission-name">Mission name</label><input id="mission-name" name="name" defaultValue={name} required /></div>
      <div className="field"><label htmlFor="mission-intent">Intent</label><textarea id="mission-intent" name="intent" defaultValue={intent} required /></div>
      <div className="field">
        <label htmlFor="mission-criteria">Success criteria</label>
        <textarea id="mission-criteria" name="criteria" defaultValue={criteria.join("\n")} />
        <small>One per line. These describe what good looks like, not the work itself.</small>
      </div>
      <button className="button button-small" type="submit" disabled={busy}>Save mission</button>
    </form>

    {isTerminalMissionStatus(missionStatus)
      ? <p className="action-final">{missionStatusLabel(missionStatus)} — this mission is closed.</p>
      : <form key={missionStatus} onSubmit={transition}>
        <div className="field">
          <label htmlFor="status">Mission state</label>
          <select id="status" name="status" defaultValue={nextStates[0]} disabled={busy}>
            {nextStates.map((item) => <option key={item} value={item}>{missionStatusLabel(item)}</option>)}
          </select>
          <small>Currently {missionStatusLabel(missionStatus).toLowerCase()}. Only states this mission can legally move to are listed.</small>
        </div>
        <button className="button button-small" type="submit" disabled={busy}>Move mission</button>
      </form>}
    {message && <div className="field-error" role="alert">{message}</div>}
  </div>;
}
