import Link from "next/link";
import { LocalizedText } from "../../components/localized-text";
import { MISSION_TEMPLATES } from "../../lib/mission-templates";
import { ShareTemplateButton } from "../../components/share-template-button";

export default function TemplatesPage() {
  return <div className="container templates-page">
    <section className="hero template-hero-panel">
      <p className="eyebrow"><LocalizedText en="Mission templates" nb="Oppdragsmaler" ar="قوالب المهام" /></p>
      <h1><LocalizedText en="Start with a mission someone already made useful." nb="Start med et oppdrag som allerede er nyttig." ar="ابدأ بمهمة مفيدة وجاهزة." /></h1>
      <p><LocalizedText en="Use a template, change the details, and let ZAVQERA turn it into a mission you control." nb="Bruk en mal, endre detaljene og la ZAVQERA gjøre den om til et oppdrag du kontrollerer." ar="استخدم قالبًا، عدّل التفاصيل، ودع ZAVQERA يحوله إلى مهمة تحت سيطرتك." /></p>
    </section>

    <section className="value-grid" aria-label="Mission templates">
      {MISSION_TEMPLATES.map((template) => <article className="card value-card" key={template.id}>
        <p className="eyebrow"><LocalizedText en={template.category} /> · <LocalizedText en="Mission" /></p>
        <h2><LocalizedText en={template.title} /></h2>
        <p><LocalizedText en={template.description} /></p>
        <p className="template-goal">“<LocalizedText en={template.goal} />”</p>
        <div className="template-actions"><Link className="button" href={"/try?template=" + encodeURIComponent(template.id)}>
          <LocalizedText en="Try this mission" nb="Prøv dette oppdraget" ar="جرّب هذه المهمة" />
        </Link><ShareTemplateButton templateId={template.id} title={template.title} /></div>
      </article>)}
    </section>

    <section className="card pricing-note">
      <h2><LocalizedText en="Make your own" nb="Lag ditt eget" ar="أنشئ مهمتك الخاصة" /></h2>
      <p><LocalizedText en="You do not need to copy a template. Describe any outcome in your own words and ZAVQERA will build the first draft." nb="Du trenger ikke kopiere en mal. Beskriv et hvilket som helst mål med egne ord, så lager ZAVQERA første utkast." ar="لا تحتاج إلى نسخ قالب. اشرح أي نتيجة تريدها بكلماتك، وسيبني ZAVQERA المسودة الأولى." /></p>
      <Link className="button button-quiet" href="/try"><LocalizedText en="Describe my own mission" /></Link>
    </section>
  </div>;
}
