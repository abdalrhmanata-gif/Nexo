"use client";

import { useState } from "react";

type Source = { title: string; url: string };
type Research = { summary: string; sources: Source[] };

export function MissionResearchPanel({ missionId }: { missionId: string }) {
  const [research, setResearch] = useState<Research | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      if (!payload || typeof payload.summary !== "string" || !Array.isArray(payload.sources)) {
        setError("The research result was incomplete.");
        return;
      }
      setResearch(payload as Research);
    } catch {
      setError("Could not reach the research service. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mission-execution" aria-labelledby="mission-execution-heading">
      <p className="eyebrow">Execution</p>
      <h2 id="mission-execution-heading">Run a research pass</h2>
      <p className="detail-intent">
        ZAVQERA can safely research the public web against this mission&apos;s intent and success criteria. It will not buy, book, contact anyone, or change an account.
      </p>
      <button className="button" type="button" onClick={runResearch} disabled={busy}>
        {busy ? "Researching…" : research ? "Run research again" : "Run research"}
      </button>
      {error && <p className="field-error" role="alert">{error}</p>}
      {research && (
        <div className="mission-research-result" aria-live="polite">
          <div className="research-summary">
            <p className="eyebrow">Research result</p>
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
            This is read-only research. Review the findings before using them as mission evidence or making a consequential decision.
          </p>
        </div>
      )}
    </section>
  );
}
