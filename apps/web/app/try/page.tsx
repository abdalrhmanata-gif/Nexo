import type { Metadata } from "next";
import Link from "next/link";
import { GoalStarter } from "../../components/goal-starter";
import { LocalizedText } from "../../components/localized-text";
import { PendingSubmitButton } from "../../components/pending-submit-button";
import { ShareTemplateButton } from "../../components/share-template-button";
import { StartPlanFields, StartPlanPreview } from "../../components/start-plan-preview";
import { readSignedIn } from "../../components/shell";
import { fill } from "../../lib/i18n";
import { getLanguage, getTranslate } from "../../lib/i18n-server";
import { PLAN_LIMITS } from "../../lib/billing-plans.mjs";
import { buildStartPlan, readStartRequest, type StartPlan } from "../../lib/start-plan";
import { guidePath } from "../../lib/guides";
import { savePlan } from "../app/start/actions";

type TrySearchParams = { goal?: string | string[] };

// A goal typed here is matched to a guide, a template or the planner, never
// to a checklist: checklists are saved from their own pages.
const HONESTY: Record<Exclude<StartPlan["basis"]["source"], "checklist">, string> = {
  guide: "Built from the guide, with no AI. Rules and fees change: the guide links the official page for each one.",
  template: "Built from a template, with no AI. It states no rule, fee or deadline: confirm those at the official source.",
  planner: "A first structure built from the words you used, with no AI. It states no rule, price or deadline: check those at the official source.",
};

async function planFor(params: TrySearchParams) {
  const goal = Array.isArray(params.goal) ? params.goal[0] : params.goal;
  if (!goal) return { asked: false, plan: null };
  const request = readStartRequest({ goal }, await getLanguage());
  return { asked: true, plan: request ? buildStartPlan(request) : null };
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<TrySearchParams> }): Promise<Metadata> {
  const t = await getTranslate();
  const { plan } = await planFor(await searchParams);
  if (plan) {
    // A plan for one person's goal is worth sharing, not indexing: anyone can
    // type anything into the box, and none of it should become a search page.
    const title = `${plan.name} · ${t("Free plan|steps")} · Zavqera`;
    const description = t("A step-by-step plan for this goal, free and without an account. Save it to tick off each step and keep the proof.");
    return {
      title,
      description,
      robots: { index: false, follow: true },
      alternates: { canonical: "/try" },
      openGraph: { title, description, type: "website" },
      twitter: { card: "summary", title, description },
    };
  }
  return {
    title: t("Turn any goal into a step-by-step plan, free · Zavqera"),
    description: t("Write what you want to get done and see a plan at once: the steps in order and how you will know it worked. Free, no account needed."),
    alternates: { canonical: "/try" },
  };
}

export default async function TryPage({ searchParams }: { searchParams: Promise<TrySearchParams> }) {
  const t = await getTranslate();
  const { asked, plan } = await planFor(await searchParams);
  const signedIn = await readSignedIn();
  const language = await getLanguage();

  return <div className="container try-page">
    <section className="try-hero">
      <p className="eyebrow"><LocalizedText en="Free · no account needed" /></p>
      <h1>{plan ? plan.name : t("Turn any goal into a plan.")}</h1>
      {!plan && <p className="landing-lede"><LocalizedText en="Write what you want to get done. You see the steps in order and how you will know it worked, before you create anything." /></p>}
      {asked && !plan && <div className="field-error" role="alert"><LocalizedText en="Write a few more words about the goal." /></div>}
      {!plan && <GoalStarter mode="preview" />}
    </section>

    {plan && <section className="card try-plan" aria-label={t("Your plan|steps")}>
      <StartPlanPreview plan={plan} />
      {plan.basis.source !== "checklist" ? <p className="try-honesty">{t(HONESTY[plan.basis.source])}</p> : null}
      <form action={savePlan} className="try-save">
        <StartPlanFields plan={plan} />
        <PendingSubmitButton label={signedIn ? "Save to my workspace" : "Save this plan, free"} pendingLabel="Saving…" />
        <ShareTemplateButton title={plan.name} label="Share this plan" />
      </form>
      <p className="try-save-note">
        {signedIn
          ? <LocalizedText en="It opens as a mission: tick off each step and keep the proof on it." />
          : <LocalizedText en="A free account, no card. You land straight on this plan, tick off each step and keep the proof on it." />}
        {" "}{fill(t("After saving, the AI can draft a plan written for exactly this goal. The free plan includes {count} a month."), { count: PLAN_LIMITS.free })}
      </p>
    </section>}

    {plan && <section className="try-again">
      <h2><LocalizedText en="Try another goal" /></h2>
      <GoalStarter mode="preview" inputId="goal-again" />
    </section>}

    <section className="try-more">
      <h2><LocalizedText en="Want the details first?" /></h2>
      <p>
        <Link href={guidePath(language)}><LocalizedText en="Read the step-by-step guides, with official sources" /> <span aria-hidden="true">→</span></Link>
        {" · "}
        <Link href="/templates"><LocalizedText en="Browse mission templates" /> <span aria-hidden="true">→</span></Link>
      </p>
    </section>
  </div>;
}
