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
      <p className="template-preview-note"><LocalizedText en="Preview a free AI plan before signing up. Your shared link opens this exact template, ready to review." nb="Forhåndsvis en gratis KI-plan før du registrerer deg. Delingslenken åpner akkurat denne malen, klar til gjennomgang." ar="عاين خطة مجانية بالذكاء الاصطناعي قبل التسجيل. يفتح رابط المشاركة هذا القالب نفسه جاهزًا للمراجعة." /></p>
    </section>

    <section className="value-grid" aria-label="Mission templates">
      {MISSION_TEMPLATES.map((template) => <article className="card value-card" key={template.id}>
        <p className="eyebrow"><LocalizedText en={template.category} /> · <LocalizedText en="Mission" /></p>
        <h2><LocalizedText en={template.title} /></h2>
        <p><LocalizedText en={template.description} /></p>
        <p className="template-goal">“<LocalizedText en={template.goal} />”</p>
        <div className="template-actions"><Link className="button" href={"/try?template=" + encodeURIComponent(template.id)}>
          <LocalizedText en="Preview & try free" nb="Forhåndsvis og prøv gratis" ar="عاين وجرّب مجانًا" />
        </Link><ShareTemplateButton templateId={template.id} title={template.title} /></div>
      </article>)}
    </section>

    <section className="card pricing-note">
      <h2><LocalizedText en="Make your own" nb="Lag ditt eget" ar="أنشئ مهمتك الخاصة" /></h2>
      <p><LocalizedText en="You do not need to copy a template. Describe any outcome in your own words and ZAVQERA will build the first draft." nb="Du trenger ikke kopiere en mal. Beskriv et hvilket som helst mål med egne ord, så lager ZAVQERA første utkast." ar="لا تحتاج إلى نسخ قالب. اشرح أي نتيجة تريدها بكلماتك، وسيبني ZAVQERA المسودة الأولى." /></p>
      <Link className="button button-quiet" href="/try"><LocalizedText en="Describe my own mission" nb="Beskriv mitt eget oppdrag" ar="صف مهمتي الخاصة" /></Link>
      <p className="action-hint"><LocalizedText en="For signed-in users, we count successful template shares in aggregate. Mission text and prompts are never sent to product metrics." nb="For innloggede brukere teller vi vellykkede maldelinger aggregert. Oppdragstekst og spørsmål sendes aldri til produktmåling." ar="للمستخدمين المسجلين، نحتسب مشاركات القوالب الناجحة بشكل إجمالي. لا نرسل نص المهمة أو المطالبات إلى قياسات المنتج." /></p>
    </section>
  </div>;
}
