"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { shareMessage, shareTargets } from "../lib/mission-share.mjs";
import { LocalizedFill, LocalizedText } from "./localized-text";

export type MissionShareStatus = { views: number; remixes: number } | null;

/**
 * "Share result" publishes a stored copy of this mission's public face and
 * hands over its link. The copy is built on the server; this button sends
 * only the request. While a link is live it shows how often it was opened
 * and remixed, and lets the person stop sharing.
 */
export function ShareMissionButton({ missionId, shared }: { missionId: string; shared: MissionShareStatus }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "copied" | "stopped">("idle");
  const [error, setError] = useState("");
  const [link, setLink] = useState<{ url: string; name: string } | null>(null);

  async function share() {
    setError(""); setState("busy");
    try {
      const response = await fetch(`/api/missions/${missionId}/share`, { method: "POST" });
      const data = await response.json().catch(() => ({})) as { url?: unknown; name?: unknown; error?: unknown };
      if (!response.ok || typeof data.url !== "string") {
        setState("idle");
        setError(typeof data.error === "string" ? data.error : "The link could not be created. Try again.");
        return;
      }
      router.refresh();
      // The name travels with the link, so an email or a chat shows what it is.
      const title = typeof data.name === "string" ? data.name : "";
      // The panel offers the places people share to. A phone also gets its
      // own share sheet, which passes the name on to the app that is picked.
      setLink({ url: data.url, name: typeof data.name === "string" ? data.name : "" });
      setState("idle");
    } catch {
      setState("idle");
      setError("The link could not be created. Try again.");
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(shareMessage(link.name, link.url));
      setState("copied");
      window.setTimeout(() => setState("idle"), 1800);
    } catch {
      setError("Copy the link from the box.");
    }
  }

  async function more() {
    if (!link || !navigator.share) return;
    await navigator.share({ title: link.name, text: link.name, url: link.url }).catch(() => undefined);
  }

  async function stop() {
    setError("");
    const response = await fetch(`/api/missions/${missionId}/share`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) { setError("Sharing could not be stopped. Try again."); return; }
    setState("stopped");
    setLink(null);
    router.refresh();
  }

  return (
    <span className="share-mission no-print">
      <button className="button button-quiet" type="button" disabled={state === "busy"} onClick={share}>
        <LocalizedText en="Share result" />
      </button>
      {link && (
        <span className="share-panel" role="group" aria-label={link.name}>
          <input className="share-panel-url" readOnly value={link.url} aria-label="URL" onFocus={(event) => event.currentTarget.select()} />
          <button className="button button-small" type="button" onClick={copy}>
            {state === "copied" ? <LocalizedText en="Copied" /> : <LocalizedText en="Copy link" />}
          </button>
          {shareTargets(link.name, link.url).map((target) => (
            <a key={target.id} className="button button-small button-quiet" href={target.href} target={target.id === "email" ? undefined : "_blank"} rel="noopener noreferrer">{target.label}</a>
          ))}
          {typeof navigator !== "undefined" && "share" in navigator && (
            <button className="button button-small button-quiet" type="button" onClick={more}><LocalizedText en="More" /></button>
          )}
          <button className="button button-small button-quiet" type="button" onClick={() => setLink(null)}><LocalizedText en="Close" /></button>
        </span>
      )}
      {shared && state !== "stopped" && <>
        <small className="share-mission-status"><LocalizedFill en="Shared: opened {views} times, remixed {remixes} times." values={{ views: shared.views, remixes: shared.remixes }} /></small>
        <button className="button button-small button-quiet" type="button" onClick={stop}><LocalizedText en="Stop sharing" /></button>
      </>}
      {state === "stopped" && <small className="share-mission-status" role="status"><LocalizedText en="Sharing stopped. The link no longer works." /></small>}
      {error && <small className="field-error" role="alert"><LocalizedText en={error} /></small>}
    </span>
  );
}
