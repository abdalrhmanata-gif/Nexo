"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslate } from "./localized-text";
import { ownerName, type StepOwnerEditor } from "../lib/step-owners.mjs";

/**
 * Who owns one step. Editors of the workspace pick from the team; everyone
 * else sees the name. The choice is saved at once and the page refreshes, so
 * the whole team sees the same owner.
 */
export function StepOwnerPicker({ missionId, actionId, version, editors, ownerId, editable }: {
  missionId: string;
  actionId: string;
  version: number;
  editors: StepOwnerEditor[];
  ownerId: string | null;
  editable: boolean;
}) {
  const t = useTranslate();
  const router = useRouter();
  const [value, setValue] = useState(ownerId ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshing, startRefresh] = useTransition();
  const working = busy || refreshing;
  const owner = editors.find((editor) => editor.id === ownerId) ?? null;

  useEffect(() => {
    setValue(ownerId ?? "");
    setMessage("");
  }, [ownerId, version]);

  if (!editable) {
    return owner ? <span className="step-owner">{t("Owner:")} {ownerName(owner, t)}</span> : null;
  }

  async function choose(next: string) {
    const previous = value;
    setValue(next);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/missions/${missionId}/actions/${actionId}/owner`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: version, assigneeId: next || null }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setValue(previous);
        setMessage(payload.error ? t(payload.error) : t("The owner could not be saved. Try again."));
        if (response.status === 409) startRefresh(() => { router.refresh(); });
        return;
      }
      startRefresh(() => { router.refresh(); });
    } catch {
      setValue(previous);
      setMessage(t("The owner could not be saved. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return <span className="step-owner step-owner-edit">
    <label>
      <span>{t("Step owner")}</span>
      <select value={value} disabled={working} onChange={(event) => { void choose(event.target.value); }} aria-busy={working}>
        <option value="">{t("No owner")}</option>
        {editors.map((editor) => <option key={editor.id} value={editor.id}>
          {editor.isYou ? t("You") : editor.email}
        </option>)}
      </select>
    </label>
    {working && <span className="action-hint">{t("Saving…")}</span>}
    {message && !working && <span className="field-error" role="alert">{message}</span>}
  </span>;
}
