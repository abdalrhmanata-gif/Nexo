"use client";

import { useLanguage, useTranslate } from "./localized-text";
import { nextStepFor } from "../lib/mission-content.mjs";
import type { Mission } from "../lib/view-models";

// The line on a mission card that says what happens next.
//
// MissionCard is a synchronous server component and cannot await a
// translator, so it used to call nextStepFor() with none and print the
// English it got back: "Start next action" in the middle of an Arabic card.
// This is the same computation, run where the reader's language is known.
export function MissionNextStep({ mission, prefix }: { mission: Mission; prefix?: string }) {
  const t = useTranslate();
  const language = useLanguage();
  const next = nextStepFor(mission, t, language);
  return (
    <p className={`next-step next-step-${next.tone}`}>
      <span className="next-step-label">{prefix ? `${t(prefix)} ${next.label}` : next.label}</span>
      <span className="next-step-detail">{next.detail}</span>
    </p>
  );
}
