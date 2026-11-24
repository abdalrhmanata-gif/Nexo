"use client";

import { useEffect, useState } from "react";
import { LocalizedFill, LocalizedText, useLanguage } from "./localized-text";
import { countdown, todayIn } from "../lib/plan-dates.mjs";

/**
 * A plan date (YYYY-MM-DD) in the reader's language. Formatted in UTC on
 * purpose: a calendar date has no time zone, and UTC keeps it from shifting a
 * day for readers west of Greenwich.
 */
export function PlanDay({ value }: { value: string }) {
  const language = useLanguage();
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return <>{value}</>;
  return <time dateTime={value}>{date.toLocaleDateString(language, { dateStyle: "medium", timeZone: "UTC" })}</time>;
}

/** The reader's own today: UTC for the first render (server and browser agree), then local. */
function useToday() {
  const [today, setToday] = useState(() => todayIn("UTC"));
  useEffect(() => {
    setToday(todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone));
  }, []);
  return today;
}

/** "23 days to go", "Today is the day" or "5 days past the target date". */
export function PlanCountdown({ target }: { target: string }) {
  const today = useToday();
  const left = countdown(target, today);
  if (left.kind === "today") return <strong className="plan-countdown plan-countdown-today"><LocalizedText en="Today is the day" /></strong>;
  if (left.kind === "past") {
    return <strong className="plan-countdown plan-countdown-past">
      <LocalizedFill en={left.days === 1 ? "1 day past the target date" : "{days} days past the target date"} values={{ days: left.days }} />
    </strong>;
  }
  return <strong className="plan-countdown">
    <LocalizedFill en={left.days === 1 ? "1 day to go" : "{days} days to go"} values={{ days: left.days }} />
  </strong>;
}
