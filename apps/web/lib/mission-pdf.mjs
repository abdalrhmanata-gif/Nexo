// A checklist (Mission) from the workspace as a PDF file: its steps with
// what is done ticked, each step's due date and, for finished steps, the
// proof recorded. It is the team's own record, so the proof is included;
// the file is made only for someone who can open the checklist.

import { missionStatusLabel } from "./mission-content.mjs";

const same = (text) => text;
const fillIn = (text, values) => text.replace(/\{(\w+)\}/g, (match, key) => (key in values ? String(values[key]) : match));

/** The file name offered for download: ASCII letters and digits from the name, or the id. */
export function missionPdfFileName(name, id) {
  const ascii = String(name ?? "").normalize("NFKD").replace(/[^\x20-\x7E]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `zavqera-${ascii || String(id).slice(0, 8)}.pdf`;
}

/**
 * The document model for lib/pdf-document.mjs.
 * mission: { name, intent, criteria, lifecycleStatus, actions: [{ id, title, status, evidenceNote, evidenceUrl }] }
 * dates: { targetDate, dueDates: { [actionId]: { dueOn } } }
 */
export function missionPdfModel(mission, dates, { t = same, lang = "en", rtl = false, madeOn } = {}) {
  const steps = mission.actions.filter((action) => action.status !== "CANCELLED");
  const meta = [fillIn(t("Status: {status}"), { status: missionStatusLabel(mission.lifecycleStatus, t) })];
  if (dates?.targetDate) meta.push(fillIn(t("Target date: {date}"), { date: dates.targetDate }));
  if (madeOn) meta.push(fillIn(t("Made on {date}"), { date: madeOn }));
  const sections = [];
  if (mission.criteria.length) {
    sections.push({ heading: t("Success criteria"), items: mission.criteria.map((criterion) => ({ title: criterion })) });
  }
  sections.push({
    heading: t("Steps"),
    items: steps.map((action) => {
      const done = action.status === "COMPLETED";
      const due = dates?.dueDates?.[action.id]?.dueOn;
      const lines = [];
      if (due && !done) lines.push({ text: fillIn(t("Due {date}"), { date: due }) });
      if (done && action.evidenceNote) lines.push({ label: t("Proof"), text: action.evidenceNote });
      if (done && action.evidenceUrl) lines.push({ label: t("Link"), text: action.evidenceUrl });
      return { title: action.title, done, lines };
    }),
  });
  return {
    lang,
    rtl,
    title: mission.name,
    subtitle: mission.intent,
    meta,
    sections,
    footer: "ZAVQERA · zavqera.com",
  };
}
