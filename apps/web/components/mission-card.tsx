import Link from "next/link";
import { LocalizedDateTime, LocalizedFill, LocalizedText } from "./localized-text";
import type { Mission } from "../lib/view-models";
import { MissionNextStep } from "./mission-next-step";
import { StatusPill } from "./shell";

export function MissionCard({ mission, progressLabel }: { mission: Mission; progressLabel?: string }) {
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
      <MissionNextStep mission={mission} />
      <div className="progress-row">
        <span>{mission.actionsTotal
          ? <LocalizedFill en="{done} of {total} actions complete" values={{ done: mission.actionsCompleted, total: mission.actionsTotal }} />
          : <LocalizedText en="No actions yet" />}</span>
        <strong>{mission.progress}%</strong>
      </div>
      <div className="progress mission-progress" role="progressbar" aria-label={progressLabel ?? `Mission progress for ${mission.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={mission.progress}><span style={{ width: `${mission.progress}%` }} /></div>
      <div className="card-meta"><span><LocalizedText en="Updated" /> <LocalizedDateTime value={mission.updated} /></span></div>
      <Link className="button button-small mission-open" href={`/app/missions/${mission.id}`}>
        <LocalizedText en="Open mission" /> <span aria-hidden="true">→</span><span className="visually-hidden">: {mission.name}</span>
      </Link>
    </article>
  );
}
