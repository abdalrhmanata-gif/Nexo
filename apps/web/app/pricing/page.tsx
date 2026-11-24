import Link from "next/link";
import { LocalizedFill, LocalizedText } from "../../components/localized-text";
import { PlanInterest } from "../../components/plan-interest";
import { billingConfigured } from "../../lib/stripe-client";
import { PLAN_LIMITS, managedPaymentsEnabled, pricePerDraft } from "../../lib/billing-plans.mjs";

// Read per request: whether billing is open depends on the deployment's key.
export const dynamic = "force-dynamic";

// Every plan has the whole workspace, and nothing in the code gates a feature
// by plan: Missions, steps, proof, templates, guides, sharing and team
// invites are the same on Free and on Scale. What grows is the monthly AI
// allowance. Only features that exist today are listed here, and nothing is
// promised that the code does not already do.
const plans = [
  {
    name: "Free",
    price: "$0",
    monthly: 0,
    reports: PLAN_LIMITS.free,
    tagline: "Start your first plan today",
    className: "",
    cta: true,
    features: [
      "Unlimited Missions and plans",
      "All templates and step-by-step guides",
      "Proof for each step, and Save as PDF",
      "Opportunity score and evidence ledger",
      "Share links and team invites",
      "Six languages, including Arabic",
    ],
  },
  {
    name: "Plus",
    price: "$19",
    monthly: 19,
    reports: PLAN_LIMITS.plus,
    tagline: "For one goal that really matters",
    className: "",
    cta: false,
    // 10 a month: one every three days or so.
    features: ["Everything in Free", "A fresh AI plan every few days"],
  },
  {
    name: "Pro",
    price: "$49",
    monthly: 49,
    reports: PLAN_LIMITS.pro,
    tagline: "For freelancers and founders with many goals",
    className: "pricing-card-pro",
    cta: false,
    // 30 a month.
    features: ["Everything in Plus", "About one AI draft a day"],
  },
  {
    name: "Scale",
    price: "$69",
    monthly: 69,
    reports: PLAN_LIMITS.scale,
    tagline: "For people who plan every day",
    // Highlighted: the lowest price per AI draft ($69 / 90).
    className: "pricing-card-featured",
    cta: false,
    // 90 a month.
    features: ["Everything in Pro", "About three AI drafts a day"],
  },
];

const questions = [
  {
    q: "What counts as an AI draft?",
    a: "Each time you ask the AI for a Mission plan or an opportunity brief, that is one draft. Everything else is unlimited: creating Missions, using templates and guides, tracking steps, keeping proof and sharing.",
  },
  {
    q: "Is it really unlimited?",
    a: "Yes. No plan has a monthly limit on Missions, steps, proof, templates or guides. We only ask for fair use, as our terms explain.",
  },
  {
    q: "What happens when my AI drafts run out?",
    a: "Everything else keeps working. Your drafts refill at the start of each month, or you can move to a bigger plan at any time.",
  },
  {
    q: "Do my teammates use my AI drafts?",
    a: "No. AI drafts belong to each person's own plan, including the people you invite to your team.",
  },
  {
    q: "Can I cancel at any time?",
    a: "Yes, from your billing page. Your plan stays active until the end of the month you have paid for.",
  },
  {
    q: "Does the AI act on my behalf?",
    a: "No. The AI drafts and you decide. Nothing is added to a Mission until you choose to add it.",
  },
  {
    q: "Does changing the language use an AI draft?",
    a: "No. The interface and the templates are translated in advance. A Mission or plan you created stays in the language it was written in, and nothing is re-translated by AI.",
  },
];

export default function PricingPage() {
  const billing = billingConfigured();
  return <div className="container">
    <section className="pricing-hero">
      <p className="eyebrow"><LocalizedText en="Pricing" /></p>
      <h1><LocalizedText en="Unlimited Missions on every plan. Pay only for more AI." /></h1>
      <p><LocalizedText en="Templates, guides, proof for each step and sharing are included free. Paid plans add more AI drafts each month." /></p>
      {billing && <p className="pricing-status">{managedPaymentsEnabled(process.env)
        ? <LocalizedText en="Prices include VAT or sales tax where it applies. Billed monthly by Link (Stripe) and shown on your card statement as LINK.COM* ZAVQERA. Cancel any time; your plan lasts until the end of the period you paid for." />
        : <LocalizedText en="Plans are billed monthly through Stripe. You can cancel at any time, and your plan lasts until the end of the period you paid for." />}</p>}
    </section>
    <section className="pricing" aria-labelledby="pricing-heading">
      <h2 id="pricing-heading" className="visually-hidden"><LocalizedText en="Compare plans" /></h2>
      <div className="pricing-grid">
        {plans.map((plan) => <article key={plan.name} className={`pricing-card ${plan.className}`}>
          {plan.name === "Scale" && <span className="pricing-badge"><LocalizedText en="Best value" /></span>}
          <p className="pricing-name"><LocalizedText en={plan.name} /></p>
          <p className="pricing-tagline"><LocalizedText en={plan.tagline} /></p>
          <div className="pricing-price"><strong>{plan.price}</strong><span><LocalizedText en="per month" /></span></div>
          <p className="pricing-allowance">
            <strong>{plan.reports}</strong> <LocalizedText en="AI drafts per month" />
            {plan.monthly > 0 && <small><LocalizedFill en="{price} per AI draft" values={{ price: pricePerDraft(plan.monthly, plan.reports) }} />
              {plan.name === "Scale" && <> · <LocalizedText en="the lowest price" /></>}</small>}
          </p>
          <ul>
            {plan.features.map((feature) => <li key={feature}><LocalizedText en={feature} /></li>)}
          </ul>
          {plan.cta
            ? <><Link className="button pricing-cta" href="/auth/sign-up"><LocalizedText en="Start free" /></Link>
              <small className="pricing-cta-note"><LocalizedText en="Free. No card needed." /></small></>
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
