import Link from "next/link";
import type { Mission } from "../lib/view-models";
import { nextStepFor } from "../lib/mission-content.mjs";
import { LocalizedText, useUiTranslation } from "./localized-text";
import { StatusPill } from "./shell";

function translateNextStepDetail(detail: string, t: (source: string) => string) {
  const dueMarker = " — due ";
  const dueIndex = detail.indexOf(dueMarker);
  if (dueIndex >= 0) return `${detail.slice(0, dueIndex)} — ${t("due")} ${detail.slice(dueIndex + dueMarker.length)}`;
  const checkBackMarker = " — check back ";
  const checkBackIndex = detail.indexOf(checkBackMarker);
  if (checkBackIndex >= 0) return `${detail.slice(0, checkBackIndex)} — ${t("check back")} ${detail.slice(checkBackIndex + checkBackMarker.length)}`;
  return t(detail);
}

export function MissionCard({ mission }: { mission: Mission }) {
  const next = nextStepFor(mission);
  const t = useUiTranslation();
  return (
    <article className="card mission-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow"><LocalizedText en="Mission" /></p>
          <h3><Link href={`/app/missions/${mission.id}`}>{mission.name}</Link></h3>
        </div>
        <StatusPill status={mission.status} />
      </div>
      {mission.intent && <p className="mission-intent">{mission.intent}</p>}
      <p className={`next-step next-step-${next.tone}`}>
        <span className="next-step-label">{t(next.label)}</span>
        <span className="next-step-detail">{translateNextStepDetail(next.detail, t)}</span>
      </p>
      <div className="progress-row">
        <span>{mission.actionsTotal ? <>{mission.actionsCompleted} <LocalizedText en="of" /> {mission.actionsTotal} <LocalizedText en="actions complete" /></> : <LocalizedText en="No actions yet" />}</span>
        <strong>{mission.progress}%</strong>
      </div>
      <div className="progress mission-progress" role="progressbar" aria-label={`Mission progress for ${mission.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={mission.progress}><span style={{ width: `${mission.progress}%` }} /></div>
      <div className="card-meta"><span><LocalizedText en="Updated" /> {mission.updated}</span></div>
      <Link className="button button-small mission-open" href={`/app/missions/${mission.id}`}>
        <LocalizedText en="Open mission" /> <span aria-hidden="true">→</span><span className="visually-hidden">: {mission.name}</span>
      </Link>
    </article>
  );
}
