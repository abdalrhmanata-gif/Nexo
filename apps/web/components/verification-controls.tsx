"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { MissionVerification } from "../lib/view-models";

export function VerificationControls({ missionId, verification }: { missionId: string; verification?: MissionVerification }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
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
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error ?? "Verification failed.");
        return;
      }
      setMessage("Verification recorded. Refreshing mission state…");
      router.refresh();
    } catch {
      setMessage("Verification could not be saved. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/missions/${missionId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId: verification?.id, result: { summary: String(form.get("result") ?? "") }, successScore: Number(form.get("score") ?? 1), status: "COMPLETED" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error ?? "Outcome could not be committed.");
        return;
      }
      setMessage("Verified outcome committed.");
      router.refresh();
    } catch {
      setMessage("Outcome could not be committed. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (verification?.status === "VERIFIED") return <div className="form-grid"><form onSubmit={commit}><div className="field"><label htmlFor="result">Outcome result</label><textarea id="result" name="result" required /></div><div className="field"><label htmlFor="score">Success score</label><input id="score" name="score" type="number" min="0" max="1" step="0.01" defaultValue="1" /></div><button className="button" type="submit" disabled={busy}>Commit verified outcome</button></form>{message && <div className="field-error" role="alert">{message}</div>}</div>;
  return <div className="form-grid"><form onSubmit={verify}><div className="field"><label htmlFor="criteria">Verification criteria</label><textarea id="criteria" name="criteria" required /></div><div className="field"><label htmlFor="evidence">Evidence summary</label><textarea id="evidence" name="evidence" required /></div><div className="field"><label htmlFor="confidence">Confidence</label><input id="confidence" name="confidence" type="number" min="0" max="1" step="0.01" defaultValue="1" /></div><button className="button" type="submit" disabled={busy}>Record verification</button></form>{message && <div className="field-error" role="alert">{message}</div>}</div>;
}
