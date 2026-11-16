import Link from "next/link";
import { LocalizedText } from "../../components/localized-text";
import { getTranslate } from "../../lib/i18n-server";
import { missionTemplates } from "../../lib/mission-templates";

function TemplateIcon({ id }: { id: string }) {
  if (id === "business-opportunity-scan") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m16.5 16.5 4 4M8 11h6M11 8v6" /></svg>;
  if (id === "launch-plan") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20 10 4l4 7 6 2-16 7Z" /><path d="m10 4 4 7" /></svg>;
  if (id === "research-decision") return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5M8 10.5h5M10.5 8v5" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 12h10M4 19h6" /><circle cx="18" cy="12" r="2" /><circle cx="14" cy="19" r="2" /></svg>;
}

function templateHref(template: typeof missionTemplates[number], t: (en: string) => string) {
  const params = new URLSearchParams({
    name: t(template.title),
    intent: t(template.intent),
    criteria: template.criteria.map((criterion) => t(criterion)).join("\n"),
    actions: template.actions.map((action) => t(action)).join("\n"),
  });
  return `/app/missions/new?${params.toString()}`;
}

export default async function TemplatesPage() {
  const t = await getTranslate();
  return <div className="container templates-page">
    <section className="hero template-hero-panel">
      <p className="eyebrow"><LocalizedText en="Mission templates" /></p>
      <h1><LocalizedText en="Start with a useful first plan." /></h1>
      <p><LocalizedText en="Choose a starting point, review every field, and keep control of the mission before you create it." /></p>
      <p className="action-hint"><LocalizedText en="Start with a useful first plan." /></p>
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
          <Link className="button button-quiet" href={templateHref(template, t)}><LocalizedText en="Use this template" /></Link>
        </div>
      </article>)}
    </section>
    <p className="action-hint template-note"><LocalizedText en="A template only pre-fills a draft. Nothing is created until you review it and submit the mission form." /></p>
  </div>;
}
