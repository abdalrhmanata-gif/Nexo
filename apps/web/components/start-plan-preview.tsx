import Link from "next/link";
import { LocalizedText } from "./localized-text";
import type { StartPlan } from "../lib/start-plan";

/**
 * The plan as a visitor sees it before saving: where it comes from, the
 * steps in order, and how they will know it worked. Shared by /try (no
 * account) and /app/start (signed in, about to save), so what is saved is
 * exactly what was shown.
 */
export function StartPlanPreview({ plan, headingLevel = 2 }: { plan: StartPlan; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const rtl = plan.request.lang === "ar";
  return <div className="start-plan" lang={plan.request.lang} dir={rtl ? "rtl" : "ltr"}>
    <p className="start-plan-basis">
      {plan.basis.href
        ? <Link href={plan.basis.href} prefetch={false}>{plan.basis.label}</Link>
        : plan.basis.label}
    </p>
    <Heading className="start-plan-headline">{plan.headline}</Heading>
    <ol className="start-plan-steps">
      {plan.actions.map((action, index) => <li key={index}><span className="start-plan-step-number" aria-hidden="true">{index + 1}</span><span>{action}</span></li>)}
    </ol>
    {plan.criteria.length > 0 && <div className="start-plan-criteria">
      <p className="eyebrow"><LocalizedText en="How you will know it worked" /></p>
      <ul>{plan.criteria.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul>
    </div>}
  </div>;
}

/** Hidden fields that name the plan to the save action. Never the plan's text. */
export function StartPlanFields({ plan }: { plan: StartPlan }) {
  return <>
    <input type="hidden" name={plan.request.kind} value={plan.request.value} />
    <input type="hidden" name="lang" value={plan.request.lang} />
  </>;
}
