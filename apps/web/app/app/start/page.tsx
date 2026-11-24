import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AutoSubmit } from "../../../components/auto-submit";
import { LocalizedText } from "../../../components/localized-text";
import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { StartPlanFields, StartPlanPreview } from "../../../components/start-plan-preview";
import { getLanguage } from "../../../lib/i18n-server";
import { buildStartPlan, editBeforeSavingHref, readStartRequest } from "../../../lib/start-plan";
import { START_COOKIE, startToken } from "../../../lib/start-plan-token";
import { savePlan } from "./actions";

export const dynamic = "force-dynamic";

type StartSearchParams = { goal?: string; template?: string; guide?: string; lang?: string; error?: string };

/**
 * Where a plan is saved once the person is signed in. Arriving from sign-up,
 * an email confirmation or Google, it saves on its own and moves on to the
 * mission; arriving any other way (a link, a bookmark), it shows the plan and
 * waits for the button, so nobody's workspace fills with a plan they never
 * asked for.
 */
export default async function StartPlanPage({ searchParams }: { searchParams: Promise<StartSearchParams> }) {
  const params = await searchParams;
  const request = readStartRequest(params, await getLanguage());
  if (!request) redirect("/app/missions/new");
  const plan = buildStartPlan(request);
  const failed = params.error === "save";
  const autoSave = !failed && (await cookies()).get(START_COOKIE)?.value === startToken(request);

  return <div className="container"><div className="form start-page">
    <p className="eyebrow"><Link href="/app"><LocalizedText en="Workspace" /></Link> <LocalizedText en="/ Your plan" /></p>
    <h1 className="detail-title">{plan.name}</h1>
    <p className="detail-intent">{plan.intent}</p>
    {autoSave && <p className="success-state" role="status"><LocalizedText en="Saving your plan to your workspace…" /></p>}
    {failed && <div className="field-error" role="alert"><LocalizedText en="The plan could not be saved just now. Press the button to try again." /></div>}
    <form id="start-plan-form" className="start-plan-form" action={savePlan}>
      <StartPlanFields plan={plan} />
      <PendingSubmitButton label="Save this plan" pendingLabel="Saving…" />
      <Link className="button button-quiet" href={editBeforeSavingHref(plan)} prefetch={false}><LocalizedText en="Edit before saving" /></Link>
    </form>
    {autoSave && <AutoSubmit formId="start-plan-form" />}
    <section className="card start-plan-card"><StartPlanPreview plan={plan} /></section>
  </div></div>;
}
