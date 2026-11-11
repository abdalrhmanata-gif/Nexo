"use client";

import { fill as fillText } from "../lib/i18n";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LocalizedText, useTranslate } from "./localized-text";
import type { MissionPlanReport } from "../lib/mission-plan-ai.d.mts";

// The plan a model drafts, shown the way this product shows anything else:
// with what it does not know kept in view rather than smoothed over.
//
// Three things are deliberate here.
//
// Nothing is saved until the person says so. The draft lives in this
// component until they add the steps, so a bad plan costs a glance.
//
// Every step that depends on an outside fact — a fee, a rule, a waiting
// time — shows where to confirm it instead of stating it. The server rejects
// a plan that states one anyway, so this is a second place the same promise
// is kept rather than the only one.
//
// `unknowns` is given as much room as the steps. A plan that quietly assumes
// your situation is the kind that wastes a week.

export function AiMissionPlan({ missionId, name, intent, criteria, actions }: {
  missionId: string;
  name: string;
  intent: string;
  criteria: string[];
  actions: string[];
}) {
  const t = useTranslate();
  const router = useRouter();
  const [plan, setPlan] = useState<MissionPlanReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(0);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [notReady, setNotReady] = useState("");
  const [allowance, setAllowance] = useState<{ left: number; limit: number } | null>(null);
  const [accountId, setAccountId] = useState("");

  // Ask once, on mount, whether this deployment can draft at all. It reads
  // configuration and returns — no provider, no generation — so the owner
  // learns that a model name is wrong without paying to find out, and a
  // visitor who is not on the allowlist simply never sees the panel.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/missions/plan", { method: "GET" });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (response.status === 403) {
          // Signed in, but not on the preview allowlist. Saying so beats
          // vanishing: the reader learns the feature exists, and the owner
          // can tell a mistyped user id from a deployment that never
          // shipped. Hiding made those two look identical.
          setNotReady(String(payload.error || ""));
          // Only ever a UUID: this is rendered, so nothing else is accepted.
          if (typeof payload.accountId === "string" && /^[0-9a-f-]{36}$/i.test(payload.accountId)) {
            setAccountId(payload.accountId);
          }
          return;
        }
        if (!response.ok) { setUnavailable(true); return; }
        if (payload.ready === false) setNotReady(String(payload.detail || ""));
      } catch {
        // A failed check is not a reason to hide the button; pressing it
        // will give a clearer answer than silence.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function draft() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/missions/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          intent,
          existingCriteria: criteria.slice(0, 10),
          existingActions: actions.slice(0, 20),
          language: document.documentElement.lang || "en",
        }),
      });
      const payload = await response.json().catch(() => ({}));
      // Shown after every attempt, failed ones too: "this used one monthly
      // generation" with no number beside it reads as "none left".
      const usage = payload?.usage ?? payload?.meta?.usage;
      if (usage && Number.isInteger(usage.remaining) && Number.isInteger(usage.monthlyLimit)) {
        setAllowance({ left: Math.max(0, usage.remaining), limit: usage.monthlyLimit });
      }
      if (!response.ok) {
        // A deployment with no provider should stop offering the button
        // rather than inviting the same refusal again.
        if (payload.code === "AI_ANALYSIS_NOT_CONFIGURED" || payload.code === "AI_ACCESS_RESTRICTED") {
          setNotReady(typeof payload.error === "string" ? payload.error : "");
        }
        setError(typeof payload.error === "string" ? payload.error : t("The AI plan could not be completed. This attempt used one monthly generation; no automatic retry was attempted."));
        return;
      }
      setPlan(payload.plan as MissionPlanReport);
    } catch {
      setError(t("The AI plan could not be completed. This attempt used one monthly generation; no automatic retry was attempted."));
    } finally {
      setBusy(false);
    }
  }

  async function addSteps() {
    if (!plan) return;
    setAdding(true);
    setError("");
    let accepted = 0;
    // One at a time through the ordinary endpoint, so a mission that rejects
    // one step keeps the ones it accepted and the person is told how far it
    // got rather than being left to guess.
    for (const item of plan.steps) {
      try {
        const response = await fetch(`/api/missions/${missionId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: item.step }),
        });
        if (response.ok) accepted += 1;
      } catch {
        break;
      }
    }
    setAdded(accepted);
    setAdding(false);
    if (accepted > 0) router.refresh();
  }

  if (unavailable && !plan) return null;

  return (
    <section className="card suggested-plan" aria-labelledby="ai-plan-heading">
      <p className="eyebrow"><LocalizedText en="AI draft" /></p>
      <h2 id="ai-plan-heading"><LocalizedText en="Let AI draft the shape of this work" /></h2>

      {!plan && <>
        {notReady
          ? <>
            <p className="field-error" role="status">{t(notReady)}</p>
            {accountId && <p className="account-id-note">
              <LocalizedText en="Your account ID, which the person running this site needs to approve you:" />{" "}
              <code dir="ltr">{accountId}</code>
            </p>}
          </>
          : <p>
            <LocalizedText en="It will suggest the steps and what each one is for. It will not tell you a fee, a waiting time or a rule: it has looked nothing up, so anything external comes back as where to confirm it." />
          </p>}
        <div className="action-control-group">
          <button className="button" type="button" onClick={draft} disabled={busy || notReady !== ""}>
            {busy ? t("Drafting…") : t("Draft a plan")}
          </button>
        </div>
      </>}

      {plan && <>
        <p className="suggested-plan-hint">{plan.understanding}</p>

        {plan.cautions.length > 0 && <div className="form-note">
          {plan.cautions.map((caution) => <p key={caution}>{caution}</p>)}
        </div>}

        <ol className="suggested-plan-steps">
          {plan.steps.map((item, index) => <li key={item.step}>
            <span className="suggested-plan-number" aria-hidden="true">{index + 1}</span>
            <span>
              <strong>{item.step}</strong>
              <br />{item.why}
              {item.checkWith && <><br /><em>{t("Confirm with:")} {item.checkWith}</em></>}
            </span>
          </li>)}
        </ol>

        {plan.successCriteria.length > 0 && <div className="suggested-plan-criteria">
          <p className="eyebrow"><LocalizedText en="Judge it finished by" /></p>
          <ul>{plan.successCriteria.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>}

        {plan.unknowns.length > 0 && <div className="suggested-plan-criteria">
          <p className="eyebrow"><LocalizedText en="Answer these yourself" /></p>
          <ul>{plan.unknowns.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>}

        <p className="action-hint">
          <LocalizedText en="Drafted by a model from your own words. Nothing was looked up, and nothing is saved until you add it." />
        </p>

        {added > 0 && !adding && <p className="suggested-plan-done" role="status">
          {`${added} `}<LocalizedText en="steps added to this mission." />
        </p>}

        <div className="action-control-group">
          <button className="button" type="button" onClick={addSteps} disabled={adding || added > 0}>
            {adding ? t("Adding…") : t("Add these steps")}
          </button>
          <button className="button button-quiet" type="button" onClick={() => { setPlan(null); setAdded(0); }} disabled={adding}>
            <LocalizedText en="Discard this draft" />
          </button>
        </div>
      </>}

      {error && <p className="field-error" role="alert">{t(error)}</p>}
      {allowance && <p className="account-id-note" role="status">
        {fillText(t("{left} of {limit} AI drafts left this month."), { left: allowance.left, limit: allowance.limit })}
      </p>}
    </section>
  );
}
