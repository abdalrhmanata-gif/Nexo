import Link from "next/link";
import type { Mission } from "../lib/view-models";
import { nextStepFor } from "../lib/mission-content.mjs";
import { StatusPill } from "./shell";
import { LocalizedText } from "./localized-text";

export function MissionCard({ mission }: { mission: Mission }) {
  const next = nextStepFor(mission);
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
        <span className="next-step-label">{next.label}</span>
        <span className="next-step-detail">{next.detail}</span>
      </p>
      <div className="progress-row">
        <span>{mission.actionsTotal ? `${mission.actionsCompleted} of ${mission.actionsTotal} actions complete` : <LocalizedText en="No actions yet" />}</span>
        <strong>{mission.progress}%</strong>
      </div>
      <div className="progress"><span style={{ width: `${mission.progress}%` }} /></div>
      <div className="card-meta"><span>Updated {mission.updated}</span></div>
      <Link className="button button-small mission-open" href={`/app/missions/${mission.id}`}>
        Open mission<span className="visually-hidden">: {mission.name}</span>
      </Link>
    </article>
  );
}
