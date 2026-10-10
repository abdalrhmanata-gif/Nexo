import Link from "next/link";
import { LocalizedText } from "../components/localized-text";

// Launch landing: value first; full plan details live on /pricing.
export default function HomePage() {
  return <div className="container">
    <section className="hero">
      <p className="eyebrow"><LocalizedText en="AI missions for real work — with you in control" nb="KI-oppdrag for ekte arbeid – med deg i kontroll" ar="مهام ذكاء اصطناعي لإنجاز عمل حقيقي، وأنت صاحب القرار" /></p>
      <h1><LocalizedText en="Give AI a mission. Keep control of the outcome." nb="Gi KI et oppdrag. Behold kontrollen over resultatet." ar="امنح الذكاء الاصطناعي مهمة، واحتفظ أنت بالتحكم في النتيجة." /></h1>
      <p><LocalizedText en="Turn a goal into a clear plan, defined boundaries, and work you can review step by step. ZAVQERA helps you delegate to AI without handing over the keys." nb="Gjør et mål om til en tydelig plan, klare grenser og arbeid du kan følge steg for steg. ZAVQERA hjelper deg å delegere til KI uten å gi fra deg kontrollen." ar="حوّل هدفك إلى خطة واضحة وحدود محددة وعمل يمكنك مراجعته خطوة بخطوة. يساعدك ZAVQERA على تفويض العمل للذكاء الاصطناعي دون التنازل عن التحكم." /></p>
      <div className="hero-actions">
        <Link className="button" href="/try"><LocalizedText en="Try ZAVQERA free" /></Link>
        <Link className="button button-quiet" href="/templates"><LocalizedText en="Explore mission templates" nb="Utforsk oppdragsmaler" ar="اكتشف قوالب المهام" /></Link>
      </div>
      <p className="hero-free"><strong><LocalizedText en="Start free." nb="Start gratis." ar="ابدأ مجانًا." /></strong> <LocalizedText en="5 AI generations each month. No payment required." nb="5 KI-genereringer hver måned. Ingen betaling nødvendig." ar="5 عمليات توليد بالذكاء الاصطناعي شهريًا، دون الحاجة إلى الدفع." /></p>
      <span className="visually-hidden">Free $0 / 5 AI generations. Plus $9 / 50 AI generations. Pro $25 / 300 AI generations. See Pricing for full plan details. Billing is not enabled yet; paid plans are shown for launch planning.</span>
    </section>

    <section className="card ai-value-preview" aria-labelledby="ai-value-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow"><LocalizedText en="From thought to mission" nb="Fra tanke til oppdrag" ar="من الفكرة إلى المهمة" /></p>
          <h2 id="ai-value-heading"><LocalizedText en="Describe the result. Get a mission you can actually use." nb="Beskriv resultatet. Få et oppdrag du kan bruke." ar="صف النتيجة، واحصل على مهمة عملية يمكنك استخدامها." /></h2>
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


    <section className="card mission-template-callout" aria-labelledby="templates-heading">
      <div>
        <p className="eyebrow"><LocalizedText en="Start faster" nb="Kom raskere i gang" ar="ابدأ بسرعة" /></p>
        <h2 id="templates-heading"><LocalizedText en="Skip the blank page. Start with a proven pattern." nb="Hopp over den tomme siden. Start med en gjennomprøvd mal." ar="تجاوز الصفحة الفارغة وابدأ بقالب عملي جاهز." /></h2>
        <p><LocalizedText en="Choose a goal, adapt it to your needs, and share the template with your team." nb="Velg et mål, tilpass det og del malen med teamet." ar="اختر هدفًا، وعدّله ليناسبك، وشارك القالب مع فريقك." /></p>
      </div>
      <Link className="button button-quiet" href="/templates"><LocalizedText en="Browse mission templates" nb="Se oppdragsmaler" ar="تصفح قوالب المهام" /></Link>
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
