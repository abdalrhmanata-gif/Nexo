"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { opportunityPriority, priorityDescription, scoreOpportunity } from "../lib/opportunity-intelligence.mjs";
import { isOpportunityEvidenceItem, type OpportunityEvidenceItem } from "../lib/evidence-ledger.mjs";
import { OpportunityEvidencePanel } from "./opportunity-evidence-panel";

type Opportunity = {
  id: string;
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
  createdAt: number;
};

type OpportunityForm = {
  title: string;
  target: string;
  thesis: string;
  evidenceUrl: string;
  strategicFit: string;
  potentialValue: string;
  urgency: string;
  evidenceStrength: string;
  effort: string;
};

const STORAGE_KEY = "zavqera.opportunity-intelligence.v1";
const EMPTY_FORM: OpportunityForm = {
  title: "",
  target: "",
  thesis: "",
  evidenceUrl: "",
  strategicFit: "3",
  potentialValue: "3",
  urgency: "3",
  evidenceStrength: "2",
  effort: "3",
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isOpportunity(value: unknown): value is Opportunity {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Opportunity>;
  return typeof item.id === "string"
    && typeof item.title === "string"
    && typeof item.target === "string"
    && typeof item.thesis === "string"
    && typeof item.evidenceUrl === "string"
    && ["strategicFit", "potentialValue", "urgency", "evidenceStrength", "effort"]
      .every((key) => typeof item[key as keyof Opportunity] === "number")
    && typeof item.createdAt === "number";
}

function normalizeStoredOpportunity(item: Opportunity): Opportunity {
  const legacy = item as Opportunity & { evidenceItems?: unknown };
  return {
    ...legacy,
    evidenceItems: Array.isArray(legacy.evidenceItems)
      ? legacy.evidenceItems.filter(isOpportunityEvidenceItem)
      : [],
  };
}

function missionHref(opportunity: Opportunity): string {
  const score = scoreOpportunity(opportunity);
  const priority = opportunityPriority(score);
  const priorityLabel = priority === "HIGH_SCORE" ? "high score; evidence review required" : priority === "VALIDATE" ? "validate" : "hold";
  const sourceNote = opportunity.evidenceUrl
    ? `Original source reference provided by the user (not independently verified): ${opportunity.evidenceUrl}`
    : "No original source reference has been attached.";
  const evidenceNotes = opportunity.evidenceItems.slice(0, 3).map((item) =>
    `[${item.stance.toUpperCase()}] ${item.title} — ${item.url}. User-recorded observation: ${item.observation.slice(0, 220)}`
  ).join("\\n");
  const ledgerNote = opportunity.evidenceItems.length
    ? `User-recorded evidence notes (not independently verified):\n${evidenceNotes}`
    : "No reviewed evidence notes are recorded yet. Search public sources and test assumptions before deciding.";
  const params = new URLSearchParams({
    fromOpportunity: "1",
    name: `Evaluate: ${opportunity.title}`.slice(0, 90),
    intent: [
      `Assess whether this opportunity is worth pursuing for ${opportunity.target || "the intended audience"}.`,
      `Opportunity thesis: ${opportunity.thesis}`,
      `Current rule-based priority: ${score}/100 (${priorityLabel}). This is a prioritization aid, not a forecast.`,
      sourceNote,
    ].join("\n\n"),
    criteria: [
      "Assess the source and verify the key claims",
      "Test the riskiest assumption with a low-cost experiment",
      "Estimate likely value, effort, and important risks",
      "Record a clear pursue, validate, defer, or reject decision",
    ].join("\n"),
    actions: [
      "Review the opportunity thesis and available evidence",
      "Identify the riskiest unproven assumption",
      "Design the smallest useful validation test",
      "Record evidence, decision, and next action",
    ].join("\n"),
  });
  return `/app/missions/new?${params.toString()}`;
}

function RatingField({
  id,
  label,
  help,
  value,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="1">1 — Very low</option>
        <option value="2">2 — Low</option>
        <option value="3">3 — Medium</option>
        <option value="4">4 — High</option>
        <option value="5">5 — Very high</option>
      </select>
      <small>{help}</small>
    </div>
  );
}

export function OpportunityIntelligence() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [form, setForm] = useState<OpportunityForm>(EMPTY_FORM);
  const [storageReady, setStorageReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) setOpportunities(parsed.filter(isOpportunity).map(normalizeStoredOpportunity));
      }
    } catch {
      // A blocked or malformed local store should not prevent the feature from opening.
    } finally {
      setStorageReady(true);
    }
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(opportunities));
    } catch {
      setError("Browser storage is unavailable. Export or copy important details before leaving this page.");
    }
  }, [opportunities, storageReady]);

  const ranked = useMemo(
    () => opportunities
      .map((opportunity) => ({ opportunity, score: scoreOpportunity(opportunity) }))
      .sort((a, b) => b.score - a.score || b.opportunity.createdAt - a.opportunity.createdAt),
    [opportunities],
  );

  const highScoreWithEvidence = ranked.filter(
    ({ opportunity, score }) => score >= 80 && opportunity.evidenceItems.length > 0,
  ).length;
  const missingEvidenceReview = ranked.filter(({ opportunity }) => opportunity.evidenceItems.length === 0).length;

  function updateForm<K extends keyof OpportunityForm>(key: K, value: OpportunityForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addOpportunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const title = form.title.trim();
    const thesis = form.thesis.trim();
    const evidenceUrl = form.evidenceUrl.trim();

    if (!title || !thesis) {
      setError("Add an opportunity name and a concise explanation of why it may matter.");
      return;
    }
    if (evidenceUrl && !isHttpUrl(evidenceUrl)) {
      setError("Use a full public http:// or https:// source URL, or leave the field blank.");
      return;
    }

    const id = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `opp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    setOpportunities((current) => [{
      id,
      title,
      target: form.target.trim(),
      thesis,
      evidenceUrl,
      evidenceItems: [],
      strategicFit: Number(form.strategicFit),
      potentialValue: Number(form.potentialValue),
      urgency: Number(form.urgency),
      evidenceStrength: Number(form.evidenceStrength),
      effort: Number(form.effort),
      createdAt: Date.now(),
    }, ...current]);
    setForm(EMPTY_FORM);
  }

  return (
    <div className="container opportunity-page">
      <div className="opportunity-hero">
        <p className="eyebrow">Opportunity Intelligence · Early access</p>
        <h1 className="detail-title">Find the next move worth making.</h1>
        <p className="detail-intent">
          Compare opportunities using an explicit rubric, expose missing evidence, and turn the strongest candidate into a governed Mission.
        </p>
        <div className="opportunity-hero-note">
          <strong>Decision support, not false certainty.</strong> Scores explain how an opportunity ranks against your inputs. They are not market forecasts, verified facts, or a promise of revenue.
        </div>
      </div>

      <section className="opportunity-metrics" aria-label="Opportunity overview">
        <div className="opportunity-metric"><strong>{opportunities.length}</strong><span>Opportunities tracked</span></div>
        <div className="opportunity-metric"><strong>{highScoreWithEvidence}</strong><span>High score with evidence notes</span></div>
        <div className="opportunity-metric"><strong>{missingEvidenceReview}</strong><span>Need evidence review</span></div>
      </section>

      <div className="opportunity-layout">
        <section className="card opportunity-form-card" aria-labelledby="add-opportunity-heading">
          <p className="eyebrow">Step 1 · Capture</p>
          <h2 id="add-opportunity-heading">Add an opportunity</h2>
          <p className="opportunity-muted">Write down the opportunity and the assumptions behind it. Start with a hypothesis; evidence can be added later.</p>

          <form className="form-grid opportunity-form" onSubmit={addOpportunity}>
            <div className="field">
              <label htmlFor="opportunity-title">Opportunity name</label>
              <input id="opportunity-title" value={form.title} maxLength={100} onChange={(event) => updateForm("title", event.target.value)} placeholder="e.g. Reach an underserved customer segment" required />
            </div>
            <div className="field">
              <label htmlFor="opportunity-target">Who could benefit? <span className="field-optional">optional</span></label>
              <input id="opportunity-target" value={form.target} maxLength={160} onChange={(event) => updateForm("target", event.target.value)} placeholder="Customer, user group, market, or internal team" />
            </div>
            <div className="field">
              <label htmlFor="opportunity-thesis">Opportunity thesis</label>
              <textarea id="opportunity-thesis" value={form.thesis} maxLength={1200} onChange={(event) => updateForm("thesis", event.target.value)} placeholder="What is the unmet need, signal, or possible advantage? Why might it matter?" required />
              <small>Separate what you know from what you suspect. Do not enter confidential or sensitive personal information.</small>
            </div>
            <div className="field">
              <label htmlFor="opportunity-source">Public evidence source <span className="field-optional">optional</span></label>
              <input id="opportunity-source" inputMode="url" type="url" value={form.evidenceUrl} maxLength={500} onChange={(event) => updateForm("evidenceUrl", event.target.value)} placeholder="https://…" />
              <small>A reference you provide. This early version does not fetch, crawl, or independently verify the URL.</small>
            </div>

            <div className="opportunity-rubric-heading">
              <h3>Score the opportunity</h3>
              <p>Rate each factor from 1 to 5. Be conservative where evidence is weak.</p>
            </div>
            <RatingField id="opportunity-fit" label="Strategic fit" help="How well does it match the user's goal and capabilities? (25%)" value={form.strategicFit} onChange={(value) => updateForm("strategicFit", value)} />
            <RatingField id="opportunity-value" label="Potential value" help="How meaningful could the upside be if the thesis is true? (25%)" value={form.potentialValue} onChange={(value) => updateForm("potentialValue", value)} />
            <RatingField id="opportunity-urgency" label="Timing" help="Is there a real reason to act soon? (15%)" value={form.urgency} onChange={(value) => updateForm("urgency", value)} />
            <RatingField id="opportunity-evidence" label="Evidence strength" help="How strong is the evidence behind the main claim? (20%)" value={form.evidenceStrength} onChange={(value) => updateForm("evidenceStrength", value)} />
            <RatingField id="opportunity-effort" label="Effort to test or deliver" help="Estimate the work required. Lower effort receives a higher score (15%)." value={form.effort} onChange={(value) => updateForm("effort", value)} />
            {error && <p className="field-error opportunity-error" role="alert">{error}</p>}
            <button className="button" type="submit">Score and add opportunity</button>
          </form>
        </section>

        <section className="opportunity-results" aria-labelledby="ranked-opportunities-heading">
          <div className="section-heading opportunity-results-heading">
            <div>
              <p className="eyebrow">Step 2 · Prioritize</p>
              <h2 id="ranked-opportunities-heading">Opportunity radar</h2>
              <p>Highest score first. Check evidence before committing.</p>
            </div>
          </div>

          {!storageReady && <div className="empty-state"><p>Loading opportunities saved in this browser…</p></div>}
          {storageReady && ranked.length === 0 && (
            <div className="empty-state opportunity-empty">
              <h3>Your radar starts here</h3>
              <p>Add an opportunity on the left. Zavqera will score it against the same transparent rubric as every other candidate.</p>
            </div>
          )}

          {storageReady && ranked.length > 0 && (
            <div className="opportunity-list">
              {ranked.map(({ opportunity, score }, index) => {
                const priority = opportunityPriority(score);
                return (
                  <article className="card opportunity-card" key={opportunity.id}>
                    <div className="opportunity-card-top">
                      <span className="opportunity-rank">#{index + 1}</span>
                      <span className={`opportunity-priority opportunity-priority-${priority.toLowerCase()}`}>{priority === "HIGH_SCORE" ? "High score · verify evidence" : priority === "VALIDATE" ? "Validate first" : "Low priority · keep on radar"}</span>
                    </div>
                    <div className="opportunity-score-row">
                      <div>
                        <h3>{opportunity.title}</h3>
                        {opportunity.target && <p className="opportunity-target">For: {opportunity.target}</p>}
                      </div>
                      <div className="opportunity-score" aria-label={`Priority score ${score} out of 100`}>
                        <strong>{score}</strong><span>/100</span>
                      </div>
                    </div>
                    <p className="opportunity-thesis">{opportunity.thesis}</p>
                    <p className="opportunity-reason">{priorityDescription(priority)}</p>
                    <div className="opportunity-factor-list" aria-label="Scoring factors">
                      <span>Fit <b>{opportunity.strategicFit}/5</b></span>
                      <span>Value <b>{opportunity.potentialValue}/5</b></span>
                      <span>Timing <b>{opportunity.urgency}/5</b></span>
                      <span>Evidence <b>{opportunity.evidenceStrength}/5</b></span>
                      <span>Effort <b>{opportunity.effort}/5</b></span>
                    </div>
                    <OpportunityEvidencePanel
                      opportunity={opportunity}
                      onAddEvidence={(item) => setOpportunities((current) => current.map((candidate) =>
                        candidate.id === opportunity.id
                          ? { ...candidate, evidenceItems: [...candidate.evidenceItems, item] }
                          : candidate
                      ))}
                      onRemoveEvidence={(itemId) => setOpportunities((current) => current.map((candidate) =>
                        candidate.id === opportunity.id
                          ? { ...candidate, evidenceItems: candidate.evidenceItems.filter((item) => item.id !== itemId) }
                          : candidate
                      ))}
                    />
                    <div className="opportunity-card-actions">
                      <Link className="button button-small" href={missionHref(opportunity)}>Turn into Mission</Link>
                      <button className="button button-quiet button-small" type="button" onClick={() => setOpportunities((current) => current.filter((item) => item.id !== opportunity.id))} aria-label={`Remove ${opportunity.title}`}>Remove</button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="opportunity-method" aria-labelledby="opportunity-method-heading">
        <h2 id="opportunity-method-heading">How the score works</h2>
        <p><strong>Priority =</strong> 25% strategic fit + 25% potential value + 15% timing + 20% evidence strength + 15% execution ease. Ratings are 1–5; execution ease is the inverse of effort.</p>
        <div className="opportunity-thresholds">
          <span><b>80–100</b> Strong candidate — confirm evidence and take a bounded next step.</span>
          <span><b>60–79</b> Validate — test the weakest assumption first.</span>
          <span><b>20–59</b> Keep on radar — improve evidence or reduce effort.</span>
        </div>
        <p className="opportunity-storage-note">Privacy and scope: opportunities are saved only in this browser on this device. They are not synced to your account or database. This first version prioritizes opportunities you enter; live discovery, automatic source verification, recurring monitoring, and outcome-based learning are not connected yet.</p>
      </section>
    </div>
  );
}
