"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { MissionVerification } from "../lib/view-models";
import {
  isHttpSourceUrl,
  MISSION_EVIDENCE_SOURCE_TYPES,
  MISSION_EVIDENCE_STANCES,
  type MissionEvidenceItem,
  type MissionEvidenceSourceType,
  type MissionEvidenceStance,
} from "../lib/evidence-ledger.mjs";
import { useUiTranslation } from "./localized-text";

type EvidenceDraft = MissionEvidenceItem;

function newEvidenceDraft(): EvidenceDraft {
  return {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : \`evidence-\${Date.now()}-\${Math.random().toString(36).slice(2, 10)}\`,
    title: "",
    observation: "",
    referenceUrl: "",
    sourceType: "other",
    stance: "supports",
    publishedAt: "",
  };
}

const SOURCE_LABELS: Record<MissionEvidenceSourceType, string> = {
  official: "Official source",
  publication: "Research or publication",
  internal_document: "Internal document",
  measurement: "Measurement",
  customer: "Customer feedback",
  conversation: "Conversation or interview",
  other: "Other",
};
const STANCE_LABELS: Record<MissionEvidenceStance, string> = {
  supports: "Supports",
  challenges: "Challenges",
  context: "Context only",
};

export function VerificationControls({ missionId, verification }: { missionId: string; verification?: MissionVerification }) {
  const router = useRouter();
  const t = useUiTranslation();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [criteria, setCriteria] = useState("");
  const [evidenceSummary, setEvidenceSummary] = useState("");
  const [evidenceItems, setEvidenceItems] = useState<EvidenceDraft[]>([newEvidenceDraft()]);
  const [confidence, setConfidence] = useState("1");
  const [outcomeSummary, setOutcomeSummary] = useState("");
  const [decision, setDecision] = useState<"PROCEED" | "STOP">("PROCEED");
  const [rationale, setRationale] = useState("");
  const [score, setScore] = useState("1");

  function updateEvidenceItem(id: string, patch: Partial<EvidenceDraft>) {
    setEvidenceItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setMessage("");
  }

  function addEvidenceItem() {
    setEvidenceItems((current) => current.length >= 8 ? current : [...current, newEvidenceDraft()]);
    setMessage("");
  }

  function removeEvidenceItem(id: string) {
    setEvidenceItems((current) => current.length <= 1 ? current : current.filter((item) => item.id !== id));
    setMessage("");
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const checkedCriteria = criteria.trim();
    const summary = evidenceSummary.trim();
    const sources = evidenceItems.filter((item) =>
      item.title.trim() || item.observation.trim() || item.referenceUrl.trim() || item.publishedAt.trim()
    );

    if (checkedCriteria.length < 12 || checkedCriteria.length > 2000) {
      setMessage(t("Describe the criteria you checked in 12 to 2,000 characters."));
      setBusy(false);
      return;
    }
    if (summary.length < 12 || summary.length > 2000) {
      setMessage(t("Add an evidence summary between 12 and 2,000 characters."));
      setBusy(false);
      return;
    }
    if (sources.length < 1 || sources.length > 8 || sources.some((item) => !item.title.trim() || !item.observation.trim())) {
      setMessage(t("Record between 1 and 8 complete evidence items. Each needs a title and an observation."));
      setBusy(false);
      return;
    }
    if (sources.some((item) => item.referenceUrl.trim() && !isHttpSourceUrl(item.referenceUrl.trim()))) {
      setMessage(t("Evidence references must use a public HTTP or HTTPS URL."));
      setBusy(false);
      return;
    }

    try {
      const response = await fetch(\`/api/missions/\${missionId}/verification\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "VERIFIED",
          criteria: { summary: checkedCriteria },
          evidence: { summary, items: sources },
          confidence: Number(confidence),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error ?? t("Verification failed."));
        return;
      }
      setMessage(t("Verification recorded. Refreshing mission state…"));
      router.refresh();
    } catch {
      setMessage(t("Verification could not be saved. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const checkedSummary = outcomeSummary.trim();
    const checkedRationale = rationale.trim();
    const checkedScore = Number(score);
    if (!checkedSummary || checkedSummary.length > 2000) {
      setMessage(t("Add an outcome summary of up to 2,000 characters."));
      setBusy(false);
      return;
    }
    if (checkedRationale.length < 12 || checkedRationale.length > 1200) {
      setMessage(t("Explain the decision in 12 to 1,200 characters."));
      setBusy(false);
      return;
    }
    if (!Number.isFinite(checkedScore) || checkedScore < 0 || checkedScore > 1) {
      setMessage(t("Success score must be between 0 and 1."));
      setBusy(false);
      return;
    }

    try {
      const status = decision === "PROCEED" ? "COMPLETED" : "FAILED";
      const response = await fetch(\`/api/missions/\${missionId}/outcome\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verificationId: verification?.id,
          result: { summary: checkedSummary, decision, rationale: checkedRationale },
          successScore: decision === "STOP" ? 0 : checkedScore,
          status,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error ?? t("Outcome could not be committed."));
        return;
      }
      setMessage(t("Human outcome decision recorded. Refreshing mission state…"));
      router.refresh();
    } catch {
      setMessage(t("Outcome could not be committed. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  if (verification?.status === "VERIFIED") return <div className="form-grid mission-decision-workspace">
    <form onSubmit={commit} className="mission-decision-form">
      <div className="mission-review-section-heading">
        <p className="eyebrow">{t("Human decision")}</p>
        <h3>{t("Choose the outcome")}</h3>
        <p>{t("The evidence has passed verification. Record what you decide should happen next and why.")}</p>
      </div>
      <div className="field">
        <label htmlFor="result">{t("Outcome summary")}</label>
        <textarea id="result" name="result" maxLength={2000} value={outcomeSummary} onChange={(event) => setOutcomeSummary(event.target.value)} required />
        <small>{t("Describe the result that was actually reached, not an intended future result.")}</small>
      </div>
      <div className="field">
        <label htmlFor="decision">{t("Outcome decision")}</label>
        <select id="decision" name="decision" value={decision} disabled={busy} onChange={(event) => { setDecision(event.target.value as "PROCEED" | "STOP"); setMessage(""); }}>
          <option value="PROCEED">{t("Proceed — record a successful outcome")}</option>
          <option value="STOP">{t("Stop — record an unsuccessful outcome")}</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="decision-rationale">{t("Decision rationale")}</label>
        <textarea id="decision-rationale" name="rationale" minLength={12} maxLength={1200} value={rationale} onChange={(event) => setRationale(event.target.value)} required />
        <small>{t("Explain the evidence and reasoning behind this human decision.")}</small>
      </div>
      <div className="field">
        <label htmlFor="score">{t("Success score")}</label>
        <input id="score" name="score" type="number" min="0" max="1" step="0.01" value={decision === "STOP" ? "0" : score} disabled={decision === "STOP" || busy} onChange={(event) => setScore(event.target.value)} />
      </div>
      <p className="mission-authority-caveat">{t("This records a human outcome decision. It does not approve an AI agent, grant authority, or authorise an external action.")}</p>
      <button className="button" type="submit" disabled={busy}>{busy ? t("Saving…") : t("Record human decision")}</button>
    </form>
    {message && <div className="field-error" role="alert">{message}</div>}
  </div>;

  return <div className="form-grid mission-evidence-workspace">
    <form onSubmit={verify} className="mission-verification-form">
      <div className="mission-review-section-heading">
        <p className="eyebrow">{t("Evidence review")}</p>
        <h3>{t("Record what you checked")}</h3>
        <p>{t("Keep the criteria, source observations and their relationship to the expected outcome together.")}</p>
      </div>
      <div className="field">
        <label htmlFor="verification-criteria">{t("Verification criteria")}</label>
        <textarea id="verification-criteria" name="criteria" minLength={12} maxLength={2000} value={criteria} onChange={(event) => setCriteria(event.target.value)} required />
        <small>{t("State the specific success criteria you checked.")}</small>
      </div>
      <div className="field">
        <label htmlFor="evidence-summary">{t("Evidence summary")}</label>
        <textarea id="evidence-summary" name="evidence" minLength={12} maxLength={2000} value={evidenceSummary} onChange={(event) => setEvidenceSummary(event.target.value)} required />
        <small>{t("Summarise what the collected evidence shows. Keep facts separate from your interpretation.")}</small>
      </div>

      <div className="mission-evidence-entry-list">
        <div className="mission-evidence-list-heading">
          <div><strong>{t("Evidence items")}</strong><p>{t("Add between 1 and 8 distinct observations. References are optional for internal records.")}</p></div>
          <span>{evidenceItems.length}/8</span>
        </div>
        {evidenceItems.map((item, index) => (
          <fieldset className="mission-evidence-entry" key={item.id}>
            <legend>{t("Evidence item")} {index + 1}</legend>
            <div className="field">
              <label htmlFor={\`evidence-title-\${item.id}\`}>{t("Evidence title")}</label>
              <input id={\`evidence-title-\${item.id}\`} maxLength={180} value={item.title} onChange={(event) => updateEvidenceItem(item.id, { title: event.target.value })} required />
            </div>
            <div className="field">
              <label htmlFor={\`evidence-observation-\${item.id}\`}>{t("What did you observe?")}</label>
              <textarea id={\`evidence-observation-\${item.id}\`} maxLength={1200} value={item.observation} onChange={(event) => updateEvidenceItem(item.id, { observation: event.target.value })} required />
            </div>
            <div className="mission-evidence-grid">
              <div className="field">
                <label htmlFor={\`evidence-source-type-\${item.id}\`}>{t("Source type")}</label>
                <select id={\`evidence-source-type-\${item.id}\`} value={item.sourceType} onChange={(event) => updateEvidenceItem(item.id, { sourceType: event.target.value as MissionEvidenceSourceType })}>
                  {MISSION_EVIDENCE_SOURCE_TYPES.map((type) => <option key={type} value={type}>{t(SOURCE_LABELS[type])}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={\`evidence-stance-\${item.id}\`}>{t("Effect on the outcome")}</label>
                <select id={\`evidence-stance-\${item.id}\`} value={item.stance} onChange={(event) => updateEvidenceItem(item.id, { stance: event.target.value as MissionEvidenceStance })}>
                  {MISSION_EVIDENCE_STANCES.map((stance) => <option key={stance} value={stance}>{t(STANCE_LABELS[stance])}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={\`evidence-reference-\${item.id}\`}>{t("Reference URL")} <span className="field-optional">{t("optional")}</span></label>
                <input id={\`evidence-reference-\${item.id}\`} type="url" inputMode="url" maxLength={500} value={item.referenceUrl} onChange={(event) => updateEvidenceItem(item.id, { referenceUrl: event.target.value })} placeholder="https://…" />
              </div>
              <div className="field">
                <label htmlFor={\`evidence-date-\${item.id}\`}>{t("Published or observed date")} <span className="field-optional">{t("optional")}</span></label>
                <input id={\`evidence-date-\${item.id}\`} type="date" value={item.publishedAt} onChange={(event) => updateEvidenceItem(item.id, { publishedAt: event.target.value })} />
              </div>
            </div>
            {evidenceItems.length > 1 && <button className="mission-evidence-remove" type="button" onClick={() => removeEvidenceItem(item.id)}>{t("Remove evidence item")}</button>}
          </fieldset>
        ))}
        <button className="button button-quiet button-small" type="button" onClick={addEvidenceItem} disabled={evidenceItems.length >= 8}>{t("Add another evidence item")}</button>
      </div>

      <div className="field">
        <label htmlFor="confidence">{t("Confidence")}</label>
        <input id="confidence" name="confidence" type="number" min="0" max="1" step="0.01" value={confidence} onChange={(event) => setConfidence(event.target.value)} />
      </div>
      <p className="mission-authority-caveat">{t("These records document your review. Zavqera does not independently verify the source, and this review does not grant AI authority or approve an external action.")}</p>
      <button className="button" type="submit" disabled={busy}>{busy ? t("Saving…") : t("Record evidence and verification")}</button>
    </form>
    {message && <div className="field-error" role="alert">{message}</div>}
  </div>;
}
