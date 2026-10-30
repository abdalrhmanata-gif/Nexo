"use client";

import { useState, type FormEvent } from "react";
import { useUiTranslation } from "./localized-text";
import {
  buildPublicSearchUrls,
  EVIDENCE_SOURCE_TYPES,
  EVIDENCE_STANCES,
  findDuplicateEvidence,
  isHttpSourceUrl,
  summariseEvidence,
  type EvidenceSourceType,
  type EvidenceStance,
  type OpportunityEvidenceItem,
} from "../lib/evidence-ledger.mjs";

type EvidenceOpportunity = {
  id: string;
  title: string;
  target: string;
  thesis: string;
  evidenceUrl: string;
  evidenceItems: OpportunityEvidenceItem[];
};

type Draft = {
  url: string;
  title: string;
  observation: string;
  stance: EvidenceStance;
  sourceType: EvidenceSourceType;
  sourceDate: string;
  reliability: string;
};

const EMPTY_DRAFT: Draft = {
  url: "",
  title: "",
  observation: "",
  stance: "supports",
  sourceType: "other",
  sourceDate: "",
  reliability: "3",
};

const STANCE_LABELS: Record<EvidenceStance, string> = {
  supports: "Supports the thesis",
  challenges: "Challenges the thesis",
  context: "Context only",
};

