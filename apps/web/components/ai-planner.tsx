"use client";

import { FormEvent, useState } from "react";

type Plan = {
  summary: string;
  steps: { title: string; reason: string }[];
};

export function AiPlanner() {
  const [goal, setGoal] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPlan(null);
    setLoading(true);
    try {
      const response = await fetch("/api/ai/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(typeof result.error === "string" ? result.error : "Could not create a plan.");
        return;
      }
      setPlan(result as Plan);
    } catch {
      setError("Could not reach the AI planner. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="card ai-planner" aria-labelledby="ai-planner-heading">
      <p className="eyebrow">AI copilot · Draft only</p>
      <h2 id="ai-planner-heading">Turn a goal into a first plan</h2>
      <p>Describe what you want to achieve. ZAVQERA will suggest a short plan for you to review. Nothing is executed or saved automatically.</p>
      <form className="form-grid" onSubmit={submit}>
        <div className="field">
          <label htmlFor="ai-goal">Your goal</label>
          <textarea
            id="ai-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            maxLength={1200}
            required
            placeholder="For example: prepare to launch a small online shop in six weeks"
            aria-describedby="ai-goal-help"
          />
          <small id="ai-goal-help">{goal.length}/1200 characters. Avoid entering secrets or sensitive personal information.</small>
        </div>
        <div>
          <button className="button" type="submit" disabled={loading || !goal.trim()}>
            {loading ? "Creating plan…" : "Create plan with AI"}
          </button>
        </div>
      </form>
      {error && <p className="field-error" role="alert">{error}</p>}
      {plan && (
        <div className="ai-plan-result" aria-live="polite">
          <h3>Suggested plan</h3>
          <p>{plan.summary}</p>
          <ol>
            {plan.steps.map((step, index) => (
              <li key={`${index}-${step.title}`}>
                <strong>{step.title}</strong>
                <span>{step.reason}</span>
              </li>
            ))}
          </ol>
          <p className="ai-disclaimer">AI-generated draft. Review each step before adding it to a mission.</p>
        </div>
      )}
    </section>
  );
}
