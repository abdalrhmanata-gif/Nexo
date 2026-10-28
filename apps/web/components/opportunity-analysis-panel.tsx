"use client";

import { useState } from "react";
import type { OpportunityEvidenceItem } from "../lib/evidence-ledger.mjs";
import type { OpportunityAnalysisReport } from "../lib/opportunity-analysis.mjs";

type OpportunityAnalysisSubject = {
  title: string;
  target: string;
  thesis: string;
  evidenceUrl: string;
  evidenceItems: OpportunityEvidenceItem[];
  strategicFit: number;
  potentialValue: number;
  urgency: number;
  evidenceStrength: number;
  effort: number;
};

const MAX_EVIDENCE_ITEMS = 10;

function missionHref(report: OpportunityAnalysisReport, score: number): string {
  const params = new URLSearchParams({
    fromOpportunity: "1",
    name: report.missionDraft.name.slice(0, 100),
    intent: [
      "AI-generated Opportunity Brief — review all assumptions and sources before acting.",
      `Executive summary: ${report.executiveSummary}`,
      `Decision: ${report.decision}. ${report.decisionRationale}`,
      `Existing local priority score: ${score}/100. This score is not a success probability or revenue forecast.`,
      `Experiment hypothesis: ${report.recommendedExperiment.hypothesis}`,
      `Success threshold: ${report.recommendedExperiment.successThreshold}`,
      `Failure threshold: ${report.recommendedExperiment.failureThreshold}`,
      `Estimated effort: ${report.recommendedExperiment.estimatedEffort}`,
      `Cost assumptions: ${report.recommendedExperiment.costAssumptions}`,
      `Critical unknowns: ${report.criticalUnknowns.join("; ") || "None listed; verify the report before proceeding."}`,
    ].join("\n\n").slice(0, 3000),
    criteria: report.missionDraft.successCriteria.join("\n").slice(0, 2000),
    actions: Array.from(new Set([
      ...report.missionDraft.firstActions,
      ...report.recommendedExperiment.steps,
    ])).slice(0, 6).join("\n").slice(0, 2000),
  });
  return `/app/missions/new?${params.toString()}`;
}

function decisionLabel(decision: OpportunityAnalysisReport["decision"]) {
  return decision === "INSUFFICIENT_EVIDENCE" ? "Insufficient evidence" : decision.replaceAll("_", " ");
}

