"use client";

import { FormEvent, useState } from "react";

export function AddActionForm({ missionId }: { missionId: string }) {
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setMessage("Describe the work this action covers.");
      return;
    }
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/missions/${missionId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmed }),
    });
    if (response.ok) {
      window.location.reload();
      return;
    }
    setBusy(false);
    const payload = await response.json().catch(() => ({}));
    setMessage(payload.error ?? "That action could not be added.");
  }

  return <form onSubmit={submit} className="add-action">
    <div className="action-control">
      <label className="visually-hidden" htmlFor="new-action">Add an action</label>
      <input
        id="new-action"
        name="title"
        value={title}
        disabled={busy}
        placeholder="What needs to happen next?"
        onChange={(event) => setTitle(event.target.value)}
      />
      <button className="button button-small" type="submit" disabled={busy}>{busy ? "Adding…" : "Add action"}</button>
    </div>
    <p className="action-hint">Plans change. Add a step whenever you discover one.</p>
    {message && <p className="field-error" role="alert">{message}</p>}
  </form>;
}
