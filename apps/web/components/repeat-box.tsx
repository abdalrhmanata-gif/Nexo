import Link from "next/link";
import { LocalizedFill, LocalizedText } from "./localized-text";
import { PendingSubmitButton } from "./pending-submit-button";
import { RepeatForm } from "./repeat-form";
import { setMissionRepeat, stopMissionRepeat } from "../app/app/missions/[id]/repeat-actions";
import { describeRepeat, REPEAT_NOTICES, type Repeat } from "../lib/repeats.mjs";

/**
 * "Repeat this checklist" on a checklist's page. A repeat makes a fresh copy
 * of the checklist every day, week or month, with the same steps and step
 * owners. Shown to people who can edit; the database decides the rest.
 */
export function RepeatBox({ missionId, repeat, used, allowance, notice, t }: {
  missionId: string;
  repeat: Repeat | null;
  used: number;
  allowance: number;
  notice?: string;
  t: (en: string) => string;
}) {
  const message = notice ? REPEAT_NOTICES[notice] ?? REPEAT_NOTICES.failed : null;
  const described = describeRepeat(repeat);
  const rule = described
    ? described.days
      ? t(described.key).replace("{days}", described.days.map((day) => t(day)).join(", "))
      : described.day
        ? t(described.key).replace("{day}", t(described.day))
        : t(described.key).replace("{day}", described.values.day ?? "")
    : null;
  const full = !repeat && used >= allowance;

  return <section id="repeat" className="own-template-box repeat-box no-print" aria-labelledby="repeat-heading">
    <p className="eyebrow"><LocalizedText en="Work you repeat" /></p>
    <h2 id="repeat-heading">{repeat ? <LocalizedText en="Repeating checklist" /> : <LocalizedText en="Repeat this checklist" />}</h2>
    {message && <p className={notice === "set" || notice === "stopped" ? "repeat-notice" : "field-error"} role={notice === "set" || notice === "stopped" ? "status" : "alert"}><LocalizedText en={message} /></p>}
    {repeat
      ? <>
        <p><strong>{rule}</strong></p>
        <p><LocalizedText en="A fresh copy appears on its own when each new period starts, with the same steps and step owners, due by the end of that period." /></p>
        <form action={stopMissionRepeat}>
          <input type="hidden" name="missionId" value={missionId} />
          <input type="hidden" name="repeatId" value={repeat.id} />
          <PendingSubmitButton label="Stop repeating" pendingLabel="Saving…" className="button button-quiet button-small" />
        </form>
      </>
      : full
        ? <>
          <p><LocalizedFill en="Your plan's repeating checklists are all in use ({used} of {limit})." values={{ used, limit: allowance }} /></p>
          <Link className="button" href="/pricing"><LocalizedText en="See the plans" /></Link>
        </>
        : <>
          <p><LocalizedText en="Opening and closing, the cleaning schedule, the month-end close: set it once, and a fresh copy with the same steps and step owners appears every day, week or month." /></p>
          <RepeatForm action={setMissionRepeat} missionId={missionId} />
          <p className="repeat-allowance"><LocalizedFill en="Repeating checklists on your plan: {used} of {limit} in use." values={{ used, limit: allowance >= 100 ? "∞" : allowance }} /></p>
        </>}
  </section>;
}
