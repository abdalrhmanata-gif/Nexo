"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { LocalizedText, fill, useTranslate } from "./localized-text";
import { useRouter } from "next/navigation";
import type { ActionStatus, MissionAction } from "../lib/view-models";
import {
  actionStatusLabel,
  allowedNextStatuses,
  followUpInputValue,
  isTerminalActionStatus,
  supportsFollowUp,
} from "../lib/mission-content.mjs";
import { PROOF_NOTE_MAX, hasProof, proofLinkLabel } from "../lib/step-proof.mjs";

/**
 * Controls for one step. "Mark done" is the main path: one tap from any open
 * state, with an optional note and link as proof. The status menu stays for
 * the less common moves (start, wait, cancel). A done step shows its proof
 * and lets the user add or correct it later.
 */
export function ActionMutationControls({ missionId, action, closed = false }: { missionId: string; action: MissionAction; closed?: boolean }) {
  const t = useTranslate();
  const router = useRouter();
  const [status, setStatus] = useState<ActionStatus>(action.status);
  const [followUp, setFollowUp] = useState(followUpInputValue(action.followUpAt));
  const [proofOpen, setProofOpen] = useState(false);
  const [note, setNote] = useState(action.evidenceNote ?? "");
  const [link, setLink] = useState(action.evidenceUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  // The page's fresh state comes from a server refresh that can take a few
  // seconds. Until it lands, the step must not look finished here while the
  // rest of the page still shows it open.
  const [refreshing, startRefresh] = useTransition();
  const working = busy || refreshing;

  useEffect(() => {
    setStatus(action.status);
    setFollowUp(followUpInputValue(action.followUpAt));
    setNote(action.evidenceNote ?? "");
    setLink(action.evidenceUrl ?? "");
    setProofOpen(false);
    // The fresh state on screen is the confirmation now; an old "saved" line
    // under every step read as noise.
    setMessage("");
    setSaved(false);
  }, [action.id, action.status, action.followUpAt, action.version, action.evidenceNote, action.evidenceUrl]);

  async function send(method: "PATCH" | "PUT", body: Record<string, unknown>, done: string) {
    setBusy(true);
    setMessage("");
    setSaved(false);
    try {
      const response = await fetch(`/api/missions/${missionId}/actions/${action.id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, expectedVersion: action.version }),
      });
      if (response.status === 409) {
        setMessage(t("This action changed elsewhere. Showing the latest saved state."));
        router.refresh();
        return;
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setMessage(payload.error ? t(payload.error) : t("Action update was not accepted."));
        return;
      }
      // The form stays as it is, its button saying "Saving…", until the
      // refreshed page arrives with the step in its new state; that state is
      // the confirmation. The line below shows only if nothing changed on
      // screen (for example a proof saved with the same text).
      setSaved(true);
      setMessage(done);
      startRefresh(() => {
        router.refresh();
      });
    } catch {
      setMessage(t("The action could not be saved. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  const proofFields = <>
    <label className="proof-label" htmlFor={`proof-note-${action.id}`}><LocalizedText en="How do you know it is done? (optional)" /></label>
    <input
      id={`proof-note-${action.id}`}
      name="evidenceNote"
      value={note}
      maxLength={PROOF_NOTE_MAX}
      disabled={working}
      placeholder={t("For example: Paid, confirmation 4471")}
      onChange={(event) => setNote(event.target.value)}
    />
    <label className="visually-hidden" htmlFor={`proof-link-${action.id}`}>{t("Link (optional)")}</label>
    <input
      id={`proof-link-${action.id}`}
      name="evidenceUrl"
      type="text"
      inputMode="url"
      autoComplete="off"
      value={link}
      disabled={working}
      placeholder={t("Link to a receipt, page or file (optional)")}
      onChange={(event) => setLink(event.target.value)}
    />
  </>;

  if (action.status === "COMPLETED") {
    const proven = hasProof(action);
    return <div className="action-control-group action-proof">
      {proven && <p className="action-proof-text">
        <span className="action-proof-label">{t("Proof:")}</span>{" "}
        {action.evidenceNote && <span>{action.evidenceNote}</span>}
        {action.evidenceNote && action.evidenceUrl && " · "}
        {action.evidenceUrl && <a href={action.evidenceUrl} target="_blank" rel="noopener noreferrer nofollow ugc">{proofLinkLabel(action.evidenceUrl)}</a>}
      </p>}
      {closed ? null : proofOpen
        ? <form className="proof-form" onSubmit={(event) => {
          event.preventDefault();
          void send("PUT", { evidenceNote: note, evidenceUrl: link }, t("Proof saved."));
        }}>
          {proofFields}
          <div className="proof-actions">
            <button className="button button-small" type="submit" disabled={working}>{working ? t("Saving…") : t("Save proof")}</button>
            <button className="button button-small button-quiet" type="button" disabled={working} onClick={() => setProofOpen(false)}>{t("Cancel")}</button>
          </div>
        </form>
        : <button className="button button-small button-quiet" type="button" onClick={() => setProofOpen(true)}>{proven ? t("Edit proof") : t("Add proof")}</button>}
      {message && !refreshing && (saved
      ? <p className="action-saved" role="status">{message}</p>
      : <p className="field-error" role="alert">{message}</p>)}
    </div>;
  }

  if (isTerminalActionStatus(action.status)) {
    return <p className="action-final">{fill(t("{state} — no further changes."), { state: actionStatusLabel(action.status, t) })}</p>;
  }

  // Done has its own button, so the menu keeps only the other moves.
  const options: ActionStatus[] = [action.status, ...allowedNextStatuses(action.status).filter((value: ActionStatus) => value !== "COMPLETED")];
  const wantsFollowUp = supportsFollowUp(status);
  const losesFollowUp = Boolean(action.followUpAt) && !wantsFollowUp;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send("PATCH", {
      status,
      ...(wantsFollowUp ? { followUpAt: followUp ? new Date(`${followUp}T09:00:00`).toISOString() : null } : {}),
    }, t("Action saved."));
  }

  return <div className="action-control-group">
    <div className="action-control">
      {!proofOpen && <button className="button button-small" type="button" disabled={working} onClick={() => setProofOpen(true)}>
        <span aria-hidden="true">✓ </span>{t("Mark done")}
      </button>}
      <form onSubmit={submit} className="action-control-menu">
        <label className="visually-hidden" htmlFor={`status-${action.id}`}>{fill(t("Status for {title}"), { title: action.title })}</label>
        <select
          id={`status-${action.id}`}
          name="status"
          value={status}
          disabled={working}
          onChange={(event) => setStatus(event.target.value as ActionStatus)}
        >
          {options.map((value) => <option key={value} value={value}>{actionStatusLabel(value, t)}</option>)}
        </select>
        {wantsFollowUp && <>
          <label className="visually-hidden" htmlFor={`follow-up-${action.id}`}>{fill(t("Follow up on {title}"), { title: action.title })}</label>
          <input
            id={`follow-up-${action.id}`}
            type="date"
            name="followUpAt"
            value={followUp}
            disabled={working}
            onChange={(event) => setFollowUp(event.target.value)}
          />
        </>}
        {status !== action.status || wantsFollowUp
          ? <button className="button button-small button-quiet" type="submit" disabled={working}>{working ? t("Saving…") : t("Save")}</button>
          : null}
      </form>
    </div>
    {proofOpen && <form className="proof-form" onSubmit={(event) => {
      event.preventDefault();
      void send("PATCH", { status: "COMPLETED", evidenceNote: note, evidenceUrl: link }, t("Step marked done."));
    }}>
      {proofFields}
      <div className="proof-actions">
        <button className="button button-small" type="submit" disabled={working}>{working ? t("Saving…") : t("Save as done")}</button>
        <button className="button button-small button-quiet" type="button" disabled={working} onClick={() => setProofOpen(false)}>{t("Cancel")}</button>
      </div>
    </form>}
    {wantsFollowUp && <p className="action-hint"><LocalizedText en="Optional: the date you intend to check back. Leave empty for no reminder." /></p>}
    {losesFollowUp && <p className="action-hint"><LocalizedText en="Saving this will remove the follow-up date, because it only applies while Waiting." /></p>}
    {message && !refreshing && (saved
      ? <p className="action-saved" role="status">{message}</p>
      : <p className="field-error" role="alert">{message}</p>)}
  </div>;
}
