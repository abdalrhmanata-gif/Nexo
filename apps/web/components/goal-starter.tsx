"use client";

import Link from "next/link";
import { LocalizedText, useLanguage, useTranslate } from "./localized-text";
import { GOAL_EXAMPLES, GOAL_MAX_LENGTH, GOAL_MIN_LENGTH } from "../lib/goal-plan.mjs";
import { savePlan } from "../app/app/start/actions";
import { PendingSubmitButton } from "./pending-submit-button";

/**
 * The goal box. "preview" (home page, /try) shows the plan first and needs no
 * account; "save" (an empty workspace) saves it straight away, since the
 * person is already signed in and asked for it. A plain form either way, so
 * it works before any script has loaded.
 */
export function GoalStarter({ mode, inputId = "goal" }: { mode: "preview" | "save"; inputId?: string }) {
  const t = useTranslate();
  const language = useLanguage();
  const fields = <>
    <label className="goal-starter-label" htmlFor={inputId}><LocalizedText en="What do you want to get done?" /></label>
    <div className="goal-starter-row">
      <input
        id={inputId}
        name="goal"
        required
        minLength={GOAL_MIN_LENGTH}
        maxLength={GOAL_MAX_LENGTH}
        autoComplete="off"
        enterKeyHint="go"
        placeholder={t("e.g. Move to Germany for work")}
      />
      {mode === "preview"
        ? <button className="button" type="submit"><LocalizedText en="Get my plan" /> <span aria-hidden="true">→</span></button>
        : <PendingSubmitButton label="Create my plan" pendingLabel="Creating…" />}
    </div>
  </>;

  return <div className="goal-starter">
    {mode === "preview"
      ? <form action="/try" method="get" role="search" aria-label={t("Turn a goal into a plan")}>{fields}</form>
      : <form action={savePlan}><input type="hidden" name="lang" value={language} />{fields}</form>}
    <p className="goal-starter-examples">
      <span><LocalizedText en="Try:" /></span>
      {GOAL_EXAMPLES.map((example) => {
        const goal = t(example.goal);
        return <Link key={example.goal} href={`/try?goal=${encodeURIComponent(goal)}`} prefetch={false}>{goal}</Link>;
      })}
    </p>
    <p className="goal-starter-note">
      {mode === "preview"
        ? <LocalizedText en="Free, no account needed. The plan comes from our guides and templates, not from AI." />
        : <LocalizedText en="It is saved to your workspace straight away. You can change every step." />}
    </p>
  </div>;
}
