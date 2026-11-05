"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LocalizedText, useTranslate } from "./localized-text";

// Shown only while a mission has no real plan yet. Adding the steps goes
// through the same endpoint the manual form uses, one at a time, so a mission
// that rejects one step still keeps the ones that were accepted — and the user
// is told exactly how far it got rather than being left guessing.

export function SuggestedPlan({
  missionId,
  headline,
  steps,
  criteria,
  licensed,
}: {
  missionId: string;
  headline: string;
  steps: string[];
  criteria: string[];
  licensed: boolean;
}) {
  const t = useTranslate();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function addAll() {
    setBusy(true);
    setError("");
    let accepted = 0;
    for (const step of steps) {
      try {
        const response = await fetch(`/api/missions/${missionId}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: step }),
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as { error?: string };
          setError(data.error || "Those steps could not be added. Nothing after this one was attempted.");
          break;
        }
        accepted += 1;
        setAdded(accepted);
      } catch {
        setError("The connection dropped while adding steps. The ones already added were kept.");
        break;
      }
    }
    setBusy(false);
    if (accepted > 0) router.refresh();
  }

  return (
    <section className="card suggested-plan" aria-labelledby="suggested-plan-heading">
      <p className="eyebrow"><LocalizedText en="Suggested plan" /></p>
      <h2 id="suggested-plan-heading">{t(headline)}</h2>
      <p>
        <LocalizedText en="This mission states an outcome but nothing that would move it yet. These steps are a starting structure, not advice: each one is work you do and evidence you record." />
      </p>
      {licensed && <p className="form-note">
        <LocalizedText en="This looks like a regulated activity. Nothing here tells you what the rules are — the first step is to get them in writing from the authority that sets them." />
      </p>}

      <ol className="suggested-plan-steps">
        {steps.map((step, index) => <li key={step}>
          <span className="suggested-plan-number" aria-hidden="true">{index + 1}</span>
          <span>{t(step)}</span>
        </li>)}
      </ol>

      {criteria.length > 0 && <div className="suggested-plan-criteria">
        <p className="eyebrow"><LocalizedText en="Judge it finished by" /></p>
        <ul>{criteria.map((item) => <li key={item}>{t(item)}</li>)}</ul>
        <p className="suggested-plan-hint">
          <LocalizedText en="Copy any of these into the success criteria field below if you want them recorded." />
        </p>
      </div>}

      {error && <p className="field-error" role="alert">{t(error)}</p>}
      {added > 0 && !busy && !error && <p className="suggested-plan-done" role="status">
        {`${added} `}<LocalizedText en="steps added to this mission." />
      </p>}

      <div className="action-control-group">
        <button className="button" type="button" onClick={addAll} disabled={busy}>
          {busy
            ? <>{t("Adding…")}</>
            : <LocalizedText en="Add these steps" />}
        </button>
        <button className="button button-quiet" type="button" onClick={() => setDismissed(true)} disabled={busy}>
          <LocalizedText en="I'll plan it myself" />
        </button>
      </div>
    </section>
  );
}
