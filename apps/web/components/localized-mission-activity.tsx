"use client";

import { useUiLanguage, useUiTranslation } from "./localized-text";
import { formatUiDateTime } from "../lib/localized-date.mjs";

const MISSION_STATUSES: Record<string, string> = {
  DRAFT: "Draft",
  PLANNING: "Planning",
  READY: "Ready to start",
  RUNNING: "In progress",
  WAITING: "Waiting",
  NEEDS_USER: "Needs your input",
  VERIFYING: "Checking the evidence",
  COMPLETED: "Complete",
  PAUSED: "Paused",
  BLOCKED: "Blocked",
  FAILED: "Did not succeed",
  CANCELLED: "Cancelled",
};

const ACTION_STATUSES: Record<string, string> = {
  PENDING: "Not started",
  RUNNING: "In progress",
  COMPLETED: "Complete",
  BLOCKED: "Waiting",
  CANCELLED: "Cancelled",
};

function localizedDetail(label: string, detail: string, t: (value: string) => string) {
  const transition = detail.match(/^([A-Z_]+) to ([A-Z_]+)$/);
  if (transition) {
    const statuses = label === "Action status transition" ? ACTION_STATUSES : MISSION_STATUSES;
    const from = statuses[transition[1]];
    const to = statuses[transition[2]];
    if (from && to) return `${t(from)} → ${t(to)}`;
  }
  if (detail === "VERIFIED") return t("Verified");
  if (detail === "COMPLETED") return t("Complete");
  if (detail === "FAILED") return t(label === "Mission status transition" ? "Did not succeed" : "Failed");
  return t(detail);
}

export function LocalizedMissionActivity({ label, detail, time }: { label: string; detail: string; time: string }) {
  const language = useUiLanguage();
  const t = useUiTranslation();
  return (
    <div className="timeline-item">
      <strong>{t(label)}</strong>
      <span>{localizedDetail(label, detail, t)} · {formatUiDateTime(time, language)}</span>
    </div>
  );
}

export function LocalizedMissionDateTime({ value }: { value: string }) {
  const language = useUiLanguage();
  return <>{formatUiDateTime(value, language)}</>;
}
