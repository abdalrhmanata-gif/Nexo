"use client";

import { useState } from "react";
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

  useState(() => {
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem("zavqera-language");
      const cookie = document.cookie.split("; ").find((part) => part.startsWith("zavqera-language="))?.split("=")[1];
      const candidate = saved || cookie || navigator.language.toLowerCase().split("-")[0];
      setLanguage(candidate === "ar" || candidate === "nb" ? candidate : "en");
    }
    return null;
  });

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

  return <>
    <section className="card ai-planner mission-ai-draft" aria-labelledby="mission-ai-heading">
      <p className="eyebrow"><LocalizedText en="AI copilot · Draft only" /></p>
      <h2 id="mission-ai-heading"><LocalizedText en="Start with your goal" /></h2>
      <p><LocalizedText en="Describe the result you want. AI can draft the mission details and first steps; review everything before creating the mission." /></p>
      <div className="field">
        <label htmlFor="ai-goal"><LocalizedText en="What do you want to achieve?" /></label>
        <textarea id="ai-goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={1200} required placeholder={placeholder} />
      </div>
      <button className="button" type="button" disabled={loading || !goal.trim()} onClick={draftWithAi}>
        {loading ? <LocalizedText en="Creating draft…" /> : <LocalizedText en="Draft mission with AI" />}
      </button>
      {error && <p className="field-error" role="alert"><LocalizedText en={error} /></p>}
    </section>
    <form className="form-grid mission-review-form" action={action}>
      <p className="eyebrow"><LocalizedText en="Review and edit" /></p>
      <div className="field"><label htmlFor="name"><LocalizedText en="Mission name" /></label><input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Renew my passport" required /></div>
      <div className="field"><label htmlFor="intent"><LocalizedText en="Intent" /></label><textarea id="intent" name="intent" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="What should this mission help you accomplish?" required /><small><LocalizedText en="Use plain language. Keep the decision you want to make visible." /></small></div>
      <div className="field"><label htmlFor="criteria"><LocalizedText en="Success criteria" /></label><textarea id="criteria" name="criteria" value={criteria} onChange={(e) => setCriteria(e.target.value)} placeholder="One criterion per line" required /><small><LocalizedText en="How you will know this mission succeeded. One per line." /></small></div>
      <div className="field"><label htmlFor="actions"><LocalizedText en="First steps" /> <span className="field-optional"><LocalizedText en="optional" /></span></label><textarea id="actions" name="actions" value={actions} onChange={(e) => setActions(e.target.value)} placeholder="One step per line" /><small><LocalizedText en="The work you already know about, in the order you would do it. You can add more at any time. Leave empty to start from your success criteria." /></small></div>
      <button className="button" type="submit"><LocalizedText en="Create mission" /></button>
    </form>
  </>;
}
