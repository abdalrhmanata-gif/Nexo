import Link from "next/link";
import { ApprovalCenter } from "../../../../components/approval-center";
import { localMockMissionRepository } from "../../../../lib/local-mock-repository";
import { isSupabaseConfigured } from "../../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";

export default async function BusinessApprovalsPage() {
  const repository = isSupabaseConfigured()
    ? await createSupabaseMissionRepository()
    : localMockMissionRepository;
  const [approvals, canDecide] = await Promise.all([
    repository.listPendingApprovals ? repository.listPendingApprovals() : Promise.resolve([]),
    repository.canDecideApprovals ? repository.canDecideApprovals() : Promise.resolve(false),
  ]);

  return (
    <div className="container">
      <div className="section-heading">
        <div>
          <p className="eyebrow">ZAVQERA · Human control</p>
          <h1>Approval Center</h1>
          <p>Review the requested action, scope, assigned agent, and authority before recording a decision.</p>
        </div>
        <Link className="button button-quiet" href="/app/business">Business workspace</Link>
      </div>
      <div className="stats" aria-label="Approval queue metrics">
        <div className="stat"><strong>{approvals.length}</strong><span>Awaiting decision</span></div>
        <div className="stat"><strong>{canDecide ? "Yes" : "No"}</strong><span>You can decide</span></div>
        <div className="stat"><strong>0</strong><span>Implicit approvals</span></div>
      </div>
      <ApprovalCenter approvals={approvals} canDecide={canDecide} />
    </div>
  );
}
