import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalizedText } from "../../../components/localized-text";
import { ShareTemplateButton } from "../../../components/share-template-button";
import { getLanguage, getTranslate } from "../../../lib/i18n-server";
import { guidePath, isGuideLanguage } from "../../../lib/guides";
import { missionTemplateById } from "../../../lib/mission-templates";
import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { savePlan } from "../../app/start/actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const template = missionTemplateById((await params).id);
  if (!template) return { title: "Zavqera" };
  return {
    title: `${template.title} · Zavqera`,
    description: template.shareDescription ?? template.description,
    openGraph: {
      title: template.shareTitle ?? template.title,
      description: template.shareDescription ?? template.description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: template.shareTitle ?? template.title,
      description: template.shareDescription ?? template.description,
    },
  };
}

function templateHref(template: ReturnType<typeof missionTemplateById>, t: (en: string) => string) {
  if (!template) return "/templates";
  const params = new URLSearchParams({
    name: t(template.title),
    intent: t(template.intent),
    criteria: template.criteria.map((criterion) => t(criterion)).join("\n"),
    actions: template.actions.map((action) => t(action)).join("\n"),
  });
  return `/app/missions/new?${params.toString()}`;
}

export default async function MissionTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslate();
  const template = missionTemplateById((await params).id);
  if (!template) notFound();
  const language = await getLanguage();
  // The country-specific version of this template, with official sources.
  const germanyGuide = template.id === "settle-new-country"
    ? guidePath(isGuideLanguage(language) ? language : "en", "moving-to-germany-checklist")
    : null;

  return (
    <div className="container templates-page">
      <p className="eyebrow"><Link href="/templates"><LocalizedText en="Mission templates" /></Link> / <LocalizedText en="Mission" /></p>

      <section className="hero template-hero-panel">
        <div>
          <p className="eyebrow">{template.featured ? <LocalizedText en="Mission template" /> : <LocalizedText en="Mission template" />}</p>
          <h1>{t(template.title)}</h1>
          <p>{t(template.description)}</p>
          {germanyGuide && <p><Link className="landing-template-link" href={germanyGuide}><LocalizedText en="Moving to Germany? Read the step-by-step guide with official sources" /> <span aria-hidden="true">→</span></Link></p>}
        </div>
        <div className="landing-final-actions">
          <form action={savePlan} className="template-use-form">
            <input type="hidden" name="template" value={template.id} />
            <input type="hidden" name="lang" value={language} />
            <PendingSubmitButton label="Use this template" pendingLabel="Saving…" />
            <Link className="button button-quiet" href={templateHref(template, t)} prefetch={false}><LocalizedText en="Edit before saving" /></Link>
          </form>
          <ShareTemplateButton title={t(template.shareTitle ?? template.title)} />
        </div>
      </section>

      <section className="grid" aria-label={t("Mission templates")}>
        <article className="card">
          <p className="eyebrow"><LocalizedText en="Intent" /></p>
          <h2><LocalizedText en="Intent" /></h2>
          <p>{t(template.intent)}</p>
        </article>
        <article className="card">
          <p className="eyebrow"><LocalizedText en="Success criteria" /></p>
          <h2><LocalizedText en="What good looks like" /></h2>
          <ul className="template-criteria">{template.criteria.map((criterion) => <li key={criterion}>{t(criterion)}</li>)}</ul>
        </article>
        <article className="card">
          <p className="eyebrow"><LocalizedText en="Actions" /></p>
          <h2><LocalizedText en="Actions" /></h2>
          <ol className="list">{template.actions.map((action) => <li key={action}>{t(action)}</li>)}</ol>
          <div className="form-note">
            <LocalizedText en="Review before action. Clear boundaries. No false certainty." />
          </div>
        </article>
      </section>

      <section className="landing-final-cta">
        <div>
          <p className="eyebrow"><LocalizedText en="Start with one Mission" /></p>
          <h2><LocalizedText en="Start with a useful first plan." /></h2>
          <p><LocalizedText en="A template only pre-fills a draft. Nothing is created until you review it and submit the mission form." /></p>
        </div>
        <div className="landing-final-actions">
          <form action={savePlan} className="template-use-form">
            <input type="hidden" name="template" value={template.id} />
            <input type="hidden" name="lang" value={language} />
            <PendingSubmitButton label="Use this template" pendingLabel="Saving…" />
            <Link className="button button-quiet" href={templateHref(template, t)} prefetch={false}><LocalizedText en="Edit before saving" /></Link>
          </form>
          <ShareTemplateButton title={t(template.shareTitle ?? template.title)} />
        </div>
      </section>
    </div>
  );
}
