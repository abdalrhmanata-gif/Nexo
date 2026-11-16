import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalizedText } from "../../../components/localized-text";
import { ShareTemplateButton } from "../../../components/share-template-button";
import { getTranslate } from "../../../lib/i18n-server";
import { missionTemplateById } from "../../../lib/mission-templates";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const template = missionTemplateById((await params).id);
  if (!template) return { title: "Mission template · Zavqera" };
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

  return (
    <div className="container templates-page">
      <p className="eyebrow"><Link href="/templates"><LocalizedText en="Mission templates" /></Link> / <LocalizedText en="Mission" /></p>

      <section className="hero template-hero-panel">
        <div>
          <p className="eyebrow">{template.featured ? <LocalizedText en="Featured Mission" /> : <LocalizedText en="Mission template" />}</p>
          <h1>{t(template.title)}</h1>
          <p>{t(template.description)}</p>
        </div>
        <div className="landing-final-actions">
          <Link className="button" href={templateHref(template, t)}><LocalizedText en="Use this Mission" /> <span aria-hidden="true">→</span></Link>
          <ShareTemplateButton title={t(template.shareTitle ?? template.title)} />
        </div>
      </section>

      <section className="grid" aria-label={t("Mission details")}>
        <article className="card">
          <p className="eyebrow"><LocalizedText en="Intent" /></p>
          <h2><LocalizedText en="What this Mission is trying to achieve" /></h2>
          <p>{t(template.intent)}</p>
        </article>
        <article className="card">
          <p className="eyebrow"><LocalizedText en="Success criteria" /></p>
          <h2><LocalizedText en="What good looks like" /></h2>
          <ul className="template-criteria">{template.criteria.map((criterion) => <li key={criterion}>{t(criterion)}</li>)}</ul>
        </article>
        <article className="card">
          <p className="eyebrow"><LocalizedText en="Bounded work" /></p>
          <h2><LocalizedText en="What Zavqera asks the Mission to do" /></h2>
          <ol className="list">{template.actions.map((action) => <li key={action}>{t(action)}</li>)}</ol>
          <div className="form-note">
            <strong><LocalizedText en="The point is not unlimited autonomy." /></strong>{" "}
            <LocalizedText en="The Mission starts with a visible goal and bounded work so the person responsible can review what happens next." />
          </div>
        </article>
      </section>

      <section className="landing-final-cta">
        <div>
          <p className="eyebrow"><LocalizedText en="Ready to try it?" /></p>
          <h2><LocalizedText en="Turn this template into your own Mission." /></h2>
          <p><LocalizedText en="Review the fields before anything is created. The template only prepares the draft." /></p>
        </div>
        <div className="landing-final-actions">
          <Link className="button" href={templateHref(template, t)}><LocalizedText en="Use this Mission" /> <span aria-hidden="true">→</span></Link>
          <ShareTemplateButton title={t(template.shareTitle ?? template.title)} />
        </div>
      </section>
    </div>
  );
}
