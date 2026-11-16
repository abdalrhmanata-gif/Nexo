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

function isSafeResultKey(key: string) {
  if (key.length < 1 || key.length > 50) return false;
  const lower = key.toLowerCase();
  const forbidden = ["email", "token", "secret", "password", "credential", "owner", "workspace", "user", "phone", "address", "authorization", "session", "customerid"];
  if (forbidden.some((word) => lower.includes(word))) return false;
  return key.split("").every((char) => {
    const code = char.charCodeAt(0);
    return (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      char === " " || char === "_" || char === "-";
  });
}

function publicSnapshot(snapshot: ShareMissionSnapshot): ShareMissionSnapshot {
  const primitiveResult = snapshot.outcome
    ? Object.fromEntries(
        Object.entries(snapshot.outcome.result)
          .filter(([key, value]) =>
            isSafeResultKey(key) &&
            ["string", "number", "boolean"].includes(typeof value),
          )
          .slice(0, 4)
          .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 240) : value]),
      )
    : undefined;

  return {
    ...snapshot,
    name: snapshot.name.slice(0, 100),
    intent: snapshot.intent.slice(0, 700),
    criteria: snapshot.criteria.slice(0, 6).map((item) => item.slice(0, 180)),
    completedSteps: snapshot.completedSteps.slice(0, 6).map((item) => item.slice(0, 140)),
    outcome: snapshot.outcome
      ? { ...snapshot.outcome, result: primitiveResult ?? {} }
      : undefined,
  };
}

function encodeSnapshot(snapshot: ShareMissionSnapshot) {
  const json = JSON.stringify(snapshot);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
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
      {copied ? <LocalizedText en="Copied" /> : <LocalizedText en="Share result" />}
    </button>
  );
}
