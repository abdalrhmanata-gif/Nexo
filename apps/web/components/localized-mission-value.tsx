"use client";

import { useUiTranslation } from "./localized-text";

const PREFIXES = [
  ["Follow up: ", "Follow up:"],
  ["Continue: ", "Continue:"],
  ["Start: ", "Start:"],
  ["Resolve waiting: ", "Resolve waiting:"],
];

export function LocalizedMissionValue({ value }: { value: string }) {
  const t = useUiTranslation();
  for (const [prefix, translatedPrefix] of PREFIXES) {
    if (value.startsWith(prefix)) {
      return <>{t(translatedPrefix)} {value.slice(prefix.length)}</>;
    }
  }
  const overdue = value.match(/^(The action is Waiting and its follow-up was due) (.+)\.$/);
  if (overdue) return <>{t(overdue[1])} {overdue[2]}.</>;
  const nextFollowUp = value.match(/^(The action is Waiting; its next follow-up is) (.+)\.$/);
  if (nextFollowUp) return <>{t(nextFollowUp[1])} {nextFollowUp[2]}.</>;
  const waitingActions = value.match(/^(\d+) waiting action(s?)( is| are) past its follow-up date\.$/);
  if (waitingActions) {
    return <>{waitingActions[1]} {t("waiting action")} {waitingActions[3] === " are" ? t("are past their follow-up date.") : t("is past its follow-up date.")}</>;
  }
  return <>{t(value)}</>;
}
