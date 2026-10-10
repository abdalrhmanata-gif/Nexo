"use client";

import { FormEvent, useEffect, useState } from "react";
import type { MissionResearchRun } from "../lib/mission-repository";
import type { MissionVerification } from "../lib/view-models";

export function VerificationControls({ missionId, verification }: { missionId: string; verification?: MissionVerification }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [latestResearch, setLatestResearch] = useState<MissionResearchRun | null>(null);
  const [researchLoading, setResearchLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`/api/missions/${missionId}/research`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!active) return;
        setLatestResearch(Array.isArray(payload?.runs) && payload.runs.length > 0 ? payload.runs[0] : null);
      })
      .catch(() => { if (active) setLatestResearch(null); })
      .finally(() => { if (active) setResearchLoading(false); });
    return () => { active = false; };
  }, [missionId]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/missions/${missionId}/verification`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "VERIFIED",
        criteria: { summary: String(form.get("criteria") ?? "").trim() },
        evidence: {
          summary: String(form.get("evidence") ?? "").trim(),
          ...(latestResearch ? { research_run_id: latestResearch.runId, research_request_id: latestResearch.requestId, research_source_count: latestResearch.sources.length } : {}),
        },
        confidence: Number(form.get("confidence") ?? 0),
      }),
    });
    setBusy(false);
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Verification recorded. The verified outcome can now be committed." : (payload.error ?? "Verification failed."));
    if (response.ok) window.location.reload();
  }

  async function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/missions/${missionId}/outcome`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verificationId: verification?.id, result: { summary: String(form.get("result") ?? "").trim() }, successScore: Number(form.get("score") ?? 1), status: "COMPLETED" }),
    });
    setBusy(false);
    const payload = await response.json().catch(() => ({}));
    setMessage(response.ok ? "Verified outcome committed." : (payload.error ?? "Outcome could not be committed."));
    if (response.ok) window.location.reload();
  }

  if (verification?.status === "VERIFIED") return <div className="form-grid">
    <p className="action-hint">This outcome is attached to the passing verification above. Commit only what the verified evidence actually supports.</p>
    <form onSubmit={commit}>
      <div className="field"><label htmlFor="result">Outcome result</label><textarea id="result" name="result" required /></div>
      <div className="field"><label htmlFor="score">Success score</label><input id="score" name="score" type="number" min="0" max="1" step="0.01" defaultValue="1" /></div>
      <button className="button" type="submit" disabled={busy}>Commit verified outcome</button>
    </form>
    {message && <div className="field-error" role="alert">{message}</div>}
  </div>;

  return <div className="form-grid">
    {!researchLoading && latestResearch && <div className="readiness" role="status">
      <strong>Latest execution available</strong>
      <p>{latestResearch.sources.length} source{latestResearch.sources.length === 1 ? "" : "s"} · Run {latestResearch.runId.slice(0, 8)} · still unverified.</p>
      <p className="action-hint">The evidence form below is prefilled from this execution. Review it before recording verification.</p>
    </div>}
    {!researchLoading && !latestResearch && <p className="action-hint">No saved execution is available. Verification can still be recorded from other evidence you reviewed.</p>}
    <form onSubmit={verify}>
      <div className="field"><label htmlFor="criteria">Verification criteria</label><textarea id="criteria" name="criteria" required placeholder="What exactly did you check?" /></div>
      <div className="field"><label htmlFor="evidence">Evidence summary</label><textarea key={latestResearch?.runId ?? "manual"} id="evidence" name="evidence" required defaultValue={latestResearch?.summary ?? ""} /></div>
      <div className="field"><label htmlFor="confidence">Confidence</label><input id="confidence" name="confidence" type="number" min="0" max="1" step="0.01" defaultValue="0.9" /></div>
      <button className="button" type="submit" disabled={busy}>{busy ? "Recording…" : "Record verification"}</button>
    </form>
    {message && <div className="field-error" role="alert">{message}</div>}
  </div>;
}
