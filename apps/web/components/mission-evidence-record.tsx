import { LocalizedText } from "./localized-text";
import { LocalizedMissionDateTime } from "./localized-mission-activity";
import { isHttpSourceUrl } from "../lib/evidence-ledger.mjs";
import type { MissionVerification } from "../lib/view-models";

const SOURCE_LABELS: Record<string, string> = {
  official: "Official source",
  publication: "Research or publication",
  internal_document: "Internal document",
  measurement: "Measurement",
  customer: "Customer feedback",
  conversation: "Conversation or interview",
  other: "Other",
};
const STANCE_LABELS: Record<string, string> = {
  supports: "Supports",
  challenges: "Challenges",
  context: "Context only",
};

export function MissionEvidenceRecord({ verification }: { verification: MissionVerification }) {
  const criteria = typeof verification.criteria?.summary === "string" ? verification.criteria.summary : "";
  const evidence = verification.evidence ?? {};
  const summary = typeof evidence.summary === "string" ? evidence.summary : "";
  const items = Array.isArray(evidence.items)
    ? evidence.items.filter((item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
      && typeof item.id === "string" && typeof item.title === "string" && typeof item.observation === "string")
    : [];
  if (!criteria && !summary && items.length === 0) return null;

  return <section className="mission-evidence-record" aria-label="Recorded verification evidence">
    <div className="mission-evidence-record-heading">
      <div><p className="eyebrow"><LocalizedText en="Evidence & decision record" /></p><strong><LocalizedText en="Reviewed evidence" /></strong></div>
      <span className={"mission-verification-state mission-verification-state-" + verification.status.toLowerCase()}><LocalizedText en={verification.status === "VERIFIED" ? "Verified" : "Failed verification"} /></span>
    </div>
    {criteria && <div className="mission-evidence-record-block"><span><LocalizedText en="Criteria checked" /></span><p>{criteria}</p></div>}
    {summary && <div className="mission-evidence-record-block"><span><LocalizedText en="Evidence summary" /></span><p>{summary}</p></div>}
    {items.length > 0 && <div className="mission-evidence-record-items">
      {items.map((item) => {
        const sourceType = typeof item.sourceType === "string" && SOURCE_LABELS[item.sourceType] ? item.sourceType : "other";
        const stance = typeof item.stance === "string" && STANCE_LABELS[item.stance] ? item.stance : "context";
        const referenceUrl = typeof item.referenceUrl === "string" ? item.referenceUrl : "";
        const publishedAt = typeof item.publishedAt === "string" ? item.publishedAt : "";
        return <article className="mission-evidence-record-item" key={item.id as string}>
          <div className="mission-evidence-record-item-heading">
            <strong>{item.title as string}</strong>
            <span className={"mission-evidence-stance mission-evidence-stance-" + stance}><LocalizedText en={STANCE_LABELS[stance]} /></span>
          </div>
          <p>{item.observation as string}</p>
          <div className="mission-evidence-record-meta">
            <span><LocalizedText en={SOURCE_LABELS[sourceType]} /></span>
            {publishedAt && <span><LocalizedText en="Published or observed" />: {publishedAt}</span>}
            {referenceUrl && isHttpSourceUrl(referenceUrl) && <a href={referenceUrl} target="_blank" rel="noopener noreferrer"><LocalizedText en="Open reference" /> ↗</a>}
          </div>
        </article>;
      })}
    </div>}
    <p className="mission-evidence-record-caveat"><LocalizedText en="These entries are user-reviewed records. Zavqera has not independently verified the referenced material." /></p>
    <small><LocalizedText en="Recorded" /> <LocalizedMissionDateTime value={verification.createdAt} /></small>
  </section>;
}
