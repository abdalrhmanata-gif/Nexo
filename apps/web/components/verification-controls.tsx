"use client";

import { FormEvent, useState } from "react";
import { LocalizedText, useTranslate } from "./localized-text";
import { useRouter } from "next/navigation";
import type { MissionVerification } from "../lib/view-models";

// Verification used to open two empty boxes and ask the person to retype,
// from memory, the success criteria written a few centimetres up the same
// page — and to recall which steps they had finished. The mission already
// holds both. This hands them over instead of asking for them back.
export function VerificationControls({
  missionId,
  verification,
  criteria = [],
  completedSteps = [],
}: {
  missionId: string;
  verification?: MissionVerification;
  criteria?: string[];
  completedSteps?: string[];
}) {
  const t = useTranslate();
  const router = useRouter();
  const [evidence, setEvidence] = useState("");
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

  if (verification?.status === "VERIFIED") return <div className="form-grid"><form onSubmit={commit}><div className="field"><label htmlFor="result"><LocalizedText en="Outcome result" /></label><textarea id="result" name="result" required /></div><div className="field"><label htmlFor="score"><LocalizedText en="Success score" /></label><input id="score" name="score" type="number" min="0" max="1" step="0.01" defaultValue="1" /></div><button className="button" type="submit" disabled={busy}><LocalizedText en="Commit verified outcome" /></button></form>{message && <div className="field-error" role="alert">{message}</div>}</div>;
  const citeStep = (step: string) => {
    setEvidence((current) => {
      const line = `- ${step}`;
      if (current.split("\n").some((existing) => existing.trim() === line)) return current;
      return current.trim() ? `${current.replace(/\s+$/, "")}\n${line}` : line;
    });
  };

  return <div className="form-grid">
    <form onSubmit={verify}>
      <div className="field">
        <label htmlFor="criteria"><LocalizedText en="Verification criteria" /></label>
        <textarea id="criteria" name="criteria" defaultValue={criteria.join("\n")} required />
        <small>{criteria.length
          ? <LocalizedText en="Filled in from this mission's own success criteria. Change it if what you checked was different." />
          : <LocalizedText en="This mission records no success criteria, so there is nothing to fill in. Write what you actually checked." />}</small>
      </div>
      <div className="field">
        <label htmlFor="evidence"><LocalizedText en="Evidence summary" /></label>
        <textarea id="evidence" name="evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)} required />
        {completedSteps.length > 0 && <div className="evidence-cite">
          <small><LocalizedText en="Completed steps you can cite:" /></small>
          <div className="evidence-cite-list">
            {completedSteps.map((step) => <button key={step} type="button" className="button button-small button-quiet"
              onClick={() => citeStep(step)} title={t("Add this step to the evidence")}>{step}</button>)}
          </div>
        </div>}
      </div>
      <div className="field">
        <label htmlFor="confidence"><LocalizedText en="Confidence" /></label>
        <input id="confidence" name="confidence" type="number" min="0" max="1" step="0.01" defaultValue="1" />
      </div>
      <button className="button" type="submit" disabled={busy}><LocalizedText en="Record verification" /></button>
    </form>
    {message && <div className="field-error" role="alert">{message}</div>}
  </div>;
}
