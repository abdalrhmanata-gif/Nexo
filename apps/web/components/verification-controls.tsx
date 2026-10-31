"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { MissionVerification } from "../lib/view-models";
import { useUiTranslation } from "./localized-text";

export function VerificationControls({ missionId, verification }: { missionId: string; verification?: MissionVerification }) {
  const router = useRouter();
  const t = useUiTranslation();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/missions/${missionId}/verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "VERIFIED",
          criteria: { summary: String(form.get("criteria") ?? "") },
          evidence: { summary: String(form.get("evidence") ?? "") },
          confidence: Number(form.get("confidence") ?? 0),
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error ?? t("Verification failed."));
        return;
      }
      setMessage(t("Verification recorded. Refreshing mission state…"));
      router.refresh();
    } catch {
      setMessage(t("Verification could not be saved. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  async function commit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/missions/${missionId}/outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId: verification?.id, result: { summary: String(form.get("result") ?? "") }, successScore: Number(form.get("score") ?? 1), status: "COMPLETED" }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error ?? t("Outcome could not be committed."));
        return;
      }
      setMessage(t("Verified outcome committed."));
      router.refresh();
    } catch {
      setMessage(t("Outcome could not be committed. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  if (verification?.status === "VERIFIED") return <div className="form-grid"><form onSubmit={commit}><div className="field"><label htmlFor="result">{t("Outcome result")}</label><textarea id="result" name="result" required /></div><div className="field"><label htmlFor="score">{t("Success score")}</label><input id="score" name="score" type="number" min="0" max="1" step="0.01" defaultValue="1" /></div><button className="button" type="submit" disabled={busy}>{t("Commit verified outcome")}</button></form>{message && <div className="field-error" role="alert">{message}</div>}</div>;
  return <div className="form-grid"><form onSubmit={verify}><div className="field"><label htmlFor="criteria">{t("Verification criteria")}</label><textarea id="criteria" name="criteria" required /></div><div className="field"><label htmlFor="evidence">{t("Evidence summary")}</label><textarea id="evidence" name="evidence" required /></div><div className="field"><label htmlFor="confidence">{t("Confidence")}</label><input id="confidence" name="confidence" type="number" min="0" max="1" step="0.01" defaultValue="1" /></div><button className="button" type="submit" disabled={busy}>{t("Record verification")}</button></form>{message && <div className="field-error" role="alert">{message}</div>}</div>;
}
