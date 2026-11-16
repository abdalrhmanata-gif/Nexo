"use client";

import { useState } from "react";
import { LocalizedText } from "./localized-text";

type ShareMissionSnapshot = {
  name: string;
  intent: string;
  criteria: string[];
  completedSteps: string[];
  status: string;
  progress: number;
  outcome?: {
    status: string;
    successScore: number;
    result: Record<string, unknown>;
  };
};

function publicSnapshot(snapshot: ShareMissionSnapshot): ShareMissionSnapshot {
  const primitiveResult = snapshot.outcome
    ? Object.fromEntries(
        Object.entries(snapshot.outcome.result)
          .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
          .slice(0, 8)
          .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 500) : value]),
      )
    : undefined;

  return {
    ...snapshot,
    criteria: snapshot.criteria.slice(0, 8),
    completedSteps: snapshot.completedSteps.slice(0, 8),
    outcome: snapshot.outcome
      ? { ...snapshot.outcome, result: primitiveResult ?? {} }
      : undefined,
  };
}

function encodeSnapshot(snapshot: ShareMissionSnapshot) {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function ShareMissionButton({ snapshot }: { snapshot: ShareMissionSnapshot }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const encoded = encodeSnapshot(publicSnapshot(snapshot));
    const url = new URL("/share/mission", window.location.origin);
    url.searchParams.set("data", encoded);

    try {
      if (navigator.share) {
        await navigator.share({
          title: snapshot.name,
          text: snapshot.outcome ? "See what this AI Mission produced." : "See this AI Mission.",
          url: url.toString(),
        });
        return;
      }
      await navigator.clipboard.writeText(url.toString());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // User cancellation and clipboard failures should not interrupt the mission.
    }
  }

  return (
    <button className="button button-quiet no-print" type="button" onClick={share}>
      {copied ? <LocalizedText en="Link copied" /> : <LocalizedText en="Share result" />}
    </button>
  );
}
