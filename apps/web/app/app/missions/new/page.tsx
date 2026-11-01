import Link from "next/link";
import { redirect } from "next/navigation";
import { LocalizedText } from "../../../../components/localized-text";
import { LocalizedInput, LocalizedTextarea } from "../../../../components/localized-form-fields";
import { createSupabaseMissionRepository } from "../../../../lib/supabase/mission-repository";
import { composeMissionObjective, validateMissionDraft } from "../../../../lib/mission-content.mjs";

type NewMissionSearchParams = {
  error?: string;
  field?: string;
  fromOpportunity?: string;
  name?: string;
  intent?: string;
  criteria?: string;
  actions?: string;
};

async function createMission(formData: FormData) {
  "use server";
  const draft = validateMissionDraft({
    name: formData.get("name"),
    intent: formData.get("intent"),
    criteria: formData.get("criteria"),
    actions: formData.get("actions"),
  });

  if (!draft.valid) {
    const field = ["name", "intent", "criteria", "actions"].find((key) => draft.errors[key as keyof typeof draft.errors]) ?? "name";
    const fromOpportunity = formData.get("fromOpportunity") === "1" ? "&fromOpportunity=1" : "";
    redirect("/app/missions/new?error=validation&field=" + field + fromOpportunity);
  }

  const { name, intent, criteria, actions: steps } = draft.values;
  const toLines = (value: string) => value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const successCriteria = toLines(criteria);
  const actions = steps ? toLines(steps) : successCriteria;
  const repository = await createSupabaseMissionRepository();
  const mission = await repository.createMission!({
    objective: composeMissionObjective({ name, intent, criteria: successCriteria }),
    actions,
  });
  redirect("/app/missions/" + mission.id);
}

function SubmitButton() {
  return <button className="button mission-create-submit" type="submit"><LocalizedText en="Create mission" /> <span aria-hidden="true">→</span></button>;
}

