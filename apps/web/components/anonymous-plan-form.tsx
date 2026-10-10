"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LocalizedText } from "./localized-text";
import { missionTemplateById } from "../lib/mission-templates";
import { getMissionStarterExamples } from "../lib/mission-starter-examples.mjs";

type Plan = { title: string; summary: string; successCriteria: string[]; steps: { title: string; reason: string }[]; clarifyingQuestions: string[] };

const DRAFT_KEY = "zavqera-anonymous-plan-v2";

export function AnonymousPlanForm() {
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [language, setLanguage] = useState<"en" | "nb" | "ar" | "es" | "fr" | "de">("en");

  useEffect(() => {
    const syncLanguage = () => {
      let saved: string | null = null;
      try { saved = window.localStorage.getItem("zavqera-language"); } catch { /* storage may be blocked */ }
      const cookie = document.cookie.split("; ").find((part) => part.startsWith("zavqera-language="))?.split("=")[1];
      const candidate = saved || cookie || navigator.language.toLowerCase().split("-")[0];
      setLanguage(["en", "nb", "ar", "es", "fr", "de"].includes(candidate) ? candidate as "en" | "nb" | "ar" | "es" | "fr" | "de" : "en");
    };
    syncLanguage();
    const onLanguageChange = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      setLanguage(["en", "nb", "ar", "es", "fr", "de"].includes(value) ? value as "en" | "nb" | "ar" | "es" | "fr" | "de" : "en");
    };
    window.addEventListener("zavqera-language-change", onLanguageChange);

    const templateId = new URLSearchParams(window.location.search).get("template");
    const template = missionTemplateById(templateId);
    if (template) {
      setGoal(template.goal);
      setPlan(null);
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage may be blocked */ }
    } else {
      try {
        const saved = sessionStorage.getItem(DRAFT_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as { goal?: unknown; plan?: Plan };
          if (typeof parsed.goal === "string" && parsed.plan?.title && Array.isArray(parsed.plan.successCriteria) && Array.isArray(parsed.plan.clarifyingQuestions)) {
            setGoal(parsed.goal);
            setPlan(parsed.plan);
          }
        }
      } catch {
        // Ignore malformed or unavailable session storage.
      }
    }
    return () => window.removeEventListener("zavqera-language-change", onLanguageChange);
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

  const examples = getMissionStarterExamples(language);

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
          {examples.map((example) => <button key={example.key} type="button" className="example-chip" onClick={() => {
            setGoal(example.goal);
            setPlan(null); setError("");
            try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage may be blocked */ }
          }} title={example.goal}>{example.label}</button>)}
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
      <div className="ai-plan-title"><span className="ai-plan-label"><LocalizedText en="Mission" nb="Oppdrag" ar="المهمة" /></span><h4>{plan.title}</h4></div>
      <div className="ai-plan-summary">
        <span className="ai-plan-label"><LocalizedText en="Outcome" nb="Resultat" ar="النتيجة" /></span>
        <p>{plan.summary}</p>
      </div>
      <div className="ai-plan-summary">
        <span className="ai-plan-label"><LocalizedText en="Success looks like" nb="Slik ser suksess ut" ar="شكل النجاح" /></span>
        <ul>{plan.successCriteria.map((criterion, index) => <li key={`${criterion}-${index}`}>{criterion}</li>)}</ul>
      </div>
      <div className="ai-plan-steps">
        <span className="ai-plan-label"><LocalizedText en="Suggested first steps" nb="Foreslåtte første steg" ar="الخطوات الأولى المقترحة" /></span>
        <ol>{plan.steps.map((step, index) => <li key={index}><span className="ai-plan-step-number">{index + 1}</span><div><strong>{step.title}</strong><span>{step.reason}</span></div></li>)}</ol>
      </div>
      {plan.clarifyingQuestions.length > 0 && <div className="ai-plan-summary">
        <span className="ai-plan-label"><LocalizedText en="Questions to refine later" nb="Spørsmål som kan avklare planen" ar="أسئلة لتحسين الخطة لاحقًا" /></span>
        <ul>{plan.clarifyingQuestions.map((question, index) => <li key={`${question}-${index}`}>{question}</li>)}</ul>
      </div>}
      <p className="ai-plan-control"><LocalizedText en="Nothing has been created or executed. Your next step is your choice." nb="Ingenting er opprettet eller utført. Du bestemmer neste steg." ar="لم يتم إنشاء أو تنفيذ أي شيء. أنت تختار الخطوة التالية." /></p>
      <div className="hero-actions">
        <Link className="button" href="/auth/sign-up?next=/app/missions/new"><LocalizedText en="Create account & save" nb="Opprett konto og lagre" ar="أنشئ حسابًا واحفظ" /></Link>
        <Link className="button button-quiet" href="/pricing"><LocalizedText en="View pricing" nb="Se priser" ar="عرض الأسعار" /></Link>
      </div>
    </section>}
  </div>;
}
