"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useUiTranslation } from "./localized-text";

export function AddActionForm({ missionId }: { missionId: string }) {
  const router = useRouter();
  const t = useUiTranslation();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setMessage(t("Describe the work this action covers."));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/missions/${missionId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error ?? t("That action could not be added."));
        return;
      }
      setTitle("");
      setMessage(t("Action added."));
      router.refresh();
    } catch {
      setMessage(t("The action could not be saved. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  return <form onSubmit={submit} className="add-action">
    <div className="action-control">
      <label className="visually-hidden" htmlFor="new-action">{t("Add an action")}</label>
      <input
        id="new-action"
        name="title"
        value={title}
        disabled={busy}
        placeholder={t("What needs to happen next?")}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button className="button button-small" type="submit" disabled={busy}>{busy ? t("Adding…") : t("Add action")}</button>
    </div>
    <p className="action-hint">{t("Plans change. Add a step whenever you discover one.")}</p>
    {message && <p className="field-error" role="alert">{message}</p>}
  </form>;
}
