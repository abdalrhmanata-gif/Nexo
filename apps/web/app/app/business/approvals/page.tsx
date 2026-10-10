import Link from "next/link";
import { LocalizedText } from "../../../../components/localized-text";
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
          <p className="eyebrow">ZAVQERA · <LocalizedText en="Human control" nb="Menneskelig kontroll" ar="التحكم البشري" /></p>
          <h1><LocalizedText en="Approval Center" nb="Godkjenningssenter" ar="مركز الموافقات" /></h1>
          <p><LocalizedText en="Review the requested action, scope, assigned agent, and authority before recording a decision." nb="Gjennomgå handlingen, omfanget, agenten og fullmakten før du registrerer en beslutning." ar="راجع الإجراء المطلوب ونطاقه والوكيل المعيّن وصلاحياته قبل تسجيل القرار." /></p>
        </div>
        <Link className="button button-quiet" href="/app/business"><LocalizedText en="Business workspace" nb="Arbeidsområde" ar="مساحة العمل" /></Link>
      </div>
      <div className="stats" aria-label="Approval queue metrics">
        <div className="stat"><strong>{approvals.length}</strong><span><LocalizedText en="Awaiting decision" nb="Venter på beslutning" ar="بانتظار القرار" /></span></div>
        <div className="stat"><strong><LocalizedText en={canDecide ? "Yes" : "No"} /></strong><span><LocalizedText en="You can decide" nb="Du kan beslutte" ar="يمكنك اتخاذ القرار" /></span></div>
        <div className="stat"><strong>0</strong><span><LocalizedText en="Implicit approvals" nb="Underforståtte godkjenninger" ar="موافقات ضمنية" /></span></div>
      </div>
      <ApprovalCenter approvals={approvals} canDecide={canDecide} />
    </div>
  );
}
