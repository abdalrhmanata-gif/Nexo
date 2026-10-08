import Link from "next/link";
import { LocalizedText } from "../components/localized-text";

// Launch landing: value first; full plan details live on /pricing.
export default function HomePage() {
  return <div className="container">
    <section className="hero">
      <p className="eyebrow"><LocalizedText en="Bounded AI work for people and teams" nb="Avgrenset KI-arbeid for personer og team" ar="عمل بالذكاء الاصطناعي بحدود واضحة للأفراد والفرق" /></p>
      <h1><LocalizedText en="Give AI work to do, not just questions to answer." nb="Gi KI arbeid å gjøre, ikke bare spørsmål å svare på." ar="أعطِ الذكاء الاصطناعي عملاً لينجزه، وليس أسئلة فقط ليجيب عنها." /></h1>
      <p><LocalizedText en="ZAVQERA turns plain-language goals into bounded missions you can review, run, and verify." nb="ZAVQERA gjør mål skrevet med vanlig språk om til avgrensede oppdrag du kan gjennomgå, kjøre og verifisere." ar="يحوّل ZAVQERA أهدافك بلغة طبيعية إلى مهام بحدود واضحة يمكنك مراجعتها وتنفيذها والتحقق منها." /></p>
      <div className="hero-actions">
        <Link className="button" href="/try"><LocalizedText en="Try ZAVQERA free" /></Link>
        <Link className="button button-quiet" href="/pricing"><LocalizedText en="View pricing" /></Link>
      </div>
      <p className="hero-free"><strong><LocalizedText en="Free to start." /></strong> <LocalizedText en="5 AI generations each month. No payment required." /></p>
      <span className="visually-hidden">Free $0 / 5 AI generations. Plus $9 / 50 AI generations. Pro $25 / 300 AI generations. See Pricing for full plan details. Billing is not enabled yet; paid plans are shown for launch planning.</span>
    </section>

    <section className="card ai-value-preview" aria-labelledby="ai-value-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow"><LocalizedText en="From thought to mission" nb="Fra tanke til oppdrag" ar="من الفكرة إلى المهمة" /></p>
          <h2 id="ai-value-heading"><LocalizedText en="You describe the outcome. ZAVQERA prepares the mission." nb="Du beskriver resultatet. ZAVQERA gjør oppdraget klart." ar="تصف النتيجة. وZAVQERA تجهز المهمة." /></h2>
        </div>
        <p><LocalizedText en="No project-management setup required." nb="Ingen prosjektstyring nødvendig." ar="لا حاجة لإعدادات معقدة لإدارة المشاريع." /></p>
      </div>
      <div className="ai-value-grid">
        <div className="ai-value-input">
          <span className="ai-value-label"><LocalizedText en="You say" nb="Du sier" ar="أنت تقول" /></span>
          <p>“<LocalizedText en="I want to launch a small online shop in six weeks." nb="Jeg vil lansere en liten nettbutikk innen seks uker." ar="أريد إطلاق متجر إلكتروني صغير خلال ستة أسابيع." />”</p>
        </div>
        <div className="ai-value-arrow" aria-hidden="true">→</div>
        <div className="ai-value-output">
          <span className="ai-value-label"><LocalizedText en="ZAVQERA prepares" nb="ZAVQERA lager" ar="ZAVQERA تُعدّ" /></span>
          <ul>
            <li><LocalizedText en="A clear mission and intent" nb="Et tydelig oppdrag og mål" ar="مهمة وهدف واضحان" /></li>
            <li><LocalizedText en="Success criteria" nb="Suksesskriterier" ar="معايير النجاح" /></li>
            <li><LocalizedText en="Practical first steps" nb="Praktiske første steg" ar="خطوات عملية أولى" /></li>
            <li><LocalizedText en="Clear boundaries before execution" nb="Tydelige grenser før kjøring" ar="حدود واضحة قبل التنفيذ" /></li>
          </ul>
        </div>
      </div>
      <p className="ai-value-trust"><LocalizedText en="You review and edit the draft. Nothing is created or executed until you decide." nb="Du gjennomgår og redigerer utkastet. Ingenting opprettes eller utføres før du bestemmer deg." ar="أنت تراجع المسودة وتعدلها. لا يتم إنشاء أي شيء أو تنفيذه قبل قرارك." /></p>
    </section>

    <section className="value-grid" aria-label="Product principles">
      <article className="card value-card">
        <p className="eyebrow"><LocalizedText en="01 · Intent" /></p>
        <h2><LocalizedText en="Start with the outcome." /></h2>
        <p><LocalizedText en="Tell ZAVQERA what you want in plain language. The structure comes after." /></p>
      </article>
      <article className="card value-card">
        <p className="eyebrow"><LocalizedText en="02 · Control" /></p>
        <h2><LocalizedText en="Review before action." /></h2>
        <p><LocalizedText en="AI can draft. You decide what gets created and what moves." /></p>
      </article>
      <article className="card value-card">
        <p className="eyebrow"><LocalizedText en="03 · Clarity" /></p>
        <h2><LocalizedText en="See what needs attention." /></h2>
        <p><LocalizedText en="Keep long-running work understandable instead of turning it into a black box." /></p>
      </article>
    </section>
  </div>;
}
