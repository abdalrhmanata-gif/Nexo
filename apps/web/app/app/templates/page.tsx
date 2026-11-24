import Link from "next/link";
import { LocalizedDateTime, LocalizedFill, LocalizedText } from "../../../components/localized-text";
import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { getTranslate } from "../../../lib/i18n-server";
import { hasOwnTemplates, OWN_TEMPLATE_BOUNDS, OWN_TEMPLATE_LIMIT } from "../../../lib/own-templates.mjs";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createOwnTemplateRepository, readCurrentPlan, type OwnTemplate } from "../../../lib/supabase/own-template-repository";
import { deleteOwnTemplate, renameOwnTemplate, startFromOwnTemplate } from "./actions";

// Per person and per request: the list and the plan are the reader's own.
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  plan: "Your own templates are part of Pro and Scale. Your templates are kept, and you can delete them at any time.",
  missing: "That template is no longer there. It may have been deleted.",
  name: "Give the template a name.",
  limit: "You have reached 100 templates. Delete one you no longer use to save another.",
  failed: "That did not work just now. Please try again.",
};

const PREVIEW_STEPS = 3;

function TemplateCard({ template, active }: { template: OwnTemplate; active: boolean }) {
  const more = template.actions.length - PREVIEW_STEPS;
  return <article className="card own-template-card">
    <h2>{template.name}</h2>
    {template.intent && <p className="detail-intent own-template-intent">{template.intent}</p>}
    <p className="action-hint">
      <LocalizedFill en={template.actions.length === 1 ? "{count} step" : "{count} steps"} values={{ count: template.actions.length }} />
      {template.criteria.length > 0 && <> · <LocalizedFill en={template.criteria.length === 1 ? "{count} success criterion" : "{count} success criteria"} values={{ count: template.criteria.length }} /></>}
      {" · "}<LocalizedText en="Updated" /> <LocalizedDateTime value={template.updatedAt} />
    </p>
    <ol className="own-template-steps">
      {template.actions.slice(0, PREVIEW_STEPS).map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}
    </ol>
    {more > 0 && <p className="action-hint"><LocalizedFill en={more === 1 ? "and {count} more step" : "and {count} more steps"} values={{ count: more }} /></p>}
    <div className="own-template-actions">
      {active && <form action={startFromOwnTemplate}>
        <input type="hidden" name="id" value={template.id} />
        <PendingSubmitButton label="Start a Mission from it" pendingLabel="Creating…" />
      </form>}
      {active && <details className="own-template-more">
        <summary><LocalizedText en="Rename" /></summary>
        <form action={renameOwnTemplate} className="own-template-inline-form">
          <input type="hidden" name="id" value={template.id} />
          <label className="visually-hidden" htmlFor={`rename-${template.id}`}><LocalizedText en="Template name" /></label>
          <input id={`rename-${template.id}`} name="name" defaultValue={template.name} maxLength={OWN_TEMPLATE_BOUNDS.name} required />
          <PendingSubmitButton className="button button-small" label="Save name" pendingLabel="Saving…" />
        </form>
      </details>}
      <details className="own-template-more">
        <summary><LocalizedText en="Delete" /></summary>
        <form action={deleteOwnTemplate} className="own-template-inline-form">
          <input type="hidden" name="id" value={template.id} />
          <span><LocalizedText en="Delete this template permanently? This cannot be undone. Missions already started from it stay as they are." /></span>
          <PendingSubmitButton className="button button-small button-danger" label="Delete template" pendingLabel="Deleting…" />
        </form>
      </details>
    </div>
  </article>;
}

export default async function OwnTemplatesPage({ searchParams }: { searchParams: Promise<{ saved?: string; renamed?: string; deleted?: string; error?: string }> }) {
  const t = await getTranslate();
  const params = await searchParams;
  const configured = isSupabaseConfigured();
  const plan = configured ? await readCurrentPlan() : "free";
  const active = hasOwnTemplates(plan);
  let templates: OwnTemplate[] = [];
  let unreadable = false;
  if (configured) {
    try {
      templates = await (await createOwnTemplateRepository()).list();
    } catch {
      unreadable = true;
    }
  }
  const error = params.error ? ERRORS[params.error] ?? ERRORS.failed : null;

  return <div className="container own-templates-page">
    <p className="eyebrow"><Link href="/app"><LocalizedText en="Workspace" /></Link> <LocalizedText en="/ Your templates" /></p>
    <section className="own-templates-hero">
      <h1 className="detail-title"><LocalizedText en="Your own templates" /></h1>
      <p className="detail-intent"><LocalizedText en="Save any Mission as a template and start the next one in one press, with its intent, success criteria and steps already in place." /></p>
      {active && templates.length > 0 && <p className="action-hint"><LocalizedFill en="{count} of {limit} templates" values={{ count: templates.length, limit: OWN_TEMPLATE_LIMIT }} /></p>}
    </section>

    {params.saved && <div className="success-state" role="status"><strong><LocalizedText en="Saved as your template." /></strong> <LocalizedText en="Start a new Mission from it whenever you need the same plan again." /></div>}
    {params.renamed === "1" && <div className="success-state" role="status"><LocalizedText en="Template renamed." /></div>}
    {params.deleted === "1" && <div className="success-state" role="status"><LocalizedText en="Template deleted." /></div>}
    {error && <div className="field-error" role="alert"><LocalizedText en={error} /></div>}
    {unreadable && <div className="field-error" role="alert"><LocalizedText en="Your templates could not be loaded just now. Please refresh the page." /></div>}

    {!active && <section className="card own-templates-locked" aria-labelledby="own-templates-locked-heading">
      <p className="eyebrow"><LocalizedText en="Pro and Scale" /></p>
      <h2 id="own-templates-locked-heading"><LocalizedText en="Plan it once. Reuse it every time." /></h2>
      <ul className="own-templates-benefits">
        <li><LocalizedText en="Save any Mission as your own template, with its steps and success criteria." /></li>
        <li><LocalizedText en="Start the next Mission from it in one press, instead of writing it again." /></li>
        <li><LocalizedText en="Keep up to 100 templates, private to you." /></li>
      </ul>
      <Link className="button" href="/pricing"><LocalizedText en="See Pro and Scale" /></Link>
      {templates.length > 0 && <p className="action-hint"><LocalizedText en="Your templates below are kept. Move back to Pro or Scale to use or rename them; you can delete them on any plan." /></p>}
    </section>}

    {active && !unreadable && templates.length === 0 && <section className="card own-templates-empty">
      <h2><LocalizedText en="No templates yet" /></h2>
      <p><LocalizedText en="Open a Mission you want to repeat and press “Save as my template”. Its intent, success criteria and steps are saved; the progress and proof stay with the Mission." /></p>
      <Link className="button" href="/app"><LocalizedText en="Go to your Missions" /></Link>
    </section>}

    {templates.length > 0 && <section className="grid own-templates-grid" aria-label={t("Your own templates")}>
      {templates.map((template) => <TemplateCard key={template.id} template={template} active={active} />)}
    </section>}
  </div>;
}
