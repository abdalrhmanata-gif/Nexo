import Link from "next/link";
import { LocalizedText } from "../components/localized-text";

export default function HomePage() {
  return <div className="container">
    <section className="hero">
      <p className="eyebrow"><LocalizedText en="Mission control for autonomous AI" /></p>
      <h1><LocalizedText en="Clear goals. Practical plans. You’re in control." /></h1>
      <p><LocalizedText en="ZAVQERA gives teams a quiet, legible place to shape long-running AI work and see what is happening before it becomes action." /></p>
      <p><Link className="button" href="/app"><LocalizedText en="Open workspace" /></Link></p>
    </section>

    <section className="pricing" aria-labelledby="pricing-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow"><LocalizedText en="Launch plans" /></p>
          <h2 id="pricing-heading"><LocalizedText en="Simple plans. Predictable AI usage." /></h2>
        </div>
        <p><LocalizedText en="Billing is not enabled yet; paid plans are shown for launch planning." /></p>
      </div>

      <div className="pricing-grid">
        <article className="pricing-card">
          <p className="pricing-name"><LocalizedText en="Free" /></p>
          <div className="pricing-price"><strong>$0</strong><span><LocalizedText en="per month" /></span></div>
          <p className="pricing-allowance"><strong>5</strong> <LocalizedText en="AI generations per month" /></p>
          <ul>
            <li><LocalizedText en="Core mission workspace" /></li>
            <li><LocalizedText en="Hard monthly AI limit" /></li>
            <li><LocalizedText en="Review before anything is created" /></li>
          </ul>
          <Link className="button button-quiet pricing-cta" href="/auth/sign-up"><LocalizedText en="Start free" /></Link>
        </article>

        <article className="pricing-card pricing-card-featured">
          <p className="pricing-name"><LocalizedText en="Plus" /></p>
          <div className="pricing-price"><strong>$9</strong><span><LocalizedText en="per month" /></span></div>
          <p className="pricing-allowance"><strong>50</strong> <LocalizedText en="AI generations per month" /></p>
          <ul>
            <li><LocalizedText en="Everything in Free" /></li>
            <li><LocalizedText en="50 AI generations per month" /></li>
            <li><LocalizedText en="Designed for regular AI-assisted planning" /></li>
          </ul>
          <span className="pricing-cta pricing-cta-muted"><LocalizedText en="Planned for launch" /></span>
        </article>

        <article className="pricing-card pricing-card-pro">
          <p className="pricing-name"><LocalizedText en="Pro" /></p>
          <div className="pricing-price"><strong>$25</strong><span><LocalizedText en="per month" /></span></div>
          <p className="pricing-allowance"><strong>300</strong> <LocalizedText en="AI generations per month" /></p>
          <ul>
            <li><LocalizedText en="Everything in Plus" /></li>
            <li><LocalizedText en="300 AI generations per month" /></li>
            <li><LocalizedText en="For intensive AI-assisted planning" /></li>
          </ul>
          <span className="pricing-cta pricing-cta-muted"><LocalizedText en="Planned for launch" /></span>
        </article>
      </div>
    </section>
  </div>;
}
