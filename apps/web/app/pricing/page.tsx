import Link from "next/link";
import { LocalizedText } from "../../components/localized-text";
import { PlanInterest } from "../../components/plan-interest";
import { billingConfigured } from "../../lib/stripe-client";
import { PLAN_LIMITS } from "../../lib/billing-plans.mjs";

// Read per request: whether billing is open depends on the deployment's key.
export const dynamic = "force-dynamic";

// Every plan has the whole workspace; what grows is the monthly AI allowance.
// Only features that exist today are listed here.
const plans = [
  {
    name: "Free",
    price: "$0",
    reports: PLAN_LIMITS.free,
    className: "",
    cta: true,
    features: [
      "Missions with steps, evidence and results",
      "Opportunity score and evidence ledger",
      "Share results and invite your team",
    ],
  },
  {
    name: "Plus",
    price: "$19",
    reports: PLAN_LIMITS.plus,
    className: "pricing-card-featured",
    cta: false,
    features: ["Everything in Free", "For steady personal use"],
  },
  {
    name: "Pro",
    price: "$49",
    reports: PLAN_LIMITS.pro,
    className: "pricing-card-pro",
    cta: false,
    features: ["Everything in Plus", "For freelancers and small teams"],
  },
  {
    name: "Scale",
    price: "$69",
    reports: PLAN_LIMITS.scale,
    className: "pricing-card-scale",
    cta: false,
    features: ["Everything in Pro", "For teams that plan every day"],
  },
];

const questions = [
  {
    q: "What counts as an AI generation?",
    a: "Each AI Mission plan or AI opportunity brief you ask for counts as one. Writing Missions, tracking steps and recording evidence never count.",
  },
  {
    q: "Can I cancel at any time?",
    a: "Yes, from your billing page. Your plan stays active until the end of the month you have paid for.",
  },
  {
    q: "Does the AI act on my behalf?",
    a: "No. The AI drafts and you decide. Nothing is added to a Mission until you choose to add it.",
  },
];

export default function PricingPage() {
  const billing = billingConfigured();
  return <div className="container">
    <section className="pricing-hero">
      <p className="eyebrow"><LocalizedText en="Pricing" /></p>
      <h1><LocalizedText en="Simple plans. Start free." /></h1>
      <p><LocalizedText en="Every plan includes the full workspace. Paid plans give you more AI help each month." /></p>
      {billing && <p className="pricing-status"><LocalizedText en="Plans are billed monthly through Stripe. You can cancel at any time, and your plan lasts until the end of the period you paid for." /></p>}
    </section>
    <section className="pricing" aria-labelledby="pricing-heading">
      <h2 id="pricing-heading" className="visually-hidden"><LocalizedText en="Compare plans" /></h2>
      <div className="pricing-grid">
        {plans.map((plan) => <article key={plan.name} className={`pricing-card ${plan.className}`}>
          {plan.name === "Plus" && <span className="pricing-badge"><LocalizedText en="Best for regular use" /></span>}
          <p className="pricing-name"><LocalizedText en={plan.name} /></p>
          <div className="pricing-price"><strong>{plan.price}</strong><span><LocalizedText en="per month" /></span></div>
          <p className="pricing-allowance">
            <strong>{plan.reports}</strong> <LocalizedText en="AI briefs or Mission plans per month" />
          </p>
          <ul>
            {plan.features.map((feature) => <li key={feature}><LocalizedText en={feature} /></li>)}
          </ul>
          {plan.cta
            ? <Link className="button pricing-cta" href="/auth/sign-up"><LocalizedText en="Start free" /></Link>
            : billing
              ? <Link className="button pricing-cta" href="/app/billing"><LocalizedText en="Choose" /> <LocalizedText en={plan.name} /></Link>
              : <PlanInterest plan={plan.name} />}
        </article>)}
      </div>
    </section>
    <section className="pricing-note card" aria-labelledby="pricing-questions-heading">
      <h2 id="pricing-questions-heading"><LocalizedText en="Questions" /></h2>
      {questions.map((item) => <div key={item.q}>
        <h3><LocalizedText en={item.q} /></h3>
        <p><LocalizedText en={item.a} /></p>
      </div>)}
    </section>
  </div>;
}
