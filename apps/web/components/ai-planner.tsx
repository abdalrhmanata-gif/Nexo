"use client";

import { FormEvent, useEffect, useState } from "react";
import { LocalizedText } from "./localized-text";
import type { AppLanguage } from "./language-switcher";

type Plan = {
  summary: string;
  steps: { title: string; reason: string }[];
};

type Usage = {
  plan: "free" | "plus";
  monthly_limit: number;
  generations_used: number;
  remaining: number;
};

export function AiPlanner() {
  const [goal, setGoal] = useState("");
  const [language, setLanguage] = useState<AppLanguage>("en");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function refreshUsage() {
    try {
      const response = await fetch("/api/ai/usage", { cache: "no-store" });
      if (response.ok) setUsage(await response.json() as Usage);
    } catch {
      // Usage status is informative; planner requests remain authoritative.
    }
  }

  useEffect(() => {
    void refreshUsage();
    const readLanguage = () => {
      const cookie = document.cookie.split("; ").find((part) => part.startsWith("zavqera-language="))?.split("=")[1];
      let saved: string | null = null;
      try { saved = window.localStorage.getItem("zavqera-language"); } catch { /* use cookie/browser fallback */ }
      const candidate = saved || cookie || navigator.language.toLowerCase().split("-")[0];
      setLanguage(candidate === "ar" || candidate === "nb" ? candidate : "en");
    };
    readLanguage();
    window.addEventListener("zavqera-language-change", readLanguage);
    return () => window.removeEventListener("zavqera-language-change", readLanguage);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPlan(null);
    setLoading(true);
    try {
      const response = await fetch("/api/ai/plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": crypto.randomUUID(),
        },
        body: JSON.stringify({ goal }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.usage) setUsage(result.usage as Usage);
        setError(typeof result.error === "string" ? result.error : "Could not create a plan.");
        return;
      }
      setPlan(result as Plan);
      void refreshUsage();
    } catch {
      setError("Could not reach the AI planner. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card ai-planner" aria-labelledby="ai-planner-heading">
      <p className="eyebrow"><LocalizedText en="AI copilot · Draft only" /></p>
      <h2 id="ai-planner-heading"><LocalizedText en="Turn a goal into a first plan" /></h2>
      <p><LocalizedText en="Describe what you want to achieve. ZAVQERA will suggest a short plan for you to review. Nothing is executed or saved automatically." /></p>
      {usage && (
        <p className="ai-usage" aria-live="polite">
          {usage.remaining} of {usage.monthly_limit} <LocalizedText en="AI plans remaining this month." />
        </p>
      )}
      <form className="form-grid" onSubmit={submit}>
        <div className="field">
          <label htmlFor="ai-goal"><LocalizedText en="Your goal" /></label>
          <textarea
            id="ai-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            maxLength={1200}
            required
            placeholder={language === "ar" ? "مثال: أريد إطلاق متجر إلكتروني صغير خلال ستة أسابيع" : language === "nb" ? "Eksempel: lanser en liten nettbutikk innen seks uker" : "Example: launch a small online shop in six weeks"}
            aria-describedby="ai-goal-help"
          />
          <small id="ai-goal-help">{goal.length}/1200 <LocalizedText en="characters. Avoid entering secrets or sensitive personal information." /></small>
        </div>
        <div>
          <button className="button" type="submit" disabled={loading || !goal.trim()}>
            {loading ? <LocalizedText en="Creating plan…" /> : <LocalizedText en="Create plan with AI" />}
          </button>
        </div>
      </form>
      {error && <p className="field-error" role="alert"><LocalizedText en={error} /></p>}
      {plan && (
        <div className="ai-plan-result" aria-live="polite">
          <h3><LocalizedText en="Suggested plan" /></h3>
          <p>{plan.summary}</p>
          <ol>
            {plan.steps.map((step, index) => (
              <li key={`${index}-${step.title}`}>
                <strong>{step.title}</strong>
                <span>{step.reason}</span>
              </li>
            ))}
          </ol>
          <p className="ai-disclaimer"><LocalizedText en="AI-generated draft. Review each step before adding it to a mission." /></p>
        </div>
      )}
    </section>
  );
}
