"use client";

import { useEffect, useRef, useState } from "react";

type Source = { title: string; url: string };
type Research = { summary: string; sources: Source[] };
type ResearchRun = Research & {
  runId: string;
  requestId?: string;
  status: "COMPLETED";
  createdAt: string;
  verified: false;
};

function isResearchRun(value: unknown): value is ResearchRun {
  if (!value || typeof value !== "object") return false;
  const run = value as Record<string, unknown>;
  return typeof run.runId === "string"
    && run.status === "COMPLETED"
    && typeof run.createdAt === "string"
    && run.verified === false
    && typeof run.summary === "string"
    && Array.isArray(run.sources);
}

export function MissionResearchPanel({ missionId }: { missionId: string }) {
  const [research, setResearch] = useState<ResearchRun | null>(null);
  const hasLocalRun = useRef(false);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [historyWarning, setHistoryWarning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch(`/api/missions/${missionId}/research`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.runs)) throw new Error("Research history unavailable.");
        const saved = payload.runs.filter(isResearchRun);
        if (active) {
          setRuns(saved);
          if (!hasLocalRun.current) setResearch(saved[0] ?? null);
        }
      })
      .catch(() => {
        if (active) setHistoryWarning(true);
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => { active = false; };
  }, [missionId]);

  async function runResearch() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/missions/${missionId}/research`, {
        method: "POST",
        headers: { "x-request-id": crypto.randomUUID() },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Research could not be completed.");
        return;
      }
      if (!payload || typeof payload.summary !== "string" || !Array.isArray(payload.sources) || !isResearchRun(payload.run)) {
        setError("The research result was incomplete.");
        return;
      }
      const savedRun = {
        ...payload,
        ...payload.run,
        summary: payload.summary,
        sources: payload.sources,
      } as ResearchRun;
      hasLocalRun.current = true;
      setResearch(savedRun);
      setRuns((current) => [savedRun, ...current.filter((run) => run.runId !== savedRun.runId)].slice(0, 5));
      setHistoryWarning(payload.history_persisted === false);
    } catch {
      setError("Could not reach the research service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mission-execution" aria-labelledby="mission-execution-heading">
      <p className="eyebrow">Execution · Read-only</p>
      <h2 id="mission-execution-heading">Run this mission safely</h2>
      <p className="detail-intent">
        ZAVQERA can safely research the public web against this mission&apos;s intent and success criteria. It will not buy, book, contact anyone, submit forms, or change an account.
      </p>
      <button className="button" type="button" onClick={runResearch} disabled={busy}>
        {busy ? "Researching…" : research ? "Run research again" : "Run research"}
      </button>
      {loadingHistory && <p className="action-hint">Checking saved research…</p>}
      {historyWarning && !loadingHistory && <p className="action-hint">Research ran, but saved history could not be confirmed. The findings below still remain unverified.</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {research && (
        <div className="mission-research-result" aria-live="polite">
          <div className="research-summary">
            <p className="eyebrow">Research result · Unverified</p>
            <div className="research-body">{research.summary}</div>
          </div>
          {research.sources.length > 0 && (
            <div className="research-sources">
              <p className="eyebrow">Sources</p>
              <ul className="list">
                {research.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} target="_blank" rel="noreferrer">{source.title}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="action-hint">
            This run has no external side effects. Review the findings before treating them as evidence or making a consequential decision.
          </p>
        </div>
      )}
      {runs.length > 0 && (
        <div className="research-history">
          <p className="eyebrow">Saved research runs</p>
          <ul className="list">
            {runs.map((run) => (
              <li key={run.runId}>
                <button className="button button-small button-quiet" type="button" onClick={() => setResearch(run)}>
                  {new Date(run.createdAt).toLocaleString("en-GB")} · {run.sources.length} source{run.sources.length === 1 ? "" : "s"} · Unverified
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
