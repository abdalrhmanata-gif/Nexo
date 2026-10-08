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
import { MissionResearchPanel } from "../../../../components/mission-research-panel";
import { ApprovalRequestControls } from "../../../../components/approval-request-controls";

export default async function MissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const repository = isSupabaseConfigured() ? await createSupabaseMissionRepository() : localMockMissionRepository;
  const mission = await repository.getMission((await params).id);
  if (!mission) return <div className="container"><p className="eyebrow">Mission unavailable</p><h1 className="detail-title">We could not find that mission.</h1><p className="detail-intent">It may have been deleted, or it belongs to another workspace.</p><Link className="button" href="/app">Back to workspace</Link></div>;

  const next = nextStepFor(mission);
  const verification = mission.verifications.find((item) => item.status === "VERIFIED") ?? mission.verifications[0];
  const outcome = mission.outcomes[0];
  const readiness = verificationReadiness(mission);
  const intelligence = missionIntelligenceFor(mission);
  const executions = repository.listAgentExecutions ? await repository.listAgentExecutions(mission.id) : [];

  return <div className="container">
    <p className="eyebrow"><Link href="/app">Workspace</Link> / Mission detail</p>
    <div className="detail-layout">
      <div className="detail-stack">
        <section className="card">
          <div className="card-heading">
            <div><h1 className="detail-title">{mission.name}</h1></div>
            <StatusPill status={mission.status} />
          </div>
          {mission.intent
            ? <><p className="eyebrow">Intent</p><p className="detail-intent">{mission.intent}</p></>
            : <p className="detail-intent">No intent was recorded for this mission.</p>}
          <p className={`next-step next-step-${next.tone}`}>
            <span className="next-step-label">Next: {next.label}</span>
            <span className="next-step-detail">{next.detail}</span>
          </p>
          <div className="progress-row">
            <span>{mission.actionsTotal ? `${mission.actionsCompleted} of ${mission.actionsTotal} actions complete` : "No actions yet"}</span>
            <strong>{mission.progress}%</strong>
          </div>
          <div className="progress"><span style={{ width: `${mission.progress}%` }} /></div>
        </section>

        <section className="card" aria-labelledby="next-action-heading">
          <p className="eyebrow">Deterministic guidance</p>
          <h2 id="next-action-heading">What should I do next?</h2>
          <p className={`next-step next-step-${intelligence.nextAction.priority === "high" ? "attention" : "info"}`}>
            <span className="next-step-label">{intelligence.nextAction.nextAction}</span>
            <span className="next-step-detail">{intelligence.nextAction.reason}</span>
          </p>
          {intelligence.nextAction.blockingCondition && <p className="action-hint">Why: {intelligence.nextAction.blockingCondition}</p>}
          <p className="action-hint">Based on this mission’s saved state: {intelligence.nextAction.currentState}.</p>
        </section>

        <MissionResearchPanel missionId={mission.id} />

        <section className="card" aria-labelledby="execution-heading">
          <p className="eyebrow">Agent execution</p>
          <h2 id="execution-heading">Execution evidence</h2>
          {executions.length ? <div className="timeline">{executions.slice(0,5).map((execution) => <div className="timeline-item" key={execution.id}>
            <strong>{execution.status} · Agent {execution.agentId.slice(0,8)}</strong>
            <span>{execution.actionId ? `Action ${execution.actionId.slice(0,8)}` : "Mission-level"} · {new Date(execution.createdAt).toLocaleString()} · {execution.approvalId ? "Approval attached" : "No approval required"}</span>
          </div>)}</div> : <p className="detail-intent">No agent execution has been recorded for this mission yet.</p>}
          <p className="action-hint">Every execution keeps its authority snapshot and evidence boundary. An AI result is not treated as verified until the verification step passes.</p>
        </section>



        <section className="card" aria-labelledby="plan-health-heading">
          <p className="eyebrow">Plan health</p>
          <h2 id="plan-health-heading">{intelligence.planHealth.healthy ? "No issues detected" : "Needs attention"}</h2>
          {intelligence.planHealth.healthy
            ? <p className="detail-intent">The saved actions and lifecycle do not show a known planning issue.</p>
            : <ul className="list">{intelligence.planHealth.findings.map((finding) => <li key={finding.code}>{finding.message}</li>)}</ul>}
        </section>

        <section className="card">
          <p className="eyebrow">Success criteria</p>
          <h2>What good looks like</h2>
          {mission.criteria.length
            ? <ul className="list criteria-list">{mission.criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
            : <p className="detail-intent">No success criteria were recorded for this mission.</p>}
        </section>

        <section className="card">
          <p className="eyebrow">Actions</p>
          <h2>The work this mission needs</h2>
          {mission.actions.length
            ? <ul className="list">{mission.actions.map((action) => {
              const followUp = formatFollowUp(action.followUpAt);
              return <li key={action.id}>
              <div className="card-heading">
                <div>
                  <span className="action-title">{action.title}</span>
                  <span className={`status status-action-${action.status.toLowerCase()}`}>{actionStatusLabel(action.status)}</span>
                  {followUp && <span className={`follow-up${followUp.overdue ? " follow-up-overdue" : ""}`}>
                    {followUp.overdue ? "Follow-up was due" : "Follow up"} {followUp.relative} · {followUp.absolute}
                  </span>}
                  <small className="action-hint">{actionStatusHint(action.status)}</small>
                </div>
                <ActionMutationControls missionId={mission.id} action={action} />
                {action.status !== "CANCELLED" && <ApprovalRequestControls missionId={mission.id} actionId={action.id} />}
              </div>
            </li>;
            })}</ul>
            : <p className="detail-intent">No actions have been added yet.</p>}
          {repository.addAction && <AddActionForm missionId={mission.id} />}
        </section>

        {repository.updateMission && <section className="card"><p className="eyebrow">Mission setup</p><h2>Edit this mission</h2><p>Changes are accepted only after the server confirms the current version.</p><MissionMutationControls missionId={mission.id} name={mission.name} intent={mission.intent} criteria={mission.criteria} status={mission.lifecycleStatus} version={mission.version} /></section>}

        <section className="card">
          <p className="eyebrow">Verification</p>
          <h2>{verification ? `Verification ${verification.status.toLowerCase()}` : "Record what you checked"}</h2>
          <p>A mission is only verified once evidence has been recorded through the authenticated server boundary. Work being reported as finished is not the same as ZAVQERA considering it verified.</p>
          {readiness.ready
            ? (verification
              ? <>{!outcome && <VerificationControls missionId={mission.id} verification={verification} />}</>
              : <VerificationControls missionId={mission.id} />)
            : <div className="readiness" role="status">
              <p>{readiness.reason}</p>
              {readiness.unresolved.length > 0 && <p className="action-hint">
                {readiness.unresolved.length === 1 ? "1 action is" : `${readiness.unresolved.length} actions are`} still open: {readiness.unresolved.map((action) => action.title).join(", ")}.
              </p>}
              {readiness.nextStatus && <p className="action-hint">Use “Edit this mission” above to move it to {missionStatusLabel(readiness.nextStatus).toLowerCase()}.</p>}
            </div>}
        </section>

        <section className="card">
          <p className="eyebrow">Outcome</p>
          <h2>{outcome ? `Outcome ${outcome.status.toLowerCase()}` : "No outcome yet"}</h2>
          {outcome
            ? <p>{outcome.status === "COMPLETED" ? "This mission reached its stated outcome." : "This mission closed without reaching its stated outcome."} Recorded confidence {Math.round(outcome.successScore * 100)}%.</p>
            : <p className="detail-intent">An outcome can only be committed after a verification is recorded.</p>}
        </section>

        <section className="card">
          <p className="eyebrow">Activity</p>
          <h2>Recent checkpoints</h2>
          {mission.activity.length
            ? <div className="timeline">{mission.activity.map((item, index) => <div className="timeline-item" key={`${item.label}-${item.time}-${index}`}><strong>{item.label}</strong><span>{item.detail} · {item.time}</span></div>)}</div>
            : <p className="detail-intent">No history has been recorded for this mission yet.</p>}
        </section>
      </div>

      <aside className="card">
        <p className="eyebrow">At a glance</p>
        <h2>Where this mission stands</h2>
        <ul className="list">
          <li><strong>Mission state</strong><br />{missionStatusLabel(mission.lifecycleStatus)}</li>
          <li><strong>Actions</strong><br />{mission.actionsCompleted} complete of {mission.actionsTotal}</li>
          <li><strong>Verified</strong><br />{verification?.status === "VERIFIED" ? "Yes" : "Not yet"}</li>
          <li><strong>Last updated</strong><br />{mission.updated}</li>
          <li><strong>Owner</strong><br />{mission.owner}</li>
        </ul>
        <DeleteMissionForm missionId={mission.id} missionName={mission.name} />
      </aside>
    </div>
  </div>;
}
