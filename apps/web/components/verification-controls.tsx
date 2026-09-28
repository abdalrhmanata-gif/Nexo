"use client";

import { FormEvent, useState } from "react";
import type { MissionVerification } from "../lib/view-models";

export function VerificationControls({ missionId, verification }: { missionId: string; verification?: MissionVerification }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/missions/${missionId}/verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "VERIFIED",
        criteria: { summary: String(form.get("criteria") ?? "") },
        evidence: { summary: String(form.get("evidence") ?? "") },
        confidence: Number(form.get("confidence") ?? 0),
      }),
    });
    setBusy(false);
    setMessage(response.ok ? "Verification recorded. You can now commit the verified outcome." : ((await response.json()).error ?? "Verification failed."));
    if (response.ok) window.location.reload();
  }

  async function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/missions/${missionId}/outcome`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: verification?.id, result: { summary: String(form.get("result") ?? "") }, successScore: Number(form.get("score") ?? 1), status: "COMPLETED" }),
    });
    setBusy(false);
    setMessage(response.ok ? "Verified outcome committed." : ((await response.json()).error ?? "Outcome could not be committed."));
    if (response.ok) window.location.reload();
  }

  if (verification?.status === "VERIFIED") return <div className="form-grid"><form onSubmit={commit}><div className="field"><label htmlFor="result">Outcome result</label><textarea id="result" name="result" required /></div><div className="field"><label htmlFor="score">Success score</label><input id="score" name="score" type="number" min="0" max="1" step="0.01" defaultValue="1" /></div><button className="button" type="submit" disabled={busy}>Commit verified outcome</button></form>{message && <div className="field-error" role="alert">{message}</div>}</div>;
  return <div className="form-grid"><form onSubmit={verify}><div className="field"><label htmlFor="criteria">Verification criteria</label><textarea id="criteria" name="criteria" required /></div><div className="field"><label htmlFor="evidence">Evidence summary</label><textarea id="evidence" name="evidence" required /></div><div className="field"><label htmlFor="confidence">Confidence</label><input id="confidence" name="confidence" type="number" min="0" max="1" step="0.01" defaultValue="1" /></div><button className="button" type="submit" disabled={busy}>Record verification</button></form>{message && <div className="field-error" role="alert">{message}</div>}</div>;
}
