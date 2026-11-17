"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { shareMessage } from "../lib/mission-share.mjs";
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
      // A phone's share sheet passes the name on to the app that is picked. A
      // computer's often keeps only the address, so there the name and the
      // link are copied together instead.
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        setState("idle");
        await navigator.share({ title, text: title, url: data.url }).catch(() => undefined);
        return;
      }
      await navigator.clipboard.writeText(shareMessage(title, data.url));
      setState("copied");
      window.setTimeout(() => setState("idle"), 1800);
    } catch {
      setState("idle");
      setError("The link could not be created. Try again.");
    }
  }

  async function stop() {
    setError("");
    const response = await fetch(`/api/missions/${missionId}/share`, { method: "DELETE" }).catch(() => null);
    if (!response?.ok) { setError("Sharing could not be stopped. Try again."); return; }
    setState("stopped");
    router.refresh();
  }

  return (
    <span className="share-mission no-print">
      <button className="button button-quiet" type="button" disabled={state === "busy"} onClick={share}>
        {state === "copied" ? <LocalizedText en="Copied" /> : <LocalizedText en="Share result" />}
      </button>
      {shared && state !== "stopped" && <>
        <small className="share-mission-status"><LocalizedFill en="Shared: opened {views} times, remixed {remixes} times." values={{ views: shared.views, remixes: shared.remixes }} /></small>
        <button className="button button-small button-quiet" type="button" onClick={stop}><LocalizedText en="Stop sharing" /></button>
      </>}
      {state === "stopped" && <small className="share-mission-status" role="status"><LocalizedText en="Sharing stopped. The link no longer works." /></small>}
      {error && <small className="field-error" role="alert"><LocalizedText en={error} /></small>}
    </span>
  );
}
