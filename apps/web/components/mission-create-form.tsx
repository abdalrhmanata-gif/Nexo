"use client";

import { useEffect, useState } from "react";
import { LocalizedText } from "./localized-text";

type Plan = { summary: string; steps: { title: string; reason: string }[] };

export function MissionCreateForm({ action }: { action: (formData: FormData) => void | Promise<void> }) {
  const [goal, setGoal] = useState("");
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [criteria, setCriteria] = useState("");
  const [actions, setActions] = useState("");
  const [language, setLanguage] = useState("en");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [usage, setUsage] = useState<{remaining:number; monthly_limit:number} | null>(null);

  useEffect(() => {
    const syncLanguage = () => {
      let saved: string | null = null;
      try { saved = window.localStorage.getItem("zavqera-language"); } catch { /* storage may be blocked */ }
      const cookie = document.cookie.split("; ").find((part) => part.startsWith("zavqera-language="))?.split("=")[1];
      const candidate = saved || cookie || navigator.language.toLowerCase().split("-")[0];
      setLanguage(candidate === "ar" || candidate === "nb" ? candidate : "en");
    };
    syncLanguage();
    const onLanguageChange = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      setLanguage(value === "ar" || value === "nb" ? value : "en");
    };
    window.addEventListener("zavqera-language-change", onLanguageChange);
    void fetch("/api/ai/usage", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((value) => { if (value && typeof value.remaining === "number" && typeof value.monthly_limit === "number") setUsage(value); })
      .catch(() => undefined);
    return () => window.removeEventListener("zavqera-language-change", onLanguageChange);
  }, []);

  async function draftWithAi() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-request-id": crypto.randomUUID() },
        body: JSON.stringify({ goal }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "Could not create a plan.");
        return;
      }
      const plan = result as Plan;
      setName((current) => current || goal.trim().split(/[.!?\n]/)[0].slice(0, 72));
      setIntent(goal.trim());
      setCriteria(plan.summary);
      setActions(plan.steps.map((step) => step.title + (step.reason ? " — " + step.reason : "")).join("\n"));
    } catch {
      setError("Could not reach the AI planner. Please try again.");
    } finally { setLoading(false); }
  }

  const placeholder = language === "ar" ? "مثال: أريد إطلاق متجر إلكتروني صغير خلال ستة أسابيع" : language === "nb" ? "Eksempel: lanser en liten nettbutikk innen seks uker" : "Example: launch a small online shop in six weeks";
  const namePlaceholder = language === "ar" ? "مثال: إطلاق متجري الإلكتروني" : language === "nb" ? "For eksempel: Lanser nettbutikken min" : "e.g. Launch my online shop";
  const intentPlaceholder = language === "ar" ? "ما النتيجة التي تريد الوصول إليها؟" : language === "nb" ? "Hva ønsker du å oppnå med oppdraget?" : "What should this mission help you accomplish?";
  const criteriaPlaceholder = language === "ar" ? "اكتب معيارًا واحدًا في كل سطر" : language === "nb" ? "Ett kriterium per linje" : "One criterion per line";
  const actionsPlaceholder = language === "ar" ? "اكتب خطوة واحدة في كل سطر" : language === "nb" ? "Ett steg per linje" : "One step per line";

  return <form className="form-grid card mission-create-form" action={action}>
    <section className="mission-ai-draft" aria-labelledby="mission-ai-heading">
      <p className="eyebrow"><LocalizedText en="AI copilot · Draft only" /></p>
      <h2 id="mission-ai-heading"><LocalizedText en="Start with your goal" /></h2>
      <p><LocalizedText en="Describe the result you want. AI can draft the mission details and first steps; review everything before creating the mission." /></p>
      <div className="field">
        <label htmlFor="ai-goal"><LocalizedText en="What do you want to achieve?" /></label>
        <textarea id="ai-goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={1200} placeholder={placeholder} />
      </div>
      <button className="button" type="button" disabled={loading || !goal.trim()} onClick={draftWithAi}>
        {loading ? <LocalizedText en="Creating draft…" /> : <LocalizedText en="Draft mission with AI" />}
      </button>
      {usage && <p className="ai-usage" aria-live="polite">{usage.remaining} / {usage.monthly_limit} <LocalizedText en="AI generations remaining this month." /></p>}
      {error && <p className="field-error" role="alert"><LocalizedText en={error} /></p>}
    </section>
      <p className="eyebrow"><LocalizedText en="Review and edit" /></p>
      <div className="field"><label htmlFor="name"><LocalizedText en="Mission name" /></label><input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={namePlaceholder} required /></div>
      <div className="field"><label htmlFor="intent"><LocalizedText en="Intent" /></label><textarea id="intent" name="intent" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder={intentPlaceholder} required /><small><LocalizedText en="Use plain language. Keep the decision you want to make visible." /></small></div>
      <div className="field"><label htmlFor="criteria"><LocalizedText en="Success criteria" /></label><textarea id="criteria" name="criteria" value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder={criteriaPlaceholder} required /><small><LocalizedText en="How you will know this mission succeeded. One per line." /></small></div>
      <div className="field"><label htmlFor="actions"><LocalizedText en="First steps" /> <span className="field-optional"><LocalizedText en="optional" /></span></label><textarea id="actions" name="actions" value={actions} onChange={(e) => setActions(e.target.value)} placeholder={actionsPlaceholder} /><small><LocalizedText en="The work you already know about, in the order you would do it. You can add more at any time. Leave empty to start from your success criteria." /></small></div>
      <button className="button" type="submit"><LocalizedText en="Create mission" /></button>
  </form>;
}
