import Link from "next/link";
import { ApprovalDecisionControls } from "./approval-decision-controls";
import { summariseApprovalScope } from "../lib/mission-content.mjs";
import type { MissionApproval } from "../lib/mission-repository";

export function ApprovalCenter({
  approvals,
  canDecide,
}: {
  approvals: MissionApproval[];
  canDecide: boolean;
}) {
  return (
    <section className="grid" aria-label="Pending approval requests">
      {approvals.length ? approvals.map((approval) => (
        <article className="card" key={approval.id}>
          <p className="eyebrow">Approval request · Pending</p>
          <h2>{approval.missionName || `Mission ${approval.missionId.slice(0, 8)}`}</h2>
          {approval.missionIntent && <p>{approval.missionIntent}</p>}
          <dl className="approval-details">
            <dt>Requested action</dt>
            <dd>{approval.actionTitle || (approval.actionId ? "Action details unavailable" : "Mission-level approval")}</dd>
            <dt>Assigned agent</dt>
            <dd>{approval.agentName || "No agent linked to this mission"}</dd>
            <dt>Requested by</dt>
            <dd>{approval.requesterLabel || "Workspace member"}</dd>
            <dt>Submitted</dt>
            <dd><time dateTime={approval.createdAt}>{new Date(approval.createdAt).toLocaleString()}</time></dd>
            <dt>Requested scope</dt>
            <dd>{summariseApprovalScope(approval.requestedScope)}</dd>
            <dt>Agent authority</dt>
            <dd>{approval.agentAuthority
              ? summariseApprovalScope(approval.agentAuthority)
              : "No agent authority snapshot is attached to this request."}</dd>
          </dl>
          <p className="action-hint">
            Approving records permission for the bounded scope above. It does not execute the action by itself; the execution runtime must still enforce the approved scope and authority.
          </p>
          <div className="approval-actions">
            <Link className="button button-small button-quiet" href={`/app/missions/${approval.missionId}`}>Open mission and evidence</Link>
          </div>
          {canDecide
            ? <ApprovalDecisionControls approvalId={approval.id} />
            : <p className="detail-intent">Only workspace owners and admins can approve or reject requests. You can still inspect the mission and its evidence.</p>}
        </article>
      )) : (
        <div className="card empty-state">
          <h2>No approvals waiting</h2>
          <p>There are no pending requests in this workspace. Actions that require approval remain blocked until an explicit approval is recorded.</p>
          <Link className="button button-small button-quiet" href="/app/business">Back to business workspace</Link>
        </div>
      )}
    </section>
  );
}
