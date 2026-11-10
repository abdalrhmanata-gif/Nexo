"use client";

import Link from "next/link";
import { LocalizedText, useTranslate, fill } from "./localized-text";
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";
import { MAX_OPPORTUNITY_BACKUP_BYTES, createOpportunityBackup, mergeOpportunityBackup, parseOpportunityBackup, type OpportunityBackup } from "../lib/opportunity-portability.mjs";
import { opportunityPriority, priorityDescription, scoreOpportunity } from "../lib/opportunity-intelligence.mjs";
import { isOpportunityEvidenceItem, type OpportunityEvidenceItem } from "../lib/evidence-ledger.mjs";
import { OpportunityEvidencePanel } from "./opportunity-evidence-panel";
import { OpportunityAnalysisPanel } from "./opportunity-analysis-panel";

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

// The draft this builds is not a label: the person reads it, edits it, and
// saves it as their own mission. So it has to be written in their language at
// the moment it is generated, not translated later — by then it is their text,
// not ours. The translator is passed in because this is a plain function and
// hooks only run inside components.
function missionHref(opportunity: Opportunity, t: (en: string) => string): string {
  const score = scoreOpportunity(opportunity);
  const priority = opportunityPriority(score);
  const priorityLabel = priority === "HIGH_SCORE"
    ? t("high score; evidence review required")
    : priority === "VALIDATE" ? t("validate") : t("hold");
  const sourceNote = opportunity.evidenceUrl
    ? fill(t("Original source reference provided by the user (not independently verified): {url}"), { url: opportunity.evidenceUrl })
    : t("No original source reference has been attached.");
  const evidenceNotes = opportunity.evidenceItems.slice(0, 2).map((item) =>
    fill(t("[{stance}] {title} — {url}. User-recorded observation: {observation}"), {
      stance: t(item.stance.toUpperCase()),
      title: item.title,
      url: item.url,
      observation: item.observation.slice(0, 140),
    })
  ).join("\n");
  const ledgerNote = opportunity.evidenceItems.length
    ? fill(t("User-recorded evidence notes (not independently verified):\n{notes}"), { notes: evidenceNotes })
    : t("No reviewed evidence notes are recorded yet. Search public sources and test assumptions before deciding.");
  const params = new URLSearchParams({
    fromOpportunity: "1",
    name: fill(t("Evaluate: {title}"), { title: opportunity.title }).slice(0, 90),
    intent: [
      fill(t("Assess whether this opportunity is worth pursuing for {audience}."), {
        audience: opportunity.target || t("the intended audience"),
      }),
      fill(t("Opportunity thesis: {thesis}"), { thesis: opportunity.thesis }),
      fill(t("Current rule-based priority: {score}/100 ({label}). This is a prioritization aid, not a forecast."), {
        score,
        label: priorityLabel,
      }),
      sourceNote,
      ledgerNote,
    ].join("\n\n"),
    criteria: [
      t("Assess the source and verify the key claims"),
      t("Test the riskiest assumption with a low-cost experiment"),
      t("Estimate likely value, effort, and important risks"),
      t("Record a clear pursue, validate, defer, or reject decision"),
    ].join("\n"),
    actions: [
      t("Review the opportunity thesis and available evidence"),
      t("Identify the riskiest unproven assumption"),
      t("Design the smallest useful validation test"),
      t("Record evidence, decision, and next action"),
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
  // The label and help arrive as English source text from the call site, the
  // same way LocalizedText takes `en`. Translating here means a new factor is
  // translated by construction rather than by remembering.
  const t = useTranslate();
  return (
    <div className="field">
      <label htmlFor={id}>{t(label)}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="1"><LocalizedText en="1 — Very low" /></option>
        <option value="2"><LocalizedText en="2 — Low" /></option>
        <option value="3"><LocalizedText en="3 — Medium" /></option>
        <option value="4"><LocalizedText en="4 — High" /></option>
        <option value="5"><LocalizedText en="5 — Very high" /></option>
      </select>
      <small>{t(help)}</small>
    </div>
  );
}

export function OpportunityIntelligence() {
  const t = useTranslate();
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [form, setForm] = useState<OpportunityForm>(EMPTY_FORM);
  const [storageReady, setStorageReady] = useState(false);
  const [isOpportunityFormOpen, setIsOpportunityFormOpen] = useState(true);
  const [error, setError] = useState("");
  const [opportunityQuery, setOpportunityQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | "HIGH_SCORE" | "VALIDATE" | "HOLD">("ALL");
  const backupInputRef = useRef<HTMLInputElement>(null);
  const [backupPreview, setBackupPreview] = useState<OpportunityBackup | null>(null);
  const [backupFileName, setBackupFileName] = useState("");
  const [backupError, setBackupError] = useState("");
  const [backupNotice, setBackupNotice] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);

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
      setError(t("Browser storage is unavailable. Export or copy important details before leaving this page."));
    }
  }, [opportunities, storageReady]);

  useEffect(() => {
    if (storageReady) setIsOpportunityFormOpen(opportunities.length === 0);
  }, [storageReady, opportunities.length]);

  const ranked = useMemo(
    () => opportunities
      .map((opportunity) => ({ opportunity, score: scoreOpportunity(opportunity) }))
      .sort((a, b) => b.score - a.score || b.opportunity.createdAt - a.opportunity.createdAt),
    [opportunities],
  );

  const visibleRanked = useMemo(() => {
    const query = opportunityQuery.trim().toLocaleLowerCase();
    return ranked.filter(({ opportunity, score }) => {
      const matchesQuery = !query || [opportunity.title, opportunity.target, opportunity.thesis]
        .some((value) => value.toLocaleLowerCase().includes(query));
      const matchesPriority = priorityFilter === "ALL" || opportunityPriority(score) === priorityFilter;
      return matchesQuery && matchesPriority;
    });
  }, [ranked, opportunityQuery, priorityFilter]);

  const highScoreWithEvidence = ranked.filter(
    ({ opportunity, score }) => score >= 80 && opportunity.evidenceItems.length > 0,
  ).length;
  const missingEvidenceReview = ranked.filter(({ opportunity }) => opportunity.evidenceItems.length === 0).length;

  function exportBackup() {
    setBackupError("");
    setBackupNotice("");
    try {
      const backup = createOpportunityBackup(opportunities);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `zavqera-opportunities-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setBackupNotice(fill(t("Backup exported: {count} opportunities and {notes} evidence notes. Store the file securely; it contains the details you recorded."), { count: backup.opportunityCount, notes: backup.evidenceCount }));
    } catch (cause) {
      setBackupError(cause instanceof Error ? cause.message : t("The backup could not be exported."));
    }
  }

  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    setBackupError("");
    setBackupNotice("");
    setBackupPreview(null);
    setBackupFileName("");
    if (!file) return;
    if (file.size > MAX_OPPORTUNITY_BACKUP_BYTES) {
      setBackupError(t("This file is larger than 2 MB. Nothing was imported."));
      input.value = "";
      return;
    }
    setBackupBusy(true);
    try {
      const parsed = parseOpportunityBackup(await file.text());
      setBackupPreview(parsed);
      setBackupFileName(file.name);
    } catch (cause) {
      setBackupError(cause instanceof Error ? cause.message : t("The backup could not be read."));
      input.value = "";
    } finally {
      setBackupBusy(false);
    }
  }

  function importBackup() {
    if (!backupPreview) return;
    const merge = mergeOpportunityBackup(opportunities, backupPreview);

    if (merge.addedCount > 0) {
      setOpportunities((current) => mergeOpportunityBackup(current, backupPreview).opportunities);
    }
    setBackupNotice(merge.addedCount
      ? fill(t("Imported {count} opportunities with {notes} evidence notes. {skipped} existing record(s) with matching IDs were skipped; no existing records were overwritten."), { count: merge.addedCount, notes: merge.evidenceCount, skipped: merge.skippedCount })
      : t("Nothing was imported because every opportunity ID already exists. Your current records were left unchanged."));
    setBackupPreview(null);
    setBackupFileName("");
    if (backupInputRef.current) backupInputRef.current.value = "";
  }
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
      setError(t("Add an opportunity name and a concise explanation of why it may matter."));
      return;
    }
    if (evidenceUrl && !isHttpUrl(evidenceUrl)) {
      setError(t("Use a full public http:// or https:// source URL, or leave the field blank."));
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
        <div className="opportunity-title-row">
          <span className="opportunity-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 19V12M10 19V5M16 19V9M22 19V3" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="eyebrow"><LocalizedText en="Opportunity Intelligence" /> <span className="opportunity-early-access"><LocalizedText en="Early access" /></span></p>
            <h1 className="detail-title"><LocalizedText en="Find the next move worth making." /></h1>
          </div>
        </div>
        <p className="detail-intent">
          <LocalizedText en="Compare opportunities, challenge assumptions, and turn the strongest candidate into a governed Mission." />
        </p>
        <div className="opportunity-hero-bottom">
          <div className="opportunity-hero-note">
            <span className="opportunity-note-icon" aria-hidden="true">✓</span>
            <div><strong><LocalizedText en="Decision support, not false certainty." /></strong><span> <LocalizedText en="Scores explain your inputs; they are not market forecasts or a promise of revenue." /></span></div>
          </div>
          <button
            className="button opportunity-hero-cta"
            type="button"
            aria-expanded={isOpportunityFormOpen}
            aria-controls="add-opportunity-card"
            onClick={() => setIsOpportunityFormOpen((open) => !open)}
          >
            <span aria-hidden="true">{isOpportunityFormOpen ? "−" : "＋"}</span>
            {isOpportunityFormOpen ? t("Hide form") : t("Add opportunity")}
          </button>
        </div>
      </div>

      <section className="opportunity-portability" aria-label={t("Opportunity data backup")}>
        <div className="opportunity-portability-copy">
          <span className="opportunity-portability-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><path d="M12 16V4M7 9l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <div>
            <strong><LocalizedText en="Keep your opportunity data portable" /></strong>
            <p><LocalizedText en="Export your opportunities and evidence notes to a backup file, or merge a backup from another device. Data stays in this browser unless you move it yourself." /></p>
          </div>
        </div>
        <div className="opportunity-portability-actions">
          <button className="button button-small" type="button" onClick={exportBackup} disabled={!storageReady || opportunities.length === 0} title={opportunities.length === 0 ? t("Add an opportunity before exporting a backup") : t("Download your opportunity data")}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m-5-5 5 5 5-5M4 20h16" /></svg>
            <LocalizedText en="Export backup" />
          </button>
          <label className="button button-quiet button-small opportunity-import-label" htmlFor="opportunity-backup-file">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" /></svg>
            <LocalizedText en="Choose backup" />
          </label>
          <input ref={backupInputRef} id="opportunity-backup-file" className="visually-hidden" type="file" accept=".json,application/json" aria-label={t("Choose a Zavqera opportunity backup file")} onChange={selectBackup} disabled={!storageReady || backupBusy} />
        </div>
        {backupBusy && <p className="opportunity-backup-status" role="status"><LocalizedText en="Checking backup file…" /></p>}
        {backupPreview && (
          <div className="opportunity-backup-preview">
            <div>
              <strong>{fill(t("Backup ready: {file}"), { file: backupFileName })}</strong>
              <p>{fill(t("{count} opportunities · {notes} evidence notes. Exported {date}."), { count: backupPreview.opportunityCount, notes: backupPreview.evidenceCount, date: backupPreview.exportedAt.slice(0, 10) })}</p>
              <small><LocalizedText en="Existing records with matching IDs will be skipped. Nothing currently saved will be overwritten." /></small>
            </div>
            <div className="opportunity-backup-preview-actions">
              <button className="button button-small" type="button" onClick={importBackup} disabled={backupBusy}><LocalizedText en="Import and merge" /></button>
              <button className="button button-quiet button-small" type="button" onClick={() => { setBackupPreview(null); setBackupFileName(""); setBackupError(""); if (backupInputRef.current) backupInputRef.current.value = ""; }}><LocalizedText en="Cancel" /></button>
            </div>
          </div>
        )}
        {backupError && <p className="field-error opportunity-backup-status" role="alert">{backupError}</p>}
        {backupNotice && <p className="success-state opportunity-backup-status" role="status">{backupNotice}</p>}
      </section>

      <section className="opportunity-metrics" aria-label={t("Opportunity overview")}>
        <div className="opportunity-metric">
          <span className="opportunity-metric-icon opportunity-icon-tracked" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m12 3 8 4.5-8 4.5-8-4.5L12 3Z M4 12l8 4.5 8-4.5 M4 16.5l8 4.5 8-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg></span>
          <div className="opportunity-metric-copy"><strong>{opportunities.length}</strong><span><LocalizedText en="Opportunities tracked" /></span></div>
        </div>
        <div className="opportunity-metric">
          <span className="opportunity-metric-icon opportunity-icon-strong" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="m12 3 2.6 5.3 5.9.9-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.9L12 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg></span>
          <div className="opportunity-metric-copy"><strong>{highScoreWithEvidence}</strong><span><LocalizedText en="Strong candidates" /></span><small><LocalizedText en="High score + evidence notes" /></small></div>
        </div>
        <div className="opportunity-metric">
          <span className="opportunity-metric-icon opportunity-icon-evidence" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" /><path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M10.5 7.5v3M10.5 13.5h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></span>
          <div className="opportunity-metric-copy"><strong>{missingEvidenceReview}</strong><span><LocalizedText en="Need evidence review" /></span><small><LocalizedText en="Start by validating assumptions" /></small></div>
        </div>
      </section>

      <div className={`opportunity-layout ${isOpportunityFormOpen ? "opportunity-layout--form-open" : "opportunity-layout--form-collapsed"}`}>
        <section id="add-opportunity-card" className="card opportunity-form-card" aria-labelledby="add-opportunity-heading" hidden={!isOpportunityFormOpen}>
          <p className="eyebrow"><LocalizedText en="Step 1 · Capture" /></p>
          <h2 id="add-opportunity-heading"><LocalizedText en="Add an opportunity" /></h2>
          <p className="opportunity-muted"><LocalizedText en="Write down the opportunity and the assumptions behind it. Start with a hypothesis; evidence can be added later." /></p>

          <form id="add-opportunity-form" className="form-grid opportunity-form" onSubmit={addOpportunity}>
            <div className="field">
              <label htmlFor="opportunity-title"><LocalizedText en="Opportunity name" /></label>
              <input id="opportunity-title" value={form.title} maxLength={100} onChange={(event) => updateForm("title", event.target.value)} placeholder={t("e.g. Reach an underserved customer segment")} required />
            </div>
            <div className="field">
              <label htmlFor="opportunity-target"><LocalizedText en="Who could benefit?" /> <span className="field-optional"><LocalizedText en="optional" /></span></label>
              <input id="opportunity-target" value={form.target} maxLength={160} onChange={(event) => updateForm("target", event.target.value)} placeholder={t("Customer, user group, market, or internal team")} />
            </div>
            <div className="field">
              <label htmlFor="opportunity-thesis"><LocalizedText en="Opportunity thesis" /></label>
              <textarea id="opportunity-thesis" value={form.thesis} maxLength={1200} onChange={(event) => updateForm("thesis", event.target.value)} placeholder={t("What is the unmet need, signal, or possible advantage? Why might it matter?")} required />
              <small><LocalizedText en="Separate what you know from what you suspect. Do not enter confidential or sensitive personal information." /></small>
            </div>
            <div className="field">
              <label htmlFor="opportunity-source"><LocalizedText en="Public evidence source" /> <span className="field-optional"><LocalizedText en="optional" /></span></label>
              <input id="opportunity-source" inputMode="url" type="url" value={form.evidenceUrl} maxLength={500} onChange={(event) => updateForm("evidenceUrl", event.target.value)} placeholder="https://…" />
              <small><LocalizedText en="A reference you provide. This early version does not fetch, crawl, or independently verify the URL." /></small>
            </div>

            <div className="opportunity-rubric-heading">
              <h3><LocalizedText en="Score the opportunity" /></h3>
              <p><LocalizedText en="Rate each factor from 1 to 5. Be conservative where evidence is weak." /></p>
            </div>
            <RatingField id="opportunity-fit" label="Strategic fit" help="How well does it match the user's goal and capabilities? (25%)" value={form.strategicFit} onChange={(value) => updateForm("strategicFit", value)} />
            <RatingField id="opportunity-value" label="Potential value" help="How meaningful could the upside be if the thesis is true? (25%)" value={form.potentialValue} onChange={(value) => updateForm("potentialValue", value)} />
            <RatingField id="opportunity-urgency" label="Timing" help="Is there a real reason to act soon? (15%)" value={form.urgency} onChange={(value) => updateForm("urgency", value)} />
            <RatingField id="opportunity-evidence" label="Evidence strength" help="How strong is the evidence behind the main claim? (20%)" value={form.evidenceStrength} onChange={(value) => updateForm("evidenceStrength", value)} />
            <RatingField id="opportunity-effort" label="Effort to test or deliver" help="Estimate the work required. Lower effort receives a higher score (15%)." value={form.effort} onChange={(value) => updateForm("effort", value)} />
            {error && <p className="field-error opportunity-error" role="alert">{error}</p>}
            <button className="button" type="submit"><LocalizedText en="Score and add opportunity" /></button>
          </form>
        </section>

        <section className="opportunity-results" aria-labelledby="ranked-opportunities-heading">
          <div className="section-heading opportunity-results-heading">
            <div>
              <p className="eyebrow"><LocalizedText en="Step 2 · Prioritize" /></p>
              <h2 id="ranked-opportunities-heading"><LocalizedText en="Opportunity radar" /></h2>
              <p><LocalizedText en="Ranked by transparent criteria. Evidence still needs human review." /></p>
            </div>
            <span className="opportunity-result-count">{ranked.length} {t(ranked.length === 1 ? "opportunity" : "opportunities")}</span>
          </div>

          {storageReady && ranked.length > 0 && (
            <div className="opportunity-toolbar">
              <label className="opportunity-search">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8" /><path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                <span className="visually-hidden"><LocalizedText en="Search opportunities" /></span>
                <input type="search" value={opportunityQuery} onChange={(event) => setOpportunityQuery(event.target.value)} placeholder={t("Search opportunities…")} aria-label={t("Search opportunities")} />
              </label>
              <div className="opportunity-filter-group" role="group" aria-label={t("Filter opportunities by priority")}>
                {([
                  { value: "ALL", label: "All" },
                  { value: "HIGH_SCORE", label: "Strong" },
                  { value: "VALIDATE", label: "Validate" },
                  { value: "HOLD", label: "On hold" },
                ] as const).map((filter) => (
                  <button key={filter.value} type="button" className={`opportunity-filter${priorityFilter === filter.value ? " is-active" : ""}`} aria-pressed={priorityFilter === filter.value} onClick={() => setPriorityFilter(filter.value)}>
                    {t(filter.label)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!storageReady && <div className="empty-state"><p><LocalizedText en="Loading opportunities saved in this browser…" /></p></div>}
          {storageReady && ranked.length === 0 && (
            <div className="empty-state opportunity-empty">
              <h3><LocalizedText en="Your radar starts here" /></h3>
              <p><LocalizedText en="Add your first opportunity to begin comparing options. The score is a guide to support your decision, not a market forecast." /></p>
            </div>
          )}

          {storageReady && ranked.length > 0 && visibleRanked.length === 0 && (
            <div className="empty-state opportunity-empty">
              <h3><LocalizedText en="No matching opportunities" /></h3>
              <p><LocalizedText en="Try another search or choose a different priority filter." /></p>
              <button className="button button-quiet button-small" type="button" onClick={() => { setOpportunityQuery(""); setPriorityFilter("ALL"); }}><LocalizedText en="Clear filters" /></button>
            </div>
          )}

          {storageReady && visibleRanked.length > 0 && (
            <div className="opportunity-list">
              {visibleRanked.map(({ opportunity, score }, index) => {
                const priority = opportunityPriority(score);
                return (
                  <article className="card opportunity-card" key={opportunity.id}>
                    <div className="opportunity-card-top">
                      <span className="opportunity-rank">#{index + 1}</span>
                      <span className={`opportunity-priority opportunity-priority-${priority.toLowerCase()}`}>{priority === "HIGH_SCORE" ? t("High score · verify evidence") : priority === "VALIDATE" ? t("Validate first") : t("Low priority · keep on radar")}</span>
                    </div>
                    <div className="opportunity-score-row">
                      <div>
                        <h3>{opportunity.title}</h3>
                        {opportunity.target && <p className="opportunity-target">{fill(t("For: {audience}"), { audience: opportunity.target })}</p>}
                      </div>
                      <div className="opportunity-score" style={{ "--opportunity-score": `${score}%` } as CSSProperties} aria-label={fill(t("Priority score {score} out of 100"), { score })}>
                        <strong>{score}</strong><span>/100</span>
                      </div>
                    </div>
                    <p className="opportunity-thesis">{opportunity.thesis}</p>
                    <p className="opportunity-reason">{t(priorityDescription(priority))}</p>
                    <div className="opportunity-factor-list" aria-label={t("Scoring factors")}>
                      <span><LocalizedText en="Fit" /> <b>{opportunity.strategicFit}/5</b></span>
                      <span><LocalizedText en="Value" /> <b>{opportunity.potentialValue}/5</b></span>
                      <span><LocalizedText en="Timing" /> <b>{opportunity.urgency}/5</b></span>
                      <span><LocalizedText en="Evidence" /> <b>{opportunity.evidenceStrength}/5</b></span>
                      <span><LocalizedText en="Effort" /> <b>{opportunity.effort}/5</b></span>
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
                    <OpportunityAnalysisPanel opportunity={opportunity} score={score} />
                    <div className="opportunity-card-actions">
                      <Link className="button button-small" href={missionHref(opportunity, t)}><LocalizedText en="Turn into Mission" /></Link>
                      <button className="button button-quiet button-small" type="button" onClick={() => setOpportunities((current) => current.filter((item) => item.id !== opportunity.id))} aria-label={fill(t("Remove {opportunity}"), { opportunity: opportunity.title })}><LocalizedText en="Remove" /></button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <section className="opportunity-method" aria-labelledby="opportunity-method-heading">
        <h2 id="opportunity-method-heading"><LocalizedText en="How the score works" /></h2>
        <p><strong><LocalizedText en="Priority =" /></strong> <LocalizedText en="25% strategic fit + 25% potential value + 15% timing + 20% evidence strength + 15% execution ease. Ratings are 1–5; execution ease is the inverse of effort." /></p>
        <div className="opportunity-thresholds">
          <span><b>80–100</b> <LocalizedText en="Strong candidate — confirm evidence and take a bounded next step." /></span>
          <span><b>60–79</b> <LocalizedText en="Validate — test the weakest assumption first." /></span>
          <span><b>20–59</b> <LocalizedText en="Keep on radar — improve evidence or reduce effort." /></span>
        </div>
        <p className="opportunity-storage-note"><LocalizedText en="Privacy and portability: opportunities and evidence notes are stored only in this browser. Export a backup to move them to another device; the file may contain sensitive business information, so store it securely. Import merges records and skips matching IDs without overwriting existing data. Cloud sync, live discovery, automatic source verification, recurring monitoring, and outcome-based learning are not connected yet." /></p>
      </section>
    </div>
  );
}
