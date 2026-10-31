import Link from "next/link";
import { DeleteMissionForm } from "../../../../components/delete-mission-form";
import { localMockMissionRepository } from "../../../../lib/local-mock-repository";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";
import { actionStatusHint, actionStatusLabel, formatFollowUp, missionStatusLabel, nextStepFor, verificationReadiness } from "../../../../lib/mission-content.mjs";
import { StatusPill } from "../../../../components/shell";
import { VerificationControls } from "../../../../components/verification-controls";
import { MissionMutationControls } from "../../../../components/mission-mutation-controls";
import { ActionMutationControls } from "../../../../components/action-mutation-controls";
import { AddActionForm } from "../../../../components/add-action-form";
import { missionIntelligenceFor } from "../../../../lib/mission-intelligence.mjs";
import { LocalizedText } from "../../../../components/localized-text";
import { LocalizedMissionNextStep } from "../../../../components/localized-mission-next-step";
import { LocalizedMissionValue } from "../../../../components/localized-mission-value";

export default async function MissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const repository = isSupabaseConfigured() ? await createSupabaseMissionRepository() : localMockMissionRepository;
  const mission = await repository.getMission((await params).id);
  if (!mission) return <div className="container"><p className="eyebrow"><LocalizedText en="Mission unavailable" /></p><h1 className="detail-title"><LocalizedText en="We could not find that mission." /></h1><p className="detail-intent"><LocalizedText en="It may have been deleted, or it belongs to another workspace." /></p><Link className="button" href="/app"><LocalizedText en="Back to workspace" /></Link></div>;

  const next = nextStepFor(mission);
  const verification = mission.verifications.find((item) => item.status === "VERIFIED") ?? mission.verifications[0];
  const outcome = mission.outcomes[0];
  const readiness = verificationReadiness(mission);
  const intelligence = missionIntelligenceFor(mission);

  return <div className="container">
    <p className="eyebrow"><Link href="/app"><LocalizedText en="Workspace" /></Link> / <LocalizedText en="Mission detail" /></p>
    <div className="detail-layout">
      <div className="detail-stack">
        <section className="card">
          <div className="card-heading">
            <div><h1 className="detail-title">{mission.name}</h1></div>
            <StatusPill status={mission.status} />
          </div>
          {mission.intent
            ? <><p className="eyebrow"><LocalizedText en="Intent" /></p><p className="detail-intent">{mission.intent}</p></>
            : <p className="detail-intent"><LocalizedText en="No intent was recorded for this mission." /></p>}
          <p className={`next-step next-step-${next.tone}`}>
            <LocalizedMissionNextStep label={next.label} detail={next.detail} />
          </p>
          <div className="progress-row">
            <span>{mission.actionsTotal ? <>{mission.actionsCompleted} / {mission.actionsTotal} <LocalizedText en="actions complete" /></> : <LocalizedText en="No actions yet" />}</span>
            <strong>{mission.progress}%</strong>
          </div>
          <div className="progress"><span style={{ width: `${mission.progress}%` }} /></div>
        </section>

        <section className="card" aria-labelledby="next-action-heading">
          <p className="eyebrow"><LocalizedText en="Deterministic guidance" /></p>
          <h2 id="next-action-heading"><LocalizedText en="What should I do next?" /></h2>
          <p className={`next-step next-step-${intelligence.nextAction.priority === "high" ? "attention" : "info"}`}>
            <span className="next-step-label"><LocalizedMissionValue value={intelligence.nextAction.nextAction} /></span>
            <span className="next-step-detail"><LocalizedMissionValue value={intelligence.nextAction.reason} /></span>
          </p>
          {intelligence.nextAction.blockingCondition && <p className="action-hint"><LocalizedText en="Why:" /> <LocalizedMissionValue value={intelligence.nextAction.blockingCondition} /></p>}
          <p className="action-hint"><LocalizedText en="Based on this mission’s saved state:" /> <LocalizedText en={intelligence.nextAction.currentState} />.</p>
        </section>

        <section className="card" aria-labelledby="plan-health-heading">
          <p className="eyebrow"><LocalizedText en="Plan health" /></p>
          <h2 id="plan-health-heading"><LocalizedText en={intelligence.planHealth.healthy ? "No issues detected" : "Needs attention"} /></h2>
          {intelligence.planHealth.healthy
            ? <p className="detail-intent"><LocalizedText en="The saved actions and lifecycle do not show a known planning issue." /></p>
            : <ul className="list">{intelligence.planHealth.findings.map((finding) => <li key={finding.code}><LocalizedMissionValue value={finding.message} /></li>)}</ul>}
        </section>

        <section className="card">
          <p className="eyebrow"><LocalizedText en="Success criteria" /></p>
          <h2><LocalizedText en="What good looks like" /></h2>
          {mission.criteria.length
            ? <ul className="list criteria-list">{mission.criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
            : <p className="detail-intent"><LocalizedText en="No success criteria were recorded for this mission." /></p>}
        </section>

        <section className="card">
          <p className="eyebrow"><LocalizedText en="Actions" /></p>
          <h2><LocalizedText en="The work this mission needs" /></h2>
          {mission.actions.length
            ? <ul className="list">{mission.actions.map((action) => {
              const followUp = formatFollowUp(action.followUpAt);
              return <li key={action.id}>
              <div className="card-heading">
                <div>
                  <span className="action-title">{action.title}</span>
                  <span className={`status status-action-${action.status.toLowerCase()}`}><LocalizedText en={actionStatusLabel(action.status)} /></span>
                  {followUp && <span className={`follow-up${followUp.overdue ? " follow-up-overdue" : ""}`}>
                    <LocalizedText en={followUp.overdue ? "Follow-up was due" : "Follow up"} /> {followUp.relative} · {followUp.absolute}
                  </span>}
                  <small className="action-hint"><LocalizedText en={actionStatusHint(action.status)} /></small>
                </div>
                <ActionMutationControls missionId={mission.id} action={action} />
              </div>
            </li>;
            })}</ul>
            : <p className="detail-intent"><LocalizedText en="No actions have been added yet." /></p>}
          {repository.addAction && <AddActionForm missionId={mission.id} />}
        </section>

        {repository.updateMission && <section className="card"><p className="eyebrow"><LocalizedText en="Mission setup" /></p><h2><LocalizedText en="Edit this mission" /></h2><p><LocalizedText en="Changes are accepted only after the server confirms the current version." /></p><MissionMutationControls missionId={mission.id} name={mission.name} intent={mission.intent} criteria={mission.criteria} status={mission.lifecycleStatus} version={mission.version} /></section>}

        <section className="card">
          <p className="eyebrow"><LocalizedText en="Verification" /></p>
          <h2><LocalizedText en={verification ? "Verification" : "Record what you checked"} /></h2>
          <p><LocalizedText en="A mission is only verified once evidence has been recorded through the authenticated server boundary. Work being reported as finished is not the same as ZAVQERA considering it verified." /></p>
          {readiness.ready
            ? (verification
              ? <>{!outcome && <VerificationControls missionId={mission.id} verification={verification} />}</>
              : <VerificationControls missionId={mission.id} />)
            : <div className="readiness" role="status">
              <p><LocalizedMissionValue value={readiness.reason} /></p>
              {readiness.unresolved.length > 0 && <p className="action-hint">
                {readiness.unresolved.length === 1 ? "1 action is" : `${readiness.unresolved.length} actions are`} still open: {readiness.unresolved.map((action) => action.title).join(", ")}.
              </p>}
              {readiness.nextStatus && <p className="action-hint"><LocalizedText en="Use “Edit this mission” above to move it to" /> <LocalizedText en={missionStatusLabel(readiness.nextStatus)} />.</p>}
            </div>}
        </section>

        <section className="card">
          <p className="eyebrow"><LocalizedText en="Outcome" /></p>
          <h2><LocalizedText en={outcome ? "Outcome" : "No outcome yet"} /></h2>
          {outcome
            ? <p><LocalizedText en={outcome.status === "COMPLETED" ? "This mission reached its stated outcome." : "This mission closed without reaching its stated outcome."} /> <LocalizedText en="Recorded confidence" /> {Math.round(outcome.successScore * 100)}%.</p>
            : <p className="detail-intent"><LocalizedText en="An outcome can only be committed after a verification is recorded." /></p>}
        </section>

        <section className="card">
          <p className="eyebrow"><LocalizedText en="Activity" /></p>
          <h2><LocalizedText en="Recent checkpoints" /></h2>
          {mission.activity.length
            ? <div className="timeline">{mission.activity.map((item, index) => <div className="timeline-item" key={`${item.label}-${item.time}-${index}`}><strong>{item.label}</strong><span>{item.detail} · {item.time}</span></div>)}</div>
            : <p className="detail-intent"><LocalizedText en="No history has been recorded for this mission yet." /></p>}
        </section>
      </div>

      <aside className="card">
        <p className="eyebrow"><LocalizedText en="At a glance" /></p>
        <h2><LocalizedText en="Where this mission stands" /></h2>
        <ul className="list">
          <li><strong><LocalizedText en="Mission state" /></strong><br /><LocalizedText en={missionStatusLabel(mission.lifecycleStatus)} /></li>
          <li><strong><LocalizedText en="Actions" /></strong><br />{mission.actionsCompleted} <LocalizedText en="complete of" /> {mission.actionsTotal}</li>
          <li><strong><LocalizedText en="Verified" /></strong><br /><LocalizedText en={verification?.status === "VERIFIED" ? "Yes" : "Not yet"} /></li>
          <li><strong><LocalizedText en="Last updated" /></strong><br />{mission.updated}</li>
          <li><strong><LocalizedText en="Owner" /></strong><br />{mission.owner}</li>
        </ul>
        <DeleteMissionForm missionId={mission.id} missionName={mission.name} />
      </aside>
    </div>
  </div>;
}
