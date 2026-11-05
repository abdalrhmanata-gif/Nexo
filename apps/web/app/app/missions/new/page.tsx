import Link from "next/link";
import { LocalizedText } from "../../../../components/localized-text";
import { MissionDraftAssist } from "../../../../components/mission-draft-assist";
import { getTranslate } from "../../../../lib/i18n-server";
import { redirect } from "next/navigation";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";
import { composeMissionObjective } from "../../../../lib/mission-content.mjs";

type NewMissionSearchParams = {
  error?: string;
  fromOpportunity?: string;
  name?: string;
  intent?: string;
  criteria?: string;
  actions?: string;
};

async function createMission(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const intent = String(formData.get("intent") ?? "").trim();
  const criteria = String(formData.get("criteria") ?? "").trim();
  const steps = String(formData.get("actions") ?? "").trim();
  if (!name || intent.length < 12 || !criteria) {
    redirect("/app/missions/new?error=validation");
  }
  const repository = await createSupabaseMissionRepository();
  const toLines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  // Success criteria describe what good looks like; actions are the work. When
  // no separate first steps are given the criteria seed the plan, which keeps
  // every mission created before these were separated behaving as it did.
  const actions = steps ? toLines(steps) : toLines(criteria);
  const mission = await repository.createMission!({ objective: composeMissionObjective({ name, intent, criteria }), actions });
  redirect(`/app/missions/${mission.id}`);
}

function SubmitButton() {
  return <button className="button" type="submit"><LocalizedText en="Create mission" /></button>;
}

export default async function NewMissionPage({ searchParams }: { searchParams: Promise<NewMissionSearchParams> }) {
  const t = await getTranslate();
  const params = await searchParams;
  const fromOpportunity = params.fromOpportunity === "1";
  return <div className="container"><div className="form">
    <p className="eyebrow"><Link href="/app"><LocalizedText en="Workspace" /></Link> / <Link href="/app/opportunities"><LocalizedText en="Opportunity Intelligence" /></Link> <LocalizedText en="/ New mission" /></p>
    <h1 className="detail-title">{fromOpportunity ? t("Validate the opportunity.") : t("Shape the intent.")}</h1>
    <p className="detail-intent">{fromOpportunity ? t("Review the evidence and assumptions before committing resources.") : t("Define what good looks like before anything is allowed to move.")}</p>
    <div className="form-note"><LocalizedText en="Your mission is saved to your private workspace. Ownership comes from your authenticated session." /></div>
    {fromOpportunity && <div className="opportunity-form-origin"><strong><LocalizedText en="Started from Opportunity Intelligence." /></strong> <LocalizedText en="The priority score is a rule-based decision aid, not a verified forecast. Review every field and confirm the source before creating the Mission." /></div>}
    <form id="new-mission-form" className="form-grid" action={createMission} noValidate>
      <div className="field"><label htmlFor="name"><LocalizedText en="Mission name" /></label><input id="name" name="name" defaultValue={params.name ?? ""} maxLength={100} placeholder={t("e.g. Renew my passport")} required /></div>
      <div className="field"><label htmlFor="intent"><LocalizedText en="Intent" /></label><textarea id="intent" name="intent" defaultValue={params.intent ?? ""} maxLength={3000} placeholder={t("What should this mission help you accomplish?")} required /><small><LocalizedText en="Use plain language. Keep the decision you want to make visible." /></small></div>
      <div className="field"><label htmlFor="criteria"><LocalizedText en="Success criteria" /></label><textarea id="criteria" name="criteria" defaultValue={params.criteria ?? ""} maxLength={2000} placeholder={t("One criterion per line")} required /><small><LocalizedText en="How you will know this mission succeeded. One per line." /></small></div>
      <div className="field"><label htmlFor="actions"><LocalizedText en="First steps" /> <span className="field-optional"><LocalizedText en="optional" /></span></label><textarea id="actions" name="actions" defaultValue={params.actions ?? ""} maxLength={2000} placeholder={t("One step per line")} /><small><LocalizedText en="The work you already know about, in the order you would do it. You can add more at any time. Leave empty to start from your success criteria." /></small></div>
      {/* Sits between the fields and the submit, where someone stuck on
          "first steps" is actually looking. It reads the form through the DOM
          and never takes the inputs over, so the form still posts without it. */}
      <MissionDraftAssist formId="new-mission-form" />
      <SubmitButton />
      <Link className="button button-quiet" href={fromOpportunity ? "/app/opportunities" : "/app"}><LocalizedText en="Cancel" /></Link>
    </form>
    {params.error === "validation" && <div className="field-error" role="alert"><LocalizedText en="Add a name, an intent of at least 12 characters, and success criteria." /></div>}
  </div></div>;
}
