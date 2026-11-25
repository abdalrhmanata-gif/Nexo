import { SavePdfButton } from "../../../../components/save-pdf-button";
import Link from "next/link";
import { LocalizedDateTime, LocalizedText } from "../../../../components/localized-text";
import { DeleteMissionForm } from "../../../../components/delete-mission-form";
import { localMockMissionRepository } from "../../../../lib/local-mock-repository";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";
import { actionStatusHint, actionStatusLabel, formatFollowUp, isTerminalMissionStatus, missionStatusLabel, nextStepFor, verificationReadiness } from "../../../../lib/mission-content.mjs";
import { planHeadline, suggestPlanFor } from "../../../../lib/mission-planner.mjs";
import { critiqueMission, planIsThin } from "../../../../lib/mission-critique.mjs";
import { fill } from "../../../../lib/i18n";
import { SuggestedPlan } from "../../../../components/suggested-plan";
import { AiMissionPlan } from "../../../../components/ai-mission-plan";
import { getLanguage, getTranslate } from "../../../../lib/i18n-server";
import { StatusPill } from "../../../../components/shell";
import { VerificationControls } from "../../../../components/verification-controls";
import { MissionMutationControls } from "../../../../components/mission-mutation-controls";
import { ActionMutationControls } from "../../../../components/action-mutation-controls";
import { evidenceFromProof, proofCitation } from "../../../../lib/step-proof.mjs";
import { AddActionForm } from "../../../../components/add-action-form";
import { missionIntelligenceFor } from "../../../../lib/mission-intelligence.mjs";
import { ShareMissionButton, type MissionShareStatus } from "../../../../components/share-mission-button";
import { createSupabaseServerClient, getAuthenticatedUser } from "../../../../lib/supabase/server";
import { describeProvider, hasAiAccess } from "../../../../lib/ai/gate";
import { OwnTemplateBox } from "../../../../components/own-template-box";
import { hasOwnTemplates } from "../../../../lib/own-templates.mjs";
import { readCurrentPlan } from "../../../../lib/supabase/own-template-repository";
import { PlanDatesCard, type CalendarState } from "../../../../components/plan-dates-card";
import { PlanDay } from "../../../../components/plan-dates-client";
import { calendarConnections, calendarLimit, subscribeLinks, todayIn } from "../../../../lib/plan-dates.mjs";
import { createPlanDatesRepository, readMissionDates, type MissionDates } from "../../../../lib/supabase/plan-dates-repository";
import { readStepOwners } from "../../../../lib/supabase/step-owner-repository";
import { StepOwnerPicker } from "../../../../components/step-owner-picker";
import { creatorName, missionPermissions, ownersInUse, stepTakesOwner } from "../../../../lib/step-owners.mjs";

/** Whether this reader can get an AI plan here; then the keyword plan is noise. */
async function aiPlanReady() {
  if (!isSupabaseConfigured() || !describeProvider().ok) return false;
  try {
    const user = await getAuthenticatedUser();
    return Boolean(user && hasAiAccess(user.id));
  } catch {
    return false;
  }
}

/** The live share link's counters, if this mission is shared. */
async function readMissionShareStatus(missionId: string): Promise<MissionShareStatus> {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const found = await supabase.rpc("mission_share_status", { p_mission_id: missionId });
    const row = (found.data as { views: number; remixes: number }[] | null)?.[0];
    return found.error || !row ? null : { views: row.views, remixes: row.remixes };
  } catch {
    return null;
  }
}

/** The person's calendar entries, or null when they cannot be read. */
async function readCalendar() {
  try {
    const repository = await createPlanDatesRepository();
    return { repository, entries: await repository.calendarEntries() };
  } catch {
    return null;
  }
}

/** A status inside an activity entry, in the reader's words. */
function statusWord(label: string, status: string, t: (en: string) => string) {
  return label === "Mission status changed" ? missionStatusLabel(status, t) : actionStatusLabel(status, t);
}

