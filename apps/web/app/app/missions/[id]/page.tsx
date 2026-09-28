import Link from "next/link";
import { DeleteMissionForm } from "../../../../components/delete-mission-form";
import { localMockMissionRepository } from "../../../../lib/local-mock-repository";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";
import { StatusPill } from "../../../../components/shell";
import { VerificationControls } from "../../../../components/verification-controls";
import { MissionMutationControls } from "../../../../components/mission-mutation-controls";
import { ActionMutationControls } from "../../../../components/action-mutation-controls";

export default async function MissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const repository = isSupabaseConfigured() ? await createSupabaseMissionRepository() : localMockMissionRepository;
  const mission = await repository.getMission((await params).id);
  if (!mission) return <div className="container"><p className="eyebrow">Mission unavailable</p><h1 className="detail-title">We could not find that mission.</h1><p className="detail-intent">This mission does not exist in your workspace.</p><Link className="button" href="/app">Back to workspace</Link></div>;
  return <div className="container"><p className="eyebrow"><Link href="/app">Workspace</Link> / Mission detail</p>
    <div className="detail-layout"><div className="detail-stack"><section className="card"><div className="card-heading"><div><h1 className="detail-title">{mission.name}</h1><p className="detail-intent">{mission.intent}</p></div><StatusPill status={mission.status} /></div><div className="progress-row"><span>Mission progress</span><strong>{mission.progress}%</strong></div><div className="progress"><span style={{ width: `${mission.progress}%` }} /></div></section>
      <section className="card"><p className="eyebrow">Actions</p><h2>What good looks like</h2><ul className="list">{mission.actions.map((action) => <li key={action.id}><div className="card-heading"><span>{action.title}</span><ActionMutationControls missionId={mission.id} action={action} /></div></li>)}</ul></section>
      {repository.updateMission && <section className="card"><p className="eyebrow">Authoritative mutation</p><h2>Mission controls</h2><p>Updates are accepted only after the server confirms the current version.</p><MissionMutationControls missionId={mission.id} objective={mission.intent} status={mission.lifecycleStatus} version={mission.version} /></section>}
      <section className="card"><p className="eyebrow">Activity</p><h2>Recent checkpoints</h2><div className="timeline">{mission.activity.map((item) => <div className="timeline-item" key={item.label}><strong>{item.label}</strong><span>{item.detail} · {item.time}</span></div>)}</div></section>
      <section className="card"><p className="eyebrow">Verification</p><h2>{mission.verifications.length ? mission.verifications[0].status : "Record terminal verification"}</h2>{mission.verifications.length ? <><p>Evidence and confidence were recorded through the authenticated server boundary.</p>{!mission.outcomes.length && <VerificationControls missionId={mission.id} verification={mission.verifications[0]} />}</> : <VerificationControls missionId={mission.id} />}</section>
      {mission.outcomes.length > 0 && <section className="card"><p className="eyebrow">Outcome</p><h2>{mission.outcomes[0].status}</h2><p>Verified outcome committed with score {mission.outcomes[0].successScore}.</p></section>}
    </div><aside className="card"><p className="eyebrow">Boundary</p><h2>Authority stays explicit.</h2><p>This preview shows the mission context without granting execution authority.</p><ul className="list"><li><strong>Budget</strong><br />{mission.budget}</li><li><strong>Risk</strong><br />{mission.risk}</li><li><strong>Owner</strong><br />{mission.owner}</li></ul><DeleteMissionForm missionId={mission.id} /></aside></div>
  </div>;
}
