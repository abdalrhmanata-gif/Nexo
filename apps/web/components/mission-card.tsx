import Link from "next/link";
import { Mission } from "../lib/mock-data";
import { StatusPill } from "./shell";

export function MissionCard({ mission }: { mission: Mission }) {
  return (
    <article className="card mission-card">
      <div className="card-heading">
        <div>
          <p className="eyebrow">{mission.owner}</p>
          <h3><Link href={`/app/missions/${mission.id}`}>{mission.name}</Link></h3>
        </div>
        <StatusPill status={mission.status} />
      </div>
      <p>{mission.intent}</p>
      <div className="progress-row"><span>Progress</span><strong>{mission.progress}%</strong></div>
      <div className="progress"><span style={{ width: `${mission.progress}%` }} /></div>
      <div className="card-meta"><span>{mission.budget}</span><span>Updated {mission.updated}</span></div>
    </article>
  );
}
