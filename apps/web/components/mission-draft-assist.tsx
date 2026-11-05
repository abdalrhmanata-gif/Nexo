"use client";

import { useEffect, useRef, useState } from "react";
import { planHeadline, suggestPlanFor, type SuggestedPlan } from "../lib/mission-planner.mjs";
import { LocalizedText, useTranslate } from "./localized-text";

// The empty mission is created here, not on the detail page: someone states an
// outcome, has nothing concrete to type into "success criteria" or "first
// steps", and submits a mission that cannot move. This reads what they have
// already written and offers the structure before that happens.
//
// It enhances the form rather than replacing it. The form still posts and still
// works with this component inert — reading the fields through the DOM, rather
// than taking them over as controlled inputs, is what keeps that true.

const DEBOUNCE_MS = 300;

function field(form: HTMLFormElement | null, name: string): HTMLTextAreaElement | HTMLInputElement | null {
  const element = form?.elements.namedItem(name);
  return element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement ? element : null;
}

/** Append only the lines that are not already there, so nothing typed is lost. */
function appendLines(target: HTMLTextAreaElement | HTMLInputElement, lines: string[]): number {
  const existing = target.value.split("\n").map((line) => line.trim()).filter(Boolean);
  const additions = lines.filter((line) => !existing.includes(line.trim()));
  if (additions.length === 0) return 0;
  target.value = [...existing, ...additions].join("\n");
  target.dispatchEvent(new Event("input", { bubbles: true }));
  return additions.length;
}

export function MissionDraftAssist({ formId }: { formId: string }) {
  const t = useTranslate();
  const [plan, setPlan] = useState<SuggestedPlan | null>(null);
  // Held as a count plus a key, never as an interpolated sentence: t() looks
  // the string up in the table, and "3 steps added" would never be in it.
  const [notice, setNotice] = useState<{ count: number; key: string } | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const form = document.getElementById(formId);
    if (!(form instanceof HTMLFormElement)) return;
    formRef.current = form;

    let timer: number | undefined;
    const recompute = () => {
      const name = field(form, "name")?.value ?? "";
      const intent = field(form, "intent")?.value ?? "";
      const criteria = (field(form, "criteria")?.value ?? "").split("\n").filter(Boolean);
      setPlan(suggestPlanFor({ name, intent, criteria, actions: [] }));
    };
    const onInput = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(recompute, DEBOUNCE_MS);
    };

    recompute();
    form.addEventListener("input", onInput);
    return () => {
      window.clearTimeout(timer);
      form.removeEventListener("input", onInput);
    };
  }, [formId]);

  if (!plan) return null;

  const use = (name: string, lines: string[], singular: string, plural: string) => {
    const target = field(formRef.current, name);
    if (!target) return;
    const added = appendLines(target, lines.map((line) => t(line)));
    setNotice(added === 0
      ? { count: 0, key: "Those are already in the field." }
      : { count: added, key: added === 1 ? singular : plural });
  };

  return (
    <aside className="draft-assist" aria-live="polite">
      <p className="eyebrow"><LocalizedText en="Suggested plan" /></p>
      <h2>{t(planHeadline(plan.kind))}</h2>
      <p className="draft-assist-lead">
        <LocalizedText en="Based on what you have typed so far. Nothing is saved until you create the mission." />
      </p>
      {plan.licensed && <p className="form-note">
        <LocalizedText en="This looks like a regulated activity. Nothing here tells you what the rules are — the first step is to get them in writing from the authority that sets them." />
      </p>}

      <ol className="draft-assist-steps">
        {plan.steps.map((step) => <li key={step}>{t(step)}</li>)}
      </ol>

      {notice && <p className="draft-assist-notice" role="status">
        {notice.count > 0 && `${notice.count} `}{t(notice.key)}
      </p>}

      <div className="draft-assist-actions">
        <button className="button button-small" type="button"
          onClick={() => use("actions", plan.steps, "step added to first steps.", "steps added to first steps.")}>
          <LocalizedText en="Add these as first steps" />
        </button>
        {plan.criteria.length > 0 && <button className="button button-small button-quiet" type="button"
          onClick={() => use("criteria", plan.criteria, "criterion added.", "criteria added.")}>
          <LocalizedText en="Add the success criteria" />
        </button>}
      </div>
    </aside>
  );
}
