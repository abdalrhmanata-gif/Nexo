"use client";

import { FormEvent, useState } from "react";
import type { MissionLifecycleStatus } from "../lib/view-models";

const statuses: MissionLifecycleStatus[] = [
  "DRAFT", "PLANNING", "READY", "RUNNING", "WAITING", "NEEDS_USER",
  "VERIFYING", "COMPLETED", "PAUSED", "BLOCKED", "FAILED", "CANCELLED",
];

export function MissionMutationControls({
  missionId,
  objective,
  status,
  version,
}: {
  missionId: string;
  objective: string;
  status: MissionLifecycleStatus;
  version: number;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function mutate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("mutation") ?? "");
    const body = kind === "status"
      ? { status: String(form.get("status") ?? ""), expectedVersion: version }
      : { objective: String(form.get("objective") ?? ""), expectedVersion: version };
    const response = await fetch(`/api/missions/${missionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.status === 409) {
      setMessage("This mission changed elsewhere. Refreshing the authoritative state…");
      window.setTimeout(() => window.location.reload(), 900);
      return;
    }
    setBusy(false);
    if (response.ok) {
      window.location.reload();
      return;
    }
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.error ?? "Mission update was not accepted.");
  }

  return <div className="form-grid">
    <form onSubmit={mutate}>
      <input type="hidden" name="mutation" value="objective" />
      <div className="field"><label htmlFor="objective">Mission objective</label><textarea id="objective" name="objective" defaultValue={objective} required /></div>
      <button className="button button-small" type="submit" disabled={busy}>Save objective</button>
    </form>
    <form onSubmit={mutate}>
      <input type="hidden" name="mutation" value="status" />
      <div className="field"><label htmlFor="status">Current state</label><select id="status" name="status" defaultValue={status}>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      <button className="button button-small" type="submit" disabled={busy}>Transition mission</button>
    </form>
    {message && <div className="field-error" role="alert">{message}</div>}
  </div>;
}