export default async function MissionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ welcome?: string; template?: string; dates?: string; calendar?: string }>;
}) {
  const t = await getTranslate();
  const language = await getLanguage();
  const repository = isSupabaseConfigured() ? await createSupabaseMissionRepository() : localMockMissionRepository;
  const mission = await repository.getMission((await params).id);
  if (!mission) return <div className="container"><p className="eyebrow"><LocalizedText en="Mission unavailable" /></p><h1 className="detail-title"><LocalizedText en="We could not find that mission." /></h1><p className="detail-intent"><LocalizedText en="It may have been deleted, or it belongs to another workspace." /></p><Link className="button" href="/app"><LocalizedText en="Back to workspace" /></Link></div>;

  const next = nextStepFor(mission, t, language);
  const verification = mission.verifications.find((item) => item.status === "VERIFIED") ?? mission.verifications[0];
  const outcome = mission.outcomes[0];
  const thin = planIsThin(mission);
  // These reads do not depend on each other, so they run together rather
  // than one after another: each is a round trip to the database, and in a
  // row they made the page (and every refresh after a change) take seconds.
  const [shareStatus, aiReady, plan, dates, calendarRead, stepOwners] = await Promise.all([
    readMissionShareStatus(mission.id),
    thin ? aiPlanReady() : Promise.resolve(true),
    // Own templates need the database; the local preview has none.
    isSupabaseConfigured() ? readCurrentPlan() : Promise.resolve("free"),
    // Dates and the calendar need the database too. A failure to read them
    // never breaks the page: it shows the Mission undated.
    isSupabaseConfigured() ? readMissionDates(mission.id) : Promise.resolve<MissionDates>({ targetDate: null, dueDates: {} }),
    isSupabaseConfigured() ? readCalendar() : Promise.resolve(null),
    // Who owns each step. Null when it cannot be read: the steps show alone.
    readStepOwners(mission.id),
  ]);
  const closed = isTerminalMissionStatus(mission.lifecycleStatus);
  const teamOwners = ownersInUse(stepOwners);
  // What this reader may do here. Unknown access shows everything, as before;
  // the database refuses anything they may not do either way.
  const can = missionPermissions(stepOwners);
  const creator = creatorName(stepOwners, t);
  const readiness = verificationReadiness(mission, t);
  const intelligence = missionIntelligenceFor(mission, new Date(), t, language);
  // A stated outcome with no work behind it is the moment the product is
  // least useful, so that is where it offers a first plan.
  // Where the AI plan is available it is shown alone: the keyword planner
  // matched an online perfume shop to "opening premises" (visit locations,
  // check leases) and sat above a far better AI draft.
  const suggested = thin && !aiReady ? suggestPlanFor(mission) : null;
  // Plan health only ever read lifecycle fields, so it reported "no issues"
  // for a mission whose criterion and only step were the same three words.
  const critique = critiqueMission(mission);
  const completedSteps = mission.actions
    .filter((action) => action.status === "COMPLETED")
    .map((action) => action.title);
  // Proof recorded on each step feeds the evidence summary, so the user does
  // not retype what they already wrote when they finished the step.
  const stepProof = Object.fromEntries(mission.actions
    .filter((action) => action.status === "COMPLETED")
    .map((action) => [action.title, proofCitation(action)]));
  const initialEvidence = evidenceFromProof(mission.actions);
  const healthy = intelligence.planHealth.healthy && critique.length === 0;
  const query = await searchParams;
  const ownTemplates = isSupabaseConfigured() ? { active: hasOwnTemplates(plan) } : null;
  let calendar: CalendarState | null = null;
  if (calendarRead) {
    try {
      const { repository, entries } = calendarRead;
      const entry = entries.find((item) => item.missionId === mission.id);
      calendar = { inCalendar: Boolean(entry), count: entries.length, limit: calendarLimit(plan), plan };
      if (entry) {
        const [token, rows] = await Promise.all([repository.feedToken(), repository.connections()]);
        calendar = {
          ...calendar,
          links: subscribeLinks(`https://zavqera.com/api/calendar/${token}.ics`),
          connections: calendarConnections(rows),
          addedAt: entry.addedAt,
        };
      }
    } catch {
      calendar = null;
    }
  }
  const today = todayIn("UTC");

  return <div className="container">
    <p className="eyebrow no-print"><Link href="/app"><LocalizedText en="Workspace" /></Link> <LocalizedText en="/ Mission detail" /></p>
    <div className="landing-final-actions no-print">
      <SavePdfButton title={mission.name} subtitle={t("Mission plan")} />
      {can.canEdit && <ShareMissionButton missionId={mission.id} shared={shareStatus} />}
    </div>
    {/* Arriving from "Save this plan": say it worked and what to do first,
        once, where the person is looking. */}
    {query?.welcome === "1" && <div className="success-state mission-welcome" role="status">
      <strong><LocalizedText en="Your plan is saved." /></strong>{" "}
      <LocalizedText en="Start with the first step below. When it is done, mark it done and keep the proof: a receipt, a reference number or a link." />
    </div>}
    {can.known && !can.canEdit && <p className="readiness mission-access-note" role="status">
      {t("You can view this mission. To work on it, ask the workspace owner to let you edit.")}
    </p>}
    <div className="detail-layout">
      <div className="detail-stack">
        <section className="card">
          <div className="card-heading">
            <div><h1 className="detail-title">{mission.name}</h1></div>
            <StatusPill status={mission.status} label={missionStatusLabel(mission.lifecycleStatus, t)} />
          </div>
          {mission.intent
            ? <><p className="eyebrow"><LocalizedText en="Intent" /></p><p className="detail-intent">{mission.intent}</p></>
            : <p className="detail-intent"><LocalizedText en="No intent was recorded for this mission." /></p>}
          <p className={`next-step next-step-${next.tone}`}>
            <span className="next-step-label">{t("Next:")} {next.label}</span>
            <span className="next-step-detail">{next.detail}</span>
          </p>
          <div className="progress-row">
            <span>{mission.actionsTotal
              ? fill(t("{done} of {total} actions complete"), { done: mission.actionsCompleted, total: mission.actionsTotal })
              : t("No actions yet")}</span>
            <strong>{mission.progress}%</strong>
          </div>
          <div className="progress"><span style={{ width: `${mission.progress}%` }} /></div>
        </section>

        {calendar && can.isCreator && <PlanDatesCard missionId={mission.id} actions={mission.actions} dates={dates} calendar={calendar} notice={{ dates: query?.dates, calendar: query?.calendar }} />}

        <section className="card" aria-labelledby="next-action-heading">
          <p className="eyebrow"><LocalizedText en="Deterministic guidance" /></p>
          <h2 id="next-action-heading"><LocalizedText en="What should I do next?" /></h2>
          <p className={`next-step next-step-${intelligence.nextAction.priority === "high" ? "attention" : "info"}`}>
            <span className="next-step-label">{intelligence.nextAction.nextAction}</span>
            <span className="next-step-detail">{intelligence.nextAction.reason}</span>
          </p>
          {intelligence.nextAction.blockingCondition && <p className="action-hint">{t("Why:")} {intelligence.nextAction.blockingCondition}</p>}
          <p className="action-hint">{t("Based on this mission’s saved state:")} {intelligence.nextAction.currentState}.</p>
        </section>

        {suggested && can.canEdit && <SuggestedPlan
          missionId={mission.id}
          headline={planHeadline(suggested.kind)}
          steps={suggested.steps}
          criteria={suggested.criteria}
          licensed={suggested.licensed}
        />}

        {/* The deterministic planner knows six domains by keyword. This is
            the path for every mission it cannot help with, which is most of
            them. It renders nothing where no provider is configured. */}
        {can.canEdit && <AiMissionPlan
          missionId={mission.id}
          name={mission.name}
          intent={mission.intent}
          criteria={mission.criteria}
          actions={mission.actions.map((action) => action.title)}
        />}

        <section className="card" aria-labelledby="plan-health-heading">
          <p className="eyebrow"><LocalizedText en="Plan health" /></p>
          <h2 id="plan-health-heading">{healthy ? t("No issues detected") : t("Needs attention")}</h2>
          {healthy
            ? <p className="detail-intent"><LocalizedText en="The saved actions and lifecycle do not show a known planning issue." /></p>
            : <ul className="list">
              {critique.map((finding) => <li key={`${finding.code}:${finding.quote ?? ""}`} className={finding.severity === "high" ? "finding-high" : undefined}>
                {finding.quote ? fill(t(finding.message), { text: finding.quote }) : t(finding.message)}
              </li>)}
              {intelligence.planHealth.findings.map((finding) => <li key={finding.code}>{finding.message}</li>)}
            </ul>}
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
              const followUp = formatFollowUp(action.followUpAt, new Date(), t, language);
              return <li key={action.id}>
              <div className="card-heading">
                <div>
                  <span className="action-title">{action.title}</span>
                  <span className={`status status-action-${action.status.toLowerCase()}`}>{actionStatusLabel(action.status, t)}</span>
                  {dates.dueDates[action.id] && <span className={`due-chip${["PENDING", "RUNNING", "BLOCKED"].includes(action.status) && dates.dueDates[action.id].dueOn < today ? " due-chip-late" : ""}`}>
                    {t("Due")} <PlanDay value={dates.dueDates[action.id].dueOn} />{dates.dueDates[action.id].basis === "law" && <> · {t("set by law")}</>}
                  </span>}
                  {followUp && <span className={`follow-up${followUp.overdue ? " follow-up-overdue" : ""}`}>
                    {followUp.overdue ? t("Follow-up was due") : t("Follow up")} {followUp.relative} · {followUp.absolute}
                  </span>}
                  {teamOwners && stepOwners && <StepOwnerPicker
                    missionId={mission.id}
                    actionId={action.id}
                    version={action.version}
                    editors={stepOwners.editors}
                    ownerId={stepOwners.owners[action.id] ?? null}
                    editable={stepOwners.canAssign && !closed && stepTakesOwner(action.status)}
                  />}
                  <small className="action-hint">{actionStatusHint(action.status, t)}</small>
                </div>
                {can.canEdit && <ActionMutationControls missionId={mission.id} action={action} closed={closed} />}
              </div>
            </li>;
            })}</ul>
            : <p className="detail-intent"><LocalizedText en="No actions have been added yet." /></p>}
          {/* Alone in the workspace, every step is yours. The way to give
              steps an owner is to bring the team in. */}
          {stepOwners && stepOwners.canAssign && !teamOwners && !closed && mission.actions.length > 1 && <p className="action-hint step-owner-invite no-print">
            <LocalizedText en="Doing this with someone? Invite them, then give each step an owner so everyone knows what is theirs." />{" "}
            <Link href="/app/team"><LocalizedText en="Invite your team" /></Link>
          </p>}
          {repository.addAction && can.canEdit && <AddActionForm missionId={mission.id} />}
        </section>

        {can.known && can.canEdit && !can.isCreator && <p className="readiness mission-access-note no-print">
          {fill(t("Only {name}, who created this mission, can edit its details, set its dates, check the result and close it. You can add steps, work on them and record their proof."), { name: creator })}
        </p>}

        {repository.updateMission && can.isCreator && <section className="card no-print"><p className="eyebrow"><LocalizedText en="Mission setup" /></p><h2><LocalizedText en="Edit this mission" /></h2><p><LocalizedText en="Changes are accepted only after the server confirms the current version." /></p><MissionMutationControls missionId={mission.id} name={mission.name} intent={mission.intent} criteria={mission.criteria} status={mission.lifecycleStatus} version={mission.version} /></section>}

        <section className="card">
          <p className="eyebrow"><LocalizedText en="Verification" /></p>
          <h2>{verification
            ? fill(t("Verification {status}"), { status: t(verification.status.toLowerCase()) })
            : t("Record what you checked")}</h2>
          <p><LocalizedText en="A mission is only verified once evidence has been recorded through the authenticated server boundary. Work being reported as finished is not the same as ZAVQERA considering it verified." /></p>
          {readiness.ready && !can.isCreator
            ? <p className="readiness" role="status">{fill(t("{name} checks the result and closes this mission."), { name: creator })}</p>
            : readiness.ready
            ? (verification
              ? <>{!outcome && <VerificationControls missionId={mission.id} verification={verification} criteria={mission.criteria} completedSteps={completedSteps} stepProof={stepProof} initialEvidence={initialEvidence} />}</>
              : <VerificationControls missionId={mission.id} criteria={mission.criteria} completedSteps={completedSteps} stepProof={stepProof} initialEvidence={initialEvidence} />)
            : <div className="readiness" role="status">
              <p>{readiness.reason}</p>
              {readiness.unresolved.length > 0 && <p className="action-hint">
                {fill(t(readiness.unresolved.length === 1 ? "{count} action is still open: {titles}." : "{count} actions are still open: {titles}."), {
                  count: readiness.unresolved.length,
                  titles: readiness.unresolved.map((action) => `«${action.title.replace(/[.。]+$/, "")}»`).join(" · "),
                })}
              </p>}
            </div>}
        </section>

        <section className="card">
          <p className="eyebrow"><LocalizedText en="Outcome" /></p>
          <h2>{outcome
            ? fill(t("Outcome {status}"), { status: t(outcome.status.toLowerCase()) })
            : t("No outcome yet")}</h2>
          {outcome
            ? <p>{outcome.status === "COMPLETED" ? t("This mission reached its stated outcome.") : t("This mission closed without reaching its stated outcome.")} {fill(t("Recorded confidence {percent}%."), { percent: Math.round(outcome.successScore * 100) })}</p>
            : <p className="detail-intent"><LocalizedText en="An outcome can only be committed after a verification is recorded." /></p>}
        </section>

        <section className="card">
          <p className="eyebrow"><LocalizedText en="Activity" /></p>
          <h2><LocalizedText en="Recent checkpoints" /></h2>
          {mission.activity.length
            ? <div className="timeline">{mission.activity.map((item, index) => <div className="timeline-item" key={`${item.label}-${item.time}-${index}`}><strong>{t(item.label)}</strong><span>{item.fromStatus && item.toStatus
              ? `${statusWord(item.label, item.fromStatus, t)} → ${statusWord(item.label, item.toStatus, t)}${item.withProof ? ` · ${t("with proof")}` : ""} · `
              : item.detail ? `${t(item.detail)} · ` : ""}<LocalizedDateTime value={item.time} /></span></div>)}</div>
            : <p className="detail-intent"><LocalizedText en="No history has been recorded for this mission yet." /></p>}
        </section>
      </div>

      <aside className="card">
        <p className="eyebrow"><LocalizedText en="At a glance" /></p>
        <h2><LocalizedText en="Where this mission stands" /></h2>
        <ul className="list">
          <li><strong><LocalizedText en="Mission state" /></strong><br />{missionStatusLabel(mission.lifecycleStatus, t)}</li>
          <li><strong><LocalizedText en="Actions" /></strong><br />{fill(t("{done} complete of {total}"), { done: mission.actionsCompleted, total: mission.actionsTotal })}</li>
          <li><strong><LocalizedText en="Verified" /></strong><br />{verification?.status === "VERIFIED" ? t("Yes") : t("Not yet")}</li>
          <li><strong><LocalizedText en="Last updated" /></strong><br /><LocalizedDateTime value={mission.updated} /></li>
          <li><strong><LocalizedText en="Created by" /></strong><br />{can.known ? creator : t(mission.owner)}</li>
        </ul>
        {ownTemplates && <OwnTemplateBox missionId={mission.id} missionName={mission.name} active={ownTemplates.active} notice={query?.template} />}
        {can.canDelete && <DeleteMissionForm missionId={mission.id} missionName={mission.name} />}
      </aside>
    </div>
  </div>;
}
