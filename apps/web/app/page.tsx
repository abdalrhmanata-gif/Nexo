import Link from "next/link";
import { LocalizedText } from "../components/localized-text";

// Launch landing: value first; full plan details live on /pricing.
export default function HomePage() {
  return <div className="container">
    <section className="hero">
      <p className="eyebrow"><LocalizedText en="Mission control for autonomous AI" /></p>
      <h1><LocalizedText en="Clear goals. Practical plans. You’re in control." /></h1>
      <p><LocalizedText en="ZAVQERA turns a rough goal into a structured mission you can review before anything moves." /></p>
      <div className="hero-actions">
        <Link className="button" href="/auth/sign-up"><LocalizedText en="Try ZAVQERA free" /></Link>
        <Link className="button button-quiet" href="/pricing"><LocalizedText en="View pricing" /></Link>
      </div>
      <p className="hero-free"><strong><LocalizedText en="Free to start." /></strong> <LocalizedText en="5 AI generations each month. No payment required." /></p>
      <span className="visually-hidden">Free $0 / 5 AI generations. Plus $9 / 50 AI generations. Pro $25 / 300 AI generations. See Pricing for full plan details. Billing is not enabled yet; paid plans are shown for launch planning.</span>
    </section>

    <section className="card ai-value-preview" aria-labelledby="ai-value-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow"><LocalizedText en="From thought to mission" /></p>
          <h2 id="ai-value-heading"><LocalizedText en="You explain it. ZAVQERA structures it." /></h2>
        </div>
        <p><LocalizedText en="No project-management setup required." /></p>
      </div>
      <div className="ai-value-grid">
        <div className="ai-value-input">
          <span className="ai-value-label"><LocalizedText en="You say" /></span>
          <p>“<LocalizedText en="I want to launch a small online shop in six weeks." />”</p>
        </div>
        <div className="ai-value-arrow" aria-hidden="true">→</div>
        <div className="ai-value-output">
          <span className="ai-value-label"><LocalizedText en="ZAVQERA prepares" /></span>
          <ul>
            <li><LocalizedText en="A clear mission and intent" /></li>
            <li><LocalizedText en="Success criteria" /></li>
            <li><LocalizedText en="Practical first steps" /></li>
          </ul>
        </div>
      </div>
      <p className="ai-value-trust"><LocalizedText en="You review and edit the draft. Nothing is created or executed until you decide." /></p>
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