export function OpportunityAnalysisPanel({
  opportunity,
  score,
}: {
  opportunity: OpportunityAnalysisSubject;
  score: number;
}) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<OpportunityAnalysisReport | null>(null);
  const [error, setError] = useState("");

  const submittedEvidence = opportunity.evidenceItems.slice(-MAX_EVIDENCE_ITEMS);
  const evidenceById = new Map(submittedEvidence.map((item) => [item.id, item]));

  async function generateBrief() {
    setLoading(true);
    setError("");
    setReport(null);
    try {
      const response = await fetch("/api/opportunities/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          title: opportunity.title,
          target: opportunity.target,
          thesis: opportunity.thesis,
          evidenceUrl: opportunity.evidenceUrl,
          ratings: {
            strategicFit: opportunity.strategicFit,
            potentialValue: opportunity.potentialValue,
            urgency: opportunity.urgency,
            evidenceStrength: opportunity.evidenceStrength,
            effort: opportunity.effort,
          },
          evidenceItems: submittedEvidence,
          totalEvidenceCount: opportunity.evidenceItems.length,
        }),
      });
      const payload = await response.json() as {
        report?: OpportunityAnalysisReport;
        code?: string;
        error?: string;
      };
      if (!response.ok || !payload.report) {
        if (payload.code === "AI_ANALYSIS_NOT_CONFIGURED") {
          throw new Error("AI analysis is not enabled on this deployment yet. No AI request was sent.");
        }
        if (payload.code === "AUTHENTICATION_REQUIRED") {
          throw new Error("Sign in to generate an AI Opportunity Brief.");
        }
        throw new Error(payload.error || "The AI brief could not be generated. Your saved opportunity has not been changed.");
      }
      setReport(payload.report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The AI brief could not be generated.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="opportunity-analysis" aria-label={`AI analysis for ${opportunity.title}`}>
      <div className="analysis-toolbar">
        <div>
          <p className="eyebrow">Optional AI analyst</p>
          <p className="action-hint">Challenges assumptions, checks the evidence you recorded, and proposes a measurable test.</p>
        </div>
        <button className="button button-small" type="button" onClick={generateBrief} disabled={loading} aria-busy={loading}>
          {loading ? "Analyzing…" : report ? "Regenerate AI brief" : "Generate AI brief"}
        </button>
      </div>
      <p className="analysis-caution">When enabled, this sends the opportunity and up to {MAX_EVIDENCE_ITEMS} of your most recent evidence notes to the configured AI provider. Zavqera does not fetch the cited URLs. Review every conclusion before acting.</p>
      {loading && <p className="analysis-status" role="status">Reviewing the supplied evidence and drafting a validation experiment…</p>}
      {error && <p className="field-error analysis-error" role="alert">{error}</p>}
      {report && (
        <div className="analysis-report" aria-live="polite">
          <div className="analysis-report-heading">
            <div>
              <p className="eyebrow">AI Opportunity Brief</p>
              <h3>{decisionLabel(report.decision)}</h3>
            </div>
            <span className="analysis-score-note">Rule-based score: {score}/100</span>
          </div>
          <p>{report.executiveSummary}</p>
          <div className="analysis-section">
            <h4>Why this decision?</h4>
            <p>{report.decisionRationale}</p>
          </div>
          <div className="analysis-section">
            <h4>Signals and conclusions</h4>
            {report.claims.length ? (
              <ul className="analysis-list">
                {report.claims.map((claim, index) => (
                  <li key={`${claim.kind}-${index}`}>
                    <span className={`analysis-kind analysis-kind-${claim.kind}`}>{claim.kind}</span>
                    <span className="analysis-claim-text">{claim.claim}</span>
                    <span className="analysis-confidence">Confidence: {claim.confidence}</span>
                    {claim.evidenceIds.length > 0 && (
                      <span className="analysis-sources">
                        {claim.evidenceIds.map((id) => {
                          const source = evidenceById.get(id);
                          return source ? (
                            <a key={id} href={source.url} target="_blank" rel="noopener noreferrer" title="User-provided source; not fetched by Zavqera">
                              Source: {source.title}
                            </a>
                          ) : null;
                        })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : <p>No source-backed claims were returned. Treat the report as a hypothesis until evidence is added.</p>}
          </div>
          <div className="analysis-section">
            <h4>Risks to resolve</h4>
            {report.risks.length ? (
              <ul className="analysis-list">
                {report.risks.map((risk, index) => (
                  <li key={index}>
                    <strong>{risk.severity.toUpperCase()}: {risk.risk}</strong>
                    <p>{risk.mitigation}</p>
                  </li>
                ))}
              </ul>
            ) : <p>No explicit risks were returned. Perform an independent risk review.</p>}
          </div>
          <div className="analysis-section">
            <h4>Critical unknowns</h4>
            {report.criticalUnknowns.length
              ? <ul className="analysis-list">{report.criticalUnknowns.map((item, index) => <li key={index}>{item}</li>)}</ul>
              : <p>No critical unknowns were listed; this does not prove that all important facts are known.</p>}
          </div>
          <div className="analysis-experiment">
            <p className="eyebrow">Recommended next experiment</p>
            <h4>{report.recommendedExperiment.hypothesis}</h4>
            <ol>{report.recommendedExperiment.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
            <p><strong>Metric:</strong> {report.recommendedExperiment.successMetric}</p>
            <p><strong>Success threshold:</strong> {report.recommendedExperiment.successThreshold}</p>
            <p><strong>Failure threshold:</strong> {report.recommendedExperiment.failureThreshold}</p>
            <p><strong>Effort:</strong> {report.recommendedExperiment.estimatedEffort}</p>
            <p><strong>Cost assumptions:</strong> {report.recommendedExperiment.costAssumptions}</p>
          </div>
          {opportunity.evidenceItems.length > MAX_EVIDENCE_ITEMS && (
            <p className="action-hint">The brief used the {MAX_EVIDENCE_ITEMS} most recent notes. {opportunity.evidenceItems.length - MAX_EVIDENCE_ITEMS} older notes were not sent to the provider.</p>
          )}
          <div className="analysis-mission-draft">
            <h4>Mission draft</h4>
            <p>{report.missionDraft.intent}</p>
            <p className="action-hint">Nothing is created automatically. You can review and edit the draft before submitting it.</p>
            <a className="button button-small" href={missionHref(report, score)}>Review as Mission</a>
          </div>
        </div>
      )}
    </section>
  );
}
