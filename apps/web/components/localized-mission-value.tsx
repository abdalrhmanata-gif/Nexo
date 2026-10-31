"use client";

import { useUiTranslation } from "./localized-text";

const PREFIXES = [
  ["Follow up: ", "Follow up:"],
  ["Continue: ", "Continue:"],
  ["Start: ", "Start:"],
  ["Resolve waiting: ", "Resolve waiting:"],
];

function capitalizeFirst(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function LocalizedMissionValue({ value }: { value: string }) {
  const t = useUiTranslation();
  for (const [prefix, translatedPrefix] of PREFIXES) {
    if (value.startsWith(prefix)) {
      return <>{t(translatedPrefix)} {value.slice(prefix.length)}</>;
    }
  }
  const terminalReadiness = value.match(/^This mission is (.+), so no further evidence can be recorded\.$/);
  if (terminalReadiness) {
    const status = capitalizeFirst(terminalReadiness[1]);
    return <>{t("This mission is")} {t(status).toLowerCase()}, {t("so no further evidence can be recorded.")}</>;
  }
  const routedReadiness = value.match(/^This mission is (.+)\. It moves to checking the evidence through (.+)\.$/);
  if (routedReadiness) {
    const currentStatus = capitalizeFirst(routedReadiness[1]);
    const route = routedReadiness[2].split(", then ").map((status) =>
      t(capitalizeFirst(status)).toLowerCase()
    );
    return <>{t("This mission is")} {t(currentStatus).toLowerCase()}. {t("It moves to checking the evidence through")} {route.join(", " + t("then") + " ")}.</>;
  }
  const overdue = value.match(/^(The action is Waiting and its follow-up was due) (.+)\.$/);
  if (overdue) return <>{t(overdue[1])} {overdue[2]}.</>;
  const nextFollowUp = value.match(/^(The action is Waiting; its next follow-up is) (.+)\.$/);
  if (nextFollowUp) return <>{t(nextFollowUp[1])} {nextFollowUp[2]}.</>;
  const waitingActions = value.match(/^(\d+) waiting action(s?)( is| are) past its follow-up date\.$/);
  if (waitingActions) {
    return <>{waitingActions[1]} {t(waitingActions[2] ? "waiting actions" : "waiting action")} {waitingActions[3] === " are" ? t("are past their follow-up date.") : t("is past its follow-up date.")}</>;
  }
  return <>{t(value)}</>;
}
