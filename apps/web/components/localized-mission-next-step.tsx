"use client";

import { useUiTranslation } from "./localized-text";

export function LocalizedMissionNextStep({ label, detail }: { label: string; detail: string }) {
  const t = useUiTranslation();
  const dueMarker = " — due ";
  const dueIndex = detail.indexOf(dueMarker);
  const checkBackMarker = " — check back ";
  const checkBackIndex = detail.indexOf(checkBackMarker);
  const localizedDetail = dueIndex >= 0
    ? `${detail.slice(0, dueIndex)} — ${t("due")} ${detail.slice(dueIndex + dueMarker.length)}`
    : checkBackIndex >= 0
      ? `${detail.slice(0, checkBackIndex)} — ${t("check back")} ${detail.slice(checkBackIndex + checkBackMarker.length)}`
      : t(detail);
  return <>
    <span className="next-step-label">{t(label)}</span>
    <span className="next-step-detail">{localizedDetail}</span>
  </>;
}
