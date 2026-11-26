"use client";

import { useEffect, useState } from "react";
import { LocalizedText, useTranslate } from "./localized-text";
import { PendingSubmitButton } from "./pending-submit-button";
import { WEEKDAYS } from "../lib/repeats.mjs";

const MONTH_DAYS = Array.from({ length: 28 }, (_, index) => index + 1);

/**
 * How often a checklist repeats. The time zone comes from the reader's
 * device, so "every day" starts at their midnight, not the server's.
 */
type FormAction = (formData: FormData) => unknown;

export function RepeatForm({ action, missionId }: { action: FormAction; missionId: string }) {
  const t = useTranslate();
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [timeZone, setTimeZone] = useState("UTC");
  useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    } catch {
      setTimeZone("UTC");
    }
  }, []);

  return <form action={action} className="repeat-form">
    <input type="hidden" name="missionId" value={missionId} />
    <input type="hidden" name="timeZone" value={timeZone} />
    <fieldset className="repeat-choice">
      <legend><LocalizedText en="How often" /></legend>
      {(["daily", "weekly", "monthly"] as const).map((value) => (
        <label key={value}>
          <input type="radio" name="frequency" value={value} checked={frequency === value} onChange={() => setFrequency(value)} />
          {value === "daily" ? <LocalizedText en="Every day" /> : value === "weekly" ? <LocalizedText en="Every week" /> : <LocalizedText en="Every month" />}
        </label>
      ))}
    </fieldset>
    {frequency === "daily" && <fieldset className="repeat-days">
      <legend><LocalizedText en="On these days" /></legend>
      {WEEKDAYS.map((day) => (
        <label key={day.iso}><input type="checkbox" name="weekdays" value={day.iso} defaultChecked /> {t(day.en)}</label>
      ))}
    </fieldset>}
    {frequency === "weekly" && <label className="repeat-select">
      <LocalizedText en="Starting each week on" />
      <select name="weekday" defaultValue="1">
        {WEEKDAYS.map((day) => <option key={day.iso} value={day.iso}>{t(day.en)}</option>)}
      </select>
    </label>}
    {frequency === "monthly" && <label className="repeat-select">
      <LocalizedText en="On day" />
      <select name="monthDay" defaultValue="1">
        {MONTH_DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
        <option value="31">{t("The last day of the month")}</option>
      </select>
    </label>}
    <PendingSubmitButton label="Repeat this checklist" pendingLabel="Saving…" />
  </form>;
}