export default async function NewMissionPage({ searchParams }: { searchParams: Promise<NewMissionSearchParams> }) {
  const params = await searchParams;
  const fromOpportunity = params.fromOpportunity === "1";
  const fields = ["name", "intent", "criteria", "actions"] as const;
  const field = fields.includes(params.field as typeof fields[number]) ? params.field as typeof fields[number] : null;
  const errorCopy = {
    name: "Add a mission name between 1 and 100 characters, on one line.",
    intent: "Write an intent between 12 and 3,000 characters.",
    criteria: "Add at least one success criterion, within 2,000 characters.",
    actions: "Keep first steps within 2,000 characters.",
  };

  return <div className="container mission-create-page">
    <p className="eyebrow mission-create-breadcrumb">
      <Link href="/app"><LocalizedText en="Workspace" /></Link> / <Link href="/app/opportunities"><LocalizedText en="Opportunity Intelligence" /></Link> / <LocalizedText en="New mission" />
    </p>
    <header className="mission-create-header">
      <p className="eyebrow"><LocalizedText en="Mission setup" /></p>
      <h1 className="detail-title">{fromOpportunity ? <LocalizedText en="Validate the opportunity." /> : <LocalizedText en="Build a Mission you can act on." />}</h1>
      <p className="detail-intent">{fromOpportunity
        ? <LocalizedText en="Review the evidence and assumptions, then define what would make this opportunity worth pursuing." />
        : <LocalizedText en="Start with the outcome, decide how you’ll recognise success, and add only the first steps you already know." />}</p>
    </header>

    {fromOpportunity && <div className="opportunity-form-origin mission-create-origin">
      <strong><LocalizedText en="Started from Opportunity Intelligence." /></strong>
      <LocalizedText en="The priority score is a rule-based decision aid, not a verified forecast. Review every field and confirm the source before creating the Mission." />
    </div>}

    <div className="mission-create-layout">
      <form className="form form-grid mission-create-form" action={createMission}>
        {fromOpportunity && <input type="hidden" name="fromOpportunity" value="1" />}
        {params.error === "validation" && <div className="field-error mission-form-error" role="alert"><LocalizedText en="Please correct the highlighted field and try again." /></div>}

        <section className="mission-form-section" aria-labelledby="mission-section-goal">
          <div className="mission-form-section-heading">
            <span>01</span>
            <div><h2 id="mission-section-goal"><LocalizedText en="Define the goal" /></h2><p><LocalizedText en="Give it a clear name and explain the outcome you want." /></p></div>
          </div>
          <div className="field">
            <label htmlFor="name"><LocalizedText en="Mission name" /></label>
            <LocalizedInput id="name" name="name" defaultValue={params.name ?? ""} maxLength={100} placeholder="e.g. Renew my passport" required aria-invalid={field === "name"} aria-describedby={field === "name" ? "name-help name-error" : "name-help"} />
            <small id="name-help"><LocalizedText en="100 characters maximum. Choose a name you will recognise later." /></small>
            {field === "name" && <p className="mission-field-error" id="name-error"><LocalizedText en={errorCopy.name} /></p>}
          </div>
          <div className="field">
            <label htmlFor="intent"><LocalizedText en="Intent" /></label>
            <LocalizedTextarea id="intent" name="intent" defaultValue={params.intent ?? ""} minLength={12} maxLength={3000} placeholder="What should this mission help you accomplish?" required aria-invalid={field === "intent"} aria-describedby={field === "intent" ? "intent-help intent-error" : "intent-help"} />
            <small id="intent-help"><LocalizedText en="12–3,000 characters. Include the decision or outcome you want to reach." /></small>
            {field === "intent" && <p className="mission-field-error" id="intent-error"><LocalizedText en={errorCopy.intent} /></p>}
          </div>
        </section>

        <section className="mission-form-section" aria-labelledby="mission-section-success">
          <div className="mission-form-section-heading">
            <span>02</span>
            <div><h2 id="mission-section-success"><LocalizedText en="Make success measurable" /></h2><p><LocalizedText en="Write the evidence that would tell you the Mission worked." /></p></div>
          </div>
          <div className="field">
            <label htmlFor="criteria"><LocalizedText en="Success criteria" /></label>
            <LocalizedTextarea id="criteria" name="criteria" defaultValue={params.criteria ?? ""} maxLength={2000} placeholder="One criterion per line" required aria-invalid={field === "criteria"} aria-describedby={field === "criteria" ? "criteria-help criteria-error" : "criteria-help"} />
            <small id="criteria-help"><LocalizedText en="2,000 characters maximum. One observable success criterion per line." /></small>
            {field === "criteria" && <p className="mission-field-error" id="criteria-error"><LocalizedText en={errorCopy.criteria} /></p>}
          </div>
        </section>

        <section className="mission-form-section" aria-labelledby="mission-section-actions">
          <div className="mission-form-section-heading">
            <span>03</span>
            <div><h2 id="mission-section-actions"><LocalizedText en="Choose your first steps" /></h2><p><LocalizedText en="Add the next actions you know today. You can add more later." /></p></div>
          </div>
          <div className="field">
            <label htmlFor="actions"><LocalizedText en="First steps" /> <span className="field-optional"><LocalizedText en="optional" /></span></label>
            <LocalizedTextarea id="actions" name="actions" defaultValue={params.actions ?? ""} maxLength={2000} placeholder="One step per line" aria-invalid={field === "actions"} aria-describedby={field === "actions" ? "actions-help actions-error" : "actions-help"} />
            <small id="actions-help"><LocalizedText en="2,000 characters maximum. One action per line. Leave empty to use your success criteria as the initial actions." /></small>
            {field === "actions" && <p className="mission-field-error" id="actions-error"><LocalizedText en={errorCopy.actions} /></p>}
          </div>
        </section>

        <div className="mission-create-form-footer">
          <p><LocalizedText en="Review the details above. Creating a Mission records the outcome and its first steps in your private workspace." /></p>
          <div className="mission-create-actions">
            <SubmitButton />
            <Link className="button button-quiet" href={fromOpportunity ? "/app/opportunities" : "/app"}><LocalizedText en="Cancel" /></Link>
          </div>
        </div>
      </form>

      <aside className="mission-create-aside" aria-label="Mission guidance">
        <p className="eyebrow"><LocalizedText en="Your Mission at a glance" /></p>
        <h2><LocalizedText en="Make the next decision easier." /></h2>
        <div className="mission-create-guidance">
          <article><span>01</span><div><strong><LocalizedText en="Outcome first" /></strong><p><LocalizedText en="Keep the goal specific enough that you can recognise when it is reached." /></p></div></article>
          <article><span>02</span><div><strong><LocalizedText en="Success you can check" /></strong><p><LocalizedText en="Use observable results, not vague intentions." /></p></div></article>
          <article><span>03</span><div><strong><LocalizedText en="Start with what you know" /></strong><p><LocalizedText en="First steps are a starting point, not a promise that work has started." /></p></div></article>
        </div>
        <div className="mission-create-aside-note">
          <strong><LocalizedText en="Review before you create" /></strong>
          <p><LocalizedText en="Check the details, then create the Mission in your private workspace." /></p>
        </div>
      </aside>
    </div>
  </div>;
}
