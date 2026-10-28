import Link from "next/link";
import { LocalizedText } from "../../components/localized-text";

const plans = [
  {
    name: "Free",
    price: "$0",
    reports: "1",
    className: "",
    cta: true,
    features: [
      "Opportunity score and evidence ledger",
      "1 AI Opportunity Brief per month (planned)",
      "Turn a reviewed opportunity into a Mission",
    ],
  },
  {
    name: "Plus",
    price: "$19",
    reports: "10",
    className: "pricing-card-featured",
    cta: false,
    features: [
      "Everything in Free",
      "10 AI Opportunity Briefs per month (planned)",
      "Source-linked market and competitor analysis (planned)",
      "Evidence-based validation experiments (planned)",
    ],
  },
  {
    name: "Pro",
    price: "$49",
    reports: "30",
    className: "pricing-card-pro",
    cta: false,
    features: [
      "Everything in Plus",
      "30 AI Opportunity Briefs per month (planned)",
      "Compare up to 3 opportunities (planned)",
      "Exportable decision reports (planned)",
      "Market monitoring and alerts (later phase)",
    ],
  },
];

export default function PricingPage() {
  return <div className="container">
    <section className="pricing-hero">
      <p className="eyebrow"><LocalizedText en="Pricing" /></p>
      <h1><LocalizedText en="Find the opportunity. Prove it. Turn it into action." /></h1>
      <p><LocalizedText en="One monthly plan should take you from an early idea to evidence, a clear decision, and a governed Mission." /></p>
      <p className="pricing-status"><LocalizedText en="Proposed launch pricing, not active offers. Paid billing, AI Opportunity Briefs, and usage enforcement are not enabled yet." /></p>
    </section>
    <section className="pricing" aria-labelledby="pricing-heading">
      <h2 id="pricing-heading" className="visually-hidden"><LocalizedText en="Proposed monthly plans" /></h2>
      <div className="pricing-grid">
        {plans.map((plan) => <article key={plan.name} className={`pricing-card ${plan.className}`}>
          <p className="pricing-name"><LocalizedText en={plan.name} /></p>
          <div className="pricing-price"><strong>{plan.price}</strong><span><LocalizedText en="per month (proposed)" /></span></div>
          <p className="pricing-allowance">
            <strong>{plan.reports}</strong> <LocalizedText en="AI Opportunity Briefs per month (planned)" />
          </p>
          <ul>
            {plan.features.map((feature) => <li key={feature}><LocalizedText en={feature} /></li>)}
          </ul>
          {plan.cta
            ? <Link className="button pricing-cta" href="/auth/sign-up"><LocalizedText en="Start free" /></Link>
            : <span className="pricing-cta pricing-cta-muted"><LocalizedText en="Planned for launch" /></span>}
        </article>)}
      </div>
    </section>
    <section className="pricing-note card" aria-labelledby="opportunity-intelligence-pricing-heading">
      <p className="eyebrow"><LocalizedText en="The product we intend to build" /></p>
      <h2 id="opportunity-intelligence-pricing-heading"><LocalizedText en="Opportunity Intelligence belongs inside the monthly plan—not as a surprise add-on." /></h2>
      <p><LocalizedText en="The current early-access feature scores the information you enter, keeps your evidence ledger in this browser, and can turn a reviewed opportunity into a Mission. A server-side AI analyst route is now implemented, but it remains disabled until an approved provider and server-side credentials are configured; the route does not fetch source pages itself." /></p>
      <ul>
        <li><LocalizedText en="AI challenge: find weak assumptions, contradictions, missing evidence, and reasons an idea may fail." /></li>
        <li><LocalizedText en="Evidence-first report: each factual claim must cite a source or be clearly labeled as an inference or unknown." /></li>
        <li><LocalizedText en="Market gap: compare relevant competitors, the prices they publish, customer pain signals, and unmet needs when reliable source data is available." /></li>
        <li><LocalizedText en="Next best test: recommend a low-cost experiment with success/failure criteria, then create a governed Mission for the user to review." /></li>
      </ul>
      <p className="action-hint"><LocalizedText en="These are planned capabilities, not currently available features. The monthly report allowances and prices are hypotheses until provider costs, source access, report quality, and demand are tested." /></p>
      <Link className="button button-quiet" href="/app/opportunities"><LocalizedText en="Try the current Opportunity Intelligence MVP" /></Link>
    </section>
    <section className="pricing-note card">
      <h2><LocalizedText en="No unsupported promises." /></h2>
      <p><LocalizedText en="The first version must be useful without AI; the paid analyst should launch only after source-backed reports, safe limits, privacy controls, and cost per report have been verified." /></p>
      <Link className="button button-quiet" href="/"><LocalizedText en="Back to ZAVQERA" /></Link>
    </section>
  </div>;
}
