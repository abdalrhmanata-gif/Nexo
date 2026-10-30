import Link from "next/link";
import { LocalizedText } from "../../components/localized-text";

const plans = [
  { name: "Free", price: "$0", generations: "5", className: "", cta: true },
  { name: "Plus", price: "$9", generations: "50", className: "pricing-card-featured", cta: false },
  { name: "Pro", price: "$25", generations: "300", className: "pricing-card-pro", cta: false },
];

export default function PricingPage() {
  return <div className="container">
    <section className="pricing-hero">
      <p className="eyebrow"><LocalizedText en="Pricing" /></p>
      <h1><LocalizedText en="Choose the amount of AI work you need." /></h1>
      <p><LocalizedText en="Start free. Upgrade when ZAVQERA becomes part of your regular workflow." /></p>
      <p className="pricing-status"><LocalizedText en="Paid billing is not enabled yet. Plus and Pro are shown transparently for launch planning." /></p>
    </section>
    <section className="pricing" aria-labelledby="pricing-heading">
      <h2 id="pricing-heading" className="visually-hidden"><LocalizedText en="ZAVQERA plans" /></h2>
      <div className="pricing-grid">
        {plans.map((plan) => <article key={plan.name} className={`pricing-card ${plan.className}`}>
          <p className="pricing-name"><LocalizedText en={plan.name} /></p>
          <div className="pricing-price"><strong>{plan.price}</strong><span><LocalizedText en="per month" /></span></div>
          <p className="pricing-allowance"><strong>{plan.generations}</strong> <LocalizedText en="AI generations per month" /></p>
          <ul>
            <li><LocalizedText en="Core mission workspace" /></li>
            <li><LocalizedText en={plan.name === "Free" ? "Review before anything is created" : plan.name === "Plus" ? "Everything in Free" : "Everything in Plus"} /></li>
            <li><LocalizedText en={plan.name === "Free" ? "Hard monthly AI limit" : plan.name === "Plus" ? "Designed for regular AI-assisted planning" : "For intensive AI-assisted planning"} /></li>
          </ul>
          {plan.cta
            ? <Link className="button pricing-cta" href="/auth/sign-up"><LocalizedText en="Start free" /></Link>
            : <span className="pricing-cta pricing-cta-muted"><LocalizedText en="Planned for launch" /></span>}
        </article>)}
      </div>
    </section>
    <section className="pricing-note card">
      <h2><LocalizedText en="No pressure to upgrade." /></h2>
      <p><LocalizedText en="The free plan is the right place to understand ZAVQERA. Upgrade only when the higher AI allowance is useful to you." /></p>
      <Link className="button button-quiet" href="/"><LocalizedText en="Back to ZAVQERA" /></Link>
    </section>
  </div>;
}
