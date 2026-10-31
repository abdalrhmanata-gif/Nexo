"use client";

import { useUiLanguage, useUiTranslation } from "./localized-text";
import { formatUiRelativeDate } from "../lib/localized-date.mjs";

export function LocalizedMissionNextStep({ label, detail }: { label: string; detail: string }) {
  const t = useUiTranslation();
  const language = useUiLanguage();
  const dueMarker = " — due ";
  const dueIndex = detail.indexOf(dueMarker);
  const checkBackMarker = " — check back ";
  const checkBackIndex = detail.indexOf(checkBackMarker);
  const localizedDetail = dueIndex >= 0
    ? `${detail.slice(0, dueIndex)} — ${t("due")} ${formatUiRelativeDate(detail.slice(dueIndex + dueMarker.length).trim(), language)}`
    : checkBackIndex >= 0
      ? `${detail.slice(0, checkBackIndex)} — ${t("check back")} ${formatUiRelativeDate(detail.slice(checkBackIndex + checkBackMarker.length).trim(), language)}`
      : t(detail);
  return <>
    <span className="next-step-label">{t(label)}</span>
    <span className="next-step-detail">{localizedDetail}</span>
  </>;
}
