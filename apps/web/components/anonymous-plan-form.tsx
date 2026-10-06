"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LocalizedText } from "./localized-text";

type Plan = { summary: string; steps: { title: string; reason: string }[] };

const DRAFT_KEY = "zavqera-anonymous-plan";

export function AnonymousPlanForm() {
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(DRAFT_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { goal?: unknown; plan?: Plan };
      if (typeof parsed.goal === "string" && parsed.plan) {
        setGoal(parsed.goal);
        setPlan(parsed.plan);
      }
    } catch {
      // Ignore malformed or unavailable session storage.
    }
  }, []);

  async function buildPlan() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/plan/anonymous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "Could not create a plan.");
        return;
      }
      const nextPlan = result as Plan;
      setPlan(nextPlan);
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ goal: goal.trim(), plan: nextPlan }));
      } catch {
        // The plan is still visible even when session storage is unavailable.
      }
    } catch {
      setError("Could not reach the AI planner. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const examples = [
    "Launch a small online shop in six weeks",
    "Get my visa application ready",
    "Organize a side project alongside my job",
  ];

  return <div className="form-grid card mission-create-form">
    <section className="mission-ai-draft" aria-labelledby="anonymous-plan-heading">
      <p className="eyebrow"><LocalizedText en="Try ZAVQERA" nb="Prøv ZAVQERA" ar="جرّب ZAVQERA" /></p>
      <h2 id="anonymous-plan-heading"><LocalizedText en="Tell us what you want to achieve." nb="Fortell hva du vil oppnå." ar="أخبرنا بما تريد تحقيقه." /></h2>
      <p><LocalizedText en="Get one AI mission plan before creating an account. No signup needed." nb="Få én AI-plan før du oppretter konto. Ingen registrering nødvendig." ar="احصل على خطة واحدة بالذكاء الاصطناعي قبل إنشاء الحساب. لا تحتاج للتسجيل." /></p>
      <div className="field">
        <label htmlFor="anonymous-goal"><LocalizedText en="Your goal" nb="Målet ditt" ar="هدفك" /></label>
        <textarea id="anonymous-goal" value={goal} maxLength={900} onChange={(event) => { setGoal(event.target.value); setError(""); }} placeholder="Example: launch a small online shop in six weeks" />
        <small><LocalizedText en="Describe the outcome. You can write freely." nb="Beskriv resultatet. Du kan skrive fritt." ar="اشرح النتيجة. يمكنك الكتابة بحرية." /></small>
        <div className="goal-examples" aria-label="Example goals">
          <span><LocalizedText en="Try an example" nb="Prøv et eksempel" ar="جرّب مثالًا" /></span>
          {examples.map((example) => <button key={example} type="button" className="example-chip" onClick={() => setGoal(example)}>{example}</button>)}
        </div>
      </div>
      {!plan && <button className="button" type="button" disabled={loading || !goal.trim()} onClick={buildPlan}>
        {loading ? <LocalizedText en="Building your plan…" nb="Bygger planen din…" ar="جارٍ بناء خطتك…" /> : <LocalizedText en="Build my plan" nb="Bygg planen min" ar="ابنِ خطتي" />}
      </button>}
      <p className="ai-usage"><LocalizedText en={plan ? "Your free anonymous AI plan has been used." : "1 free AI plan. No account required."} nb={plan ? "Din gratis AI-plan er brukt." : "1 gratis AI-plan. Ingen konto nødvendig."} ar={plan ? "تم استخدام خطة الذكاء الاصطناعي المجانية." : "خطة واحدة مجانية بالذكاء الاصطناعي. لا تحتاج إلى حساب."} /></p>
      {error && <p className="field-error" role="alert"><LocalizedText en={error} /></p>}
    </section>

    {plan && <section className="ai-plan-preview" aria-labelledby="anonymous-plan-preview-heading">
      <div className="ai-plan-preview-header">
        <div>
          <p className="eyebrow"><LocalizedText en="AI draft" nb="KI-utkast" ar="مسودة الذكاء الاصطناعي" /></p>
          <h3 id="anonymous-plan-preview-heading"><LocalizedText en="Here is your plan." nb="Her er planen din." ar="هذه هي خطتك." /></h3>
        </div>
        <span className="ai-plan-review-badge"><LocalizedText en="Review before creating" nb="Se gjennom før du oppretter" ar="راجع قبل الإنشاء" /></span>
      </div>
      <div className="ai-plan-summary">
        <span className="ai-plan-label"><LocalizedText en="Outcome" nb="Resultat" ar="النتيجة" /></span>
        <p>{plan.summary}</p>
      </div>
      <div className="ai-plan-steps">
        <span className="ai-plan-label"><LocalizedText en="Suggested first steps" nb="Foreslåtte første steg" ar="الخطوات الأولى المقترحة" /></span>
        <ol>{plan.steps.map((step, index) => <li key={index}><span className="ai-plan-step-number">{index + 1}</span><div><strong>{step.title}</strong><span>{step.reason}</span></div></li>)}</ol>
      </div>
      <p className="ai-plan-control"><LocalizedText en="Nothing has been created or executed. Your next step is your choice." nb="Ingenting er opprettet eller utført. Du bestemmer neste steg." ar="لم يتم إنشاء أو تنفيذ أي شيء. أنت تختار الخطوة التالية." /></p>
      <div className="hero-actions">
        <Link className="button" href="/auth/sign-up?next=/app/missions/new"><LocalizedText en="Create account & save" nb="Opprett konto og lagre" ar="أنشئ حسابًا واحفظ" /></Link>
        <Link className="button button-quiet" href="/pricing"><LocalizedText en="View pricing" nb="Se priser" ar="عرض الأسعار" /></Link>
      </div>
    </section>}
  </div>;
}