const SOURCE_LABELS: Record<EvidenceSourceType, string> = {
  official: "Official / primary",
  news: "News report",
  research: "Research / report",
  customer: "Customer signal",
  competitor: "Competitor signal",
  other: "Other public source",
};

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function OpportunityEvidencePanel({
  opportunity,
  onAddEvidence,
  onRemoveEvidence,
}: {
  opportunity: EvidenceOpportunity;
  onAddEvidence: (item: OpportunityEvidenceItem) => void;
  onRemoveEvidence: (itemId: string) => void;
}) {
  const t = useUiTranslation();
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const search = buildPublicSearchUrls(opportunity);
  const summary = summariseEvidence(opportunity.evidenceItems);
  const evidenceCount = opportunity.evidenceItems.length;

  function updateDraft<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setError("");
    setNotice("");
  }

  function recordEvidence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    const url = draft.url.trim();
    const title = draft.title.trim();
    const observation = draft.observation.trim();

    if (!isHttpSourceUrl(url)) {
      setError(t("Enter a valid public http:// or https:// source URL."));
      return;
    }
    if (!title || !observation) {
      setError(t("Add the source title and a concise note describing what the source actually says."));
      return;
    }
    if (findDuplicateEvidence(opportunity.evidenceItems, url, opportunity.evidenceUrl)) {
      setError(t("This source URL is already attached. Revisit the existing entry instead of counting it twice."));
      return;
    }

    const item: OpportunityEvidenceItem = {
      id: createId(),
      url,
      title: title.slice(0, 180),
      observation: observation.slice(0, 1200),
      stance: draft.stance,
      sourceType: draft.sourceType,
      sourceDate: draft.sourceDate,
      reliability: Math.max(1, Math.min(5, Number(draft.reliability) || 1)),
      checkedAt: new Date().toISOString(),
      addedAt: Date.now(),
    };
    onAddEvidence(item);
    setDraft(EMPTY_DRAFT);
    setExpanded(false);
    setNotice(t("Evidence note added. It records your review; Zavqera has not independently verified the source."));
  }

  return (
    <section className="evidence-ledger" aria-label={`${t("Evidence ledger")} · ${opportunity.title}`}>
      <div className="evidence-ledger-head">
        <div>
          <strong>{t("Evidence ledger")}</strong>
          <p>{evidenceCount} {t("reviewed notes")} · {summary.supports} {t("support")} · {summary.challenges} {t("counter-signal")}</p>
        </div>
        <button
          className="button button-quiet button-small"
          type="button"
          onClick={() => { setExpanded((current) => !current); setError(""); setNotice(""); }}
          aria-expanded={expanded}
        >
          {expanded ? t("Close research") : t("Research & add evidence")}
        </button>
      </div>

      {opportunity.evidenceUrl && (
        <div className="evidence-legacy">
          <span>{t("Original reference · not yet reviewed")}</span>
          {isHttpSourceUrl(opportunity.evidenceUrl) && (
            <a href={opportunity.evidenceUrl} target="_blank" rel="noopener noreferrer">{t("Open original source")}</a>
          )}
        </div>
      )}

      {evidenceCount > 0 && (
        <div className="evidence-items">
          {opportunity.evidenceItems.map((item) => (
            <details className="evidence-item" key={item.id}>
              <summary>
                <span className={`evidence-stance evidence-stance-${item.stance}`}>{t(STANCE_LABELS[item.stance])}</span>
                <strong>{item.title}</strong>
              </summary>
              <p className="evidence-observation">{item.observation}</p>
              <div className="evidence-item-meta">
                <span>{t(SOURCE_LABELS[item.sourceType])}</span>
                <span>{t("Reliability estimate:")} {item.reliability}/5</span>
                {item.sourceDate && <span>{t("Published:")} {item.sourceDate}</span>}
                <span>{t("Reviewed:")} {new Date(item.checkedAt).toLocaleDateString()}</span>
              </div>
              {isHttpSourceUrl(item.url) && (
                <p className="evidence-source-link"><a href={item.url} target="_blank" rel="noopener noreferrer">{t("Open cited source")} ↗</a></p>
              )}
              <button
                className="evidence-remove"
                type="button"
                onClick={() => onRemoveEvidence(item.id)}
                aria-label={`${t("Remove note")}: ${item.title}`}
              >
                {t("Remove note")}
              </button>
            </details>
          ))}
        </div>
      )}

      {evidenceCount > 0 && (
        <p className="evidence-caveat">
          {t("These are user-recorded interpretations, not independently verified findings. Mixed signals should trigger more research, not an automatic conclusion.")}
        </p>
      )}
      {notice && <p className="success-state evidence-notice" role="status">{notice}</p>}

      {expanded && (
        <div className="evidence-research-workspace">
          <div className="evidence-search-actions">
            <a className="button button-small" href={search.webUrl} target="_blank" rel="noopener noreferrer">{t("Search the web")} ↗</a>
            <a className="button button-small button-quiet" href={search.newsUrl} target="_blank" rel="noopener noreferrer">{t("Search news")} ↗</a>
          </div>
          <p className="evidence-search-note">
            {t("Searches open public results in a new tab. No crawler or search API runs inside Zavqera. Read the source yourself, then record the specific observation and whether it supports or challenges the thesis.")}
          </p>
          <p className="evidence-search-privacy">
            {t("If you open a search, Google receives this query text:")} <code>{search.query || "(empty query)"}</code>. Keep confidential business information and personal data out of the query.
          </p>
          <form className="form-grid evidence-form" onSubmit={recordEvidence}>
            <div className="field">
              <label htmlFor={`evidence-url-${opportunity.id}`}>{t("Source URL")}</label>
              <input id={`evidence-url-${opportunity.id}`} type="url" inputMode="url" maxLength={500} value={draft.url} onChange={(event) => updateDraft("url", event.target.value)} placeholder="https://…" required />
            </div>
            <div className="field">
              <label htmlFor={`evidence-title-${opportunity.id}`}>{t("Source title")}</label>
              <input id={`evidence-title-${opportunity.id}`} maxLength={180} value={draft.title} onChange={(event) => updateDraft("title", event.target.value)} placeholder={t("Report, article, announcement, or customer signal")} required />
            </div>
            <div className="field">
              <label htmlFor={`evidence-observation-${opportunity.id}`}>{t("What does the source actually say?")}</label>
              <textarea id={`evidence-observation-${opportunity.id}`} maxLength={1200} value={draft.observation} onChange={(event) => updateDraft("observation", event.target.value)} placeholder={t("Summarise the relevant claim in your own words. Separate facts from your interpretation.")} required />
              <small>{t("Record the specific observation, not a conclusion the source does not support. Avoid confidential or sensitive personal information.")}</small>
            </div>
            <div className="evidence-form-grid">
              <div className="field">
                <label htmlFor={`evidence-stance-${opportunity.id}`}>{t("Effect on the thesis")}</label>
                <select id={`evidence-stance-${opportunity.id}`} value={draft.stance} onChange={(event) => updateDraft("stance", event.target.value as EvidenceStance)}>
                  {EVIDENCE_STANCES.map((stance) => <option value={stance} key={stance}>{t(STANCE_LABELS[stance])}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`evidence-type-${opportunity.id}`}>{t("Source type")}</label>
                <select id={`evidence-type-${opportunity.id}`} value={draft.sourceType} onChange={(event) => updateDraft("sourceType", event.target.value as EvidenceSourceType)}>
                  {EVIDENCE_SOURCE_TYPES.map((type) => <option value={type} key={type}>{t(SOURCE_LABELS[type])}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`evidence-date-${opportunity.id}`}>{t("Published date")} <span className="field-optional">{t("optional")}</span></label>
                <input id={`evidence-date-${opportunity.id}`} type="date" value={draft.sourceDate} onChange={(event) => updateDraft("sourceDate", event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor={`evidence-reliability-${opportunity.id}`}>{t("Your reliability estimate")}</label>
                <select id={`evidence-reliability-${opportunity.id}`} value={draft.reliability} onChange={(event) => updateDraft("reliability", event.target.value)}>
                  <option value="1">1 — {t("Very low")}</option>
                  <option value="2">2 — {t("Low")}</option>
                  <option value="3">3 — {t("Moderate")}</option>
                  <option value="4">4 — {t("High")}</option>
                  <option value="5">5 — {t("Very high")}</option>
                </select>
              </div>
            </div>
            {error && <p className="field-error evidence-error" role="alert">{error}</p>}
            <button className="button" type="submit">{t("Save evidence note")}</button>
          </form>
        </div>
      )}
    </section>
  );
}
