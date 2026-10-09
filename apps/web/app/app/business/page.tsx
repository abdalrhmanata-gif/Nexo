import Link from "next/link";
import { LocalizedText } from "../../../components/localized-text";
import { MissionCard } from "../../../components/mission-card";
import { ApprovalDecisionControls } from "../../../components/approval-decision-controls";
import { localMockMissionRepository } from "../../../lib/local-mock-repository";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { InvitationRevokeButton } from "../../../components/invitation-revoke-button";
import { MemberManagementControls } from "../../../components/member-management-controls";
import { humaniseEventType, summariseApprovalScope, summariseEventPayload } from "../../../lib/mission-content.mjs";

export default async function BusinessWorkspacePage() {
  const repository = isSupabaseConfigured() ? await createSupabaseMissionRepository() : localMockMissionRepository;
  const missions = await repository.listMissions();
  const active = missions.filter((mission) => mission.status === "ACTIVE");
  const waiting = missions.filter((mission) => mission.status === "WAITING");
  const completed = missions.filter((mission) => mission.status === "COMPLETED");
  const verified = missions.filter((mission) => mission.verifications.some((item) => item.status === "VERIFIED"));
  const recent = [...missions].sort((a, b) => b.updated.localeCompare(a.updated)).slice(0, 3);
  const agents = repository.listWorkspaceAgents ? await repository.listWorkspaceAgents() : [];
  const members = repository.listWorkspaceMembers ? await repository.listWorkspaceMembers() : [];
  const approvals = repository.listPendingApprovals ? await repository.listPendingApprovals() : [];
  const canDecideApprovals = repository.canDecideApprovals ? await repository.canDecideApprovals() : false;
  const invitations = repository.listWorkspaceInvitations ? await repository.listWorkspaceInvitations() : [];
  const activity = repository.listWorkspaceActivity ? await repository.listWorkspaceActivity() : [];

  return <div className="container business-dashboard">
    <div className="section-heading"><div>
      <p className="eyebrow"><LocalizedText en="Business workspace" nb="Arbeidsområde" ar="مساحة العمل" /></p>
      <h1>Run AI work as a team</h1>
      <p>One mission engine for work, approvals, verification, and outcomes. This first business layer stays lightweight and uses the same missions you already have.</p>
    </div><Link className="button" href="/app/missions/new">New mission</Link></div>

    <div className="stats" aria-label="Business workspace metrics">
      <div className="stat"><strong>1</strong><span>Workspace owner</span></div>
      <div className="stat"><strong>{active.length}</strong><span>Active missions</span></div>
      <div className="stat"><strong>{waiting.length}</strong><span>Needs approval/input</span></div>
      <div className="stat"><strong>{verified.length}</strong><span>Verified</span></div>
      <div className="stat"><strong>{approvals.length}</strong><span>Pending approvals</span></div>
    </div>

    <section className="grid">
      <section className="card"><p className="eyebrow">Delegated work</p><h2>Shared mission layer</h2><p>Every mission keeps its intent, actions, execution history, verification, and outcome together. That gives a team one source of truth instead of separate AI chats.</p><Link className="button button-small" href="/app">Open mission workspace</Link></section>
      <section className="card"><p className="eyebrow">Authority</p><h2>Approvals before side effects</h2><p>Read-only execution is available now. External side effects remain bounded until an explicit authority and approval path exists.</p><span className="status status-waiting">Approval controls ready for expansion</span></section>
      <section className="card"><p className="eyebrow">Evidence</p><h2>Verification before outcome</h2><p>AI results remain unverified until someone records what was checked and the evidence that supports it. Outcomes are committed only from a passing verification.</p></section>
      <section className="card"><p className="eyebrow">People</p><h2>Team access</h2><p>The current workspace is owner-scoped. The collaboration boundary is intentionally prepared without inventing members or permissions that are not yet persisted.</p><span className="action-hint">Next expansion: members, roles, shared missions.</span></section>
    </section>


    <section className="grid">
      <section className="card"><p className="eyebrow">Approvals</p><h2>Human control queue</h2>
        <p>{approvals.length ? `${approvals.length} request(s) are waiting for a recorded human decision.` : "No approvals are waiting. Actions that require approval stay blocked."}</p>
        {approvals.length ? <ul className="list">{approvals.slice(0,3).map((approval) => <li key={approval.id}>
          <strong>{approval.missionName || `Mission ${approval.missionId.slice(0,8)}`}</strong><br />
          <span>{approval.actionTitle || (approval.actionId ? "Action details unavailable" : "Mission-level approval")}</span><br />
          <span className="action-hint">Agent: {approval.agentName || "Not linked"} · Requested by: {approval.requesterLabel || "Workspace member"} · {new Date(approval.createdAt).toLocaleString()}</span><br />
          <span className="action-hint">{summariseApprovalScope(approval.requestedScope)}</span>
          {canDecideApprovals ? <ApprovalDecisionControls approvalId={approval.id} /> : <p className="action-hint">Decision access is limited to owners and admins.</p>}
        </li>)}</ul> : <p className="detail-intent">Approval-required side effects remain blocked until an explicit decision is recorded.</p>}
        <Link className="button button-small button-quiet" href="/app/business/approvals">Open Human Control Center</Link>
      </section>
      <section className="card"><p className="eyebrow">Agents</p><h2>Controlled AI workers</h2>
        {agents.length ? <ul className="list">{agents.map((agent) => <li key={agent.id}><strong>{agent.name}</strong><br />{agent.description || "Bounded workspace agent"}<br /><span className={`status status-${agent.status.toLowerCase()}`}>{agent.status}</span></li>)}</ul> : <p className="detail-intent">No agents are configured yet. The workspace is ready for bounded agents with explicit authority.</p>}
      </section>
      <section className="card"><p className="eyebrow">People</p><h2>{members.length} workspace member{members.length === 1 ? "" : "s"}</h2>
        <ul className="list">{members.slice(0,8).map((member) => <li key={member.id}><strong>{member.email || "Workspace member"}</strong><br /><span className="action-hint">{member.role}</span><br /><MemberManagementControls memberId={member.id} currentRole={member.role} /></li>)}</ul>
        <p className="action-hint">Roles: owner, admin, member, viewer.</p>
        <h3>Invitations</h3>
        {invitations.length ? <ul className="list">{invitations.slice(0,5).map((invitation) => <li key={invitation.id}><strong>{invitation.email}</strong><br /><span className="action-hint">{invitation.role} · {invitation.status} · expires {new Date(invitation.expiresAt).toLocaleDateString()}</span>{invitation.status === "PENDING" && <div><InvitationRevokeButton invitationId={invitation.id} /></div>}</li>)}</ul> : <p className="detail-intent">No invitations have been created yet.</p>}
        <Link className="button button-small" href="/app/business/invite">Invite a teammate</Link>
      </section>
    </section>
    <section className="card">
      <p className="eyebrow">Audit</p><h2>Workspace activity</h2>
      <p className="detail-intent">A readable history of collaboration, approvals, agent work, verification, and outcomes.</p>
      {activity.length ? <ul className="list">{activity.slice(0,12).map((item) => <li key={item.id}><strong>{humaniseEventType(item.eventType)}</strong><br /><span className="action-hint">{summariseEventPayload(item.payload)} · {new Date(item.createdAt).toLocaleString()}</span></li>)}</ul> : <p className="detail-intent">No workspace activity yet.</p>}
    </section>
    <div className="section-heading"><div><h2>Recent missions</h2><p>Recent work stays connected to the same execution engine.</p></div><Link className="button button-quiet" href="/app">View all</Link></div>
    {recent.length ? <div className="grid">{recent.map((mission) => <MissionCard key={mission.id} mission={mission} />)}</div> : <div className="empty-state"><h2>No missions yet</h2><p>Create the first delegated mission to start the workspace.</p></div>}
    {completed.length > 0 && <p className="action-hint">Completed missions remain available as historical work and can be used as the basis for reusable mission templates later.</p>}
  </div>;
}
