import Link from "next/link";
import { LocalizedText } from "../../components/localized-text";
import { getLanguage, getTranslate } from "../../lib/i18n-server";
import { missionTemplates } from "../../lib/mission-templates";
import { PendingSubmitButton } from "../../components/pending-submit-button";
import { savePlan } from "../app/start/actions";

function TemplateIcon({ id }: { id: string }) {
  if (id === "business-opportunity-scan") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4M8 11h6M11 8v6" /></svg>;
  if (id === "launch-plan") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 10 4l4 7 6 2-16 7Z" /><path d="m10 4 4 7" /></svg>;
  if (id === "settle-new-country") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-5h4v5" /></svg>;
  if (id === "find-a-job") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></svg>;
  if (id === "organise-an-event") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4" /></svg>;
  if (id === "research-decision") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5M8 10.5h5M10.5 8v5" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h10M4 19h6" /><circle cx="18" cy="12" r="2" /><circle cx="14" cy="19" r="2" /></svg>;
}

export default async function TemplatesPage() {
  const t = await getTranslate();
  const language = await getLanguage();
  return <div className="container templates-page">
    <section className="hero template-hero-panel">
      <p className="eyebrow"><LocalizedText en="Mission templates" /></p>
      <h1><LocalizedText en="Start with a useful first plan." /></h1>
      <p><LocalizedText en="Choose a starting point. It is saved as a mission you can change: edit any step, add your own, or delete it." /></p>
      <p className="action-hint own-templates-teaser"><Link href="/app/templates"><LocalizedText en="Your own templates" /></Link>{" · "}<LocalizedText en="Save any Mission as a template and reuse it in one press, on Pro and Scale." /></p>
    </section>
    <section className="grid" aria-label={t("Mission templates")}>
      {missionTemplates.map((template) => <article className={`card template-card${template.featured ? " template-card-featured" : ""}`} key={template.id}>
        <div className={`template-icon template-icon-${template.id}`}><TemplateIcon id={template.id} /></div>
        <p className="eyebrow">{template.featured ? <LocalizedText en="Mission template" /> : <LocalizedText en="Mission template" />}</p>
        <h2><LocalizedText en={template.title} /></h2>
        <p><LocalizedText en={template.description} /></p>
        <ul className="template-criteria">{template.criteria.map((criterion) => <li key={criterion}><LocalizedText en={criterion} /></li>)}</ul>
        <div className="template-card-actions">
          <Link className="button" href={`/templates/${template.id}`}><LocalizedText en="Open mission" /></Link>
          {/* One press saves it, signed in or not: without an account the
              press goes through sign-up and the plan is saved after it. */}
          <form action={savePlan}>
            <input type="hidden" name="template" value={template.id} />
            <input type="hidden" name="lang" value={language} />
            <PendingSubmitButton className="button button-quiet" label="Use this template" pendingLabel="Saving…" />
          </form>
        </div>
      </article>)}
    </section>
    <p className="action-hint template-note"><LocalizedText en="Using a template saves it as a mission in your workspace. Nothing happens outside it, and every step can be changed." /></p>
  </div>;
}
