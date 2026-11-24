import Link from "next/link";
import { LocalizedFill, LocalizedText } from "./localized-text";
import { PendingSubmitButton } from "./pending-submit-button";
import { PlanCountdown, PlanDay } from "./plan-dates-client";
import { addMissionToCalendar, removeMissionFromCalendar, saveMissionDates } from "../app/app/calendar/actions";
import { legalDeadlineForStep, legalSourceUrl } from "../lib/legal-deadlines";
import { lateSteps, nextDated, todayIn } from "../lib/plan-dates.mjs";
import type { MissionDates } from "../lib/supabase/plan-dates-repository";
import type { MissionAction } from "../lib/view-models";

const DATE_NOTICES: Record<string, string> = {
  saved: "Dates saved.",
  invalid: "One of the dates is not a real date. Nothing was saved.",
  forbidden: "Only the person who created this Mission can change its dates.",
  failed: "The dates could not be saved just now. Please try again.",
};

const CALENDAR_NOTICES: Record<string, string> = {
  added: "Added to your calendar. Its dated steps appear in the calendar you connected.",
  removed: "Removed from your calendar.",
  forbidden: "This Mission cannot be added to your calendar.",
  failed: "That did not work just now. Please try again.",
};

export type CalendarState = {
  inCalendar: boolean;
  count: number;
  /** null: every Mission. */
  limit: number | null;
  plan: string;
};

/**
 * The plan's dates on a Mission page: the countdown to the target date, the
 * steps that are late and the next one due, one form to set every date
 * (with the legal deadline the guides cite, from its source), and the
 * Mission's place in the person's calendar link.
 */
export function PlanDatesCard({ missionId, actions, dates, calendar, notice }: {
  missionId: string;
  actions: MissionAction[];
  dates: MissionDates;
  calendar: CalendarState;
  notice: { dates?: string; calendar?: string };
}) {
  const today = todayIn("UTC");
  const late = lateSteps(actions, dates.dueDates, today);
  const next = nextDated(actions, dates.dueDates, today);
  const live = actions.filter((action) => action.status !== "CANCELLED");
  const datesMessage = notice.dates ? DATE_NOTICES[notice.dates] ?? DATE_NOTICES.failed : null;
  const full = calendar.limit !== null && calendar.count >= calendar.limit && !calendar.inCalendar;
  const calendarMessage = notice.calendar === "limit"
    ? null
    : notice.calendar ? CALENDAR_NOTICES[notice.calendar] ?? CALENDAR_NOTICES.failed : null;
  const anyDate = Boolean(dates.targetDate) || Object.keys(dates.dueDates).length > 0;

  return <section id="plan-dates" className="card plan-dates-card no-print" aria-labelledby="plan-dates-heading">
    <div className="plan-dates-head">
      <div>
        <p className="eyebrow"><LocalizedText en="Plan dates" /></p>
        <h2 id="plan-dates-heading">
          {dates.targetDate
            ? <><PlanCountdown target={dates.targetDate} /> <span className="plan-dates-target">· <PlanDay value={dates.targetDate} /></span></>
            : <LocalizedText en="When should this be done?" />}
        </h2>
      </div>
    </div>

    {datesMessage && <p className={notice.dates === "saved" ? "success-state" : "field-error"} role={notice.dates === "saved" ? "status" : "alert"}><LocalizedText en={datesMessage} /></p>}

    {late.length > 0 && <div className="plan-dates-late" role="status">
      <strong><LocalizedFill en={late.length === 1 ? "1 step is late" : "{count} steps are late"} values={{ count: late.length }} /></strong>
      <ul>{late.slice(0, 3).map((action) => <li key={action.id}><bdi>{action.title}</bdi> · <PlanDay value={dates.dueDates[action.id].dueOn} /></li>)}</ul>
    </div>}
    {next && <p className="plan-dates-next"><LocalizedText en="Next date:" /> <strong><bdi>{next.title}</bdi></strong> · <PlanDay value={dates.dueDates[next.id].dueOn} /></p>}

    <details className="plan-dates-edit" open={!anyDate}>
      <summary><LocalizedText en={anyDate ? "Change the dates" : "Set the dates"} /></summary>
      <form action={saveMissionDates} className="plan-dates-form">
        <input type="hidden" name="missionId" value={missionId} />
        <label className="plan-dates-row plan-dates-target-row">
          <span><LocalizedText en="Target date" /></span>
          <input type="date" name="targetDate" defaultValue={dates.targetDate ?? ""} min="2000-01-01" max="2100-12-31" />
        </label>
        {live.length > 0 && <p className="action-hint"><LocalizedText en="A date for each step is optional. Leave a field empty for no date." /></p>}
        {live.map((action) => {
          const deadline = legalDeadlineForStep(action.title);
          const due = dates.dueDates[action.id];
          if (deadline) {
            return <div className="plan-dates-row plan-dates-law" key={action.id}>
              <span className="plan-dates-step"><bdi>{action.title}</bdi></span>
              <p className="plan-dates-law-rule">
                <strong><LocalizedText en="Deadline set by law:" /></strong> <LocalizedText en={deadline.rule} />{" "}
                <a href={legalSourceUrl(deadline)} target="_blank" rel="noopener noreferrer"><LocalizedText en="Official source" /></a>
              </p>
              <label>
                <span><LocalizedText en="The day you move in" /></span>
                <input type="date" name={`from:${action.id}`} min="2000-01-01" max="2100-12-31" />
              </label>
              {due && <p className="action-hint"><LocalizedText en="Due:" /> <PlanDay value={due.dueOn} />{due.basis === "law" && <> · <LocalizedText en="set by law" /></>}</p>}
              {/* Keeps a date set by hand when the move-in field is left empty. */}
              <input type="hidden" name={`due:${action.id}`} value={due?.dueOn ?? ""} />
              {due?.basis === "law" && <input type="hidden" name={`basis:${action.id}`} value="law" />}
            </div>;
          }
          return <label className="plan-dates-row" key={action.id}>
            <span className="plan-dates-step">{action.status === "COMPLETED" ? "✓ " : ""}<bdi>{action.title}</bdi></span>
            <input type="date" name={`due:${action.id}`} defaultValue={due?.dueOn ?? ""} min="2000-01-01" max="2100-12-31" />
          </label>;
        })}
        <PendingSubmitButton label="Save dates" pendingLabel="Saving…" />
      </form>
    </details>

    <div className="plan-dates-calendar">
      <h3><LocalizedText en="In your calendar" /></h3>
      {calendarMessage && <p className={["added", "removed"].includes(notice.calendar ?? "") ? "success-state" : "field-error"} role="status"><LocalizedText en={calendarMessage} /></p>}
      {calendar.inCalendar
        ? <>
          <p><LocalizedText en="This Mission's dates are in your calendar link. Google, Apple and Outlook show them with your other events." /></p>
          <div className="plan-dates-calendar-actions">
            <Link className="button" href="/app/calendar"><LocalizedText en="Connect or check your calendar" /></Link>
            <form action={removeMissionFromCalendar}>
              <input type="hidden" name="missionId" value={missionId} />
              <PendingSubmitButton className="button button-quiet" label="Remove from calendar" pendingLabel="Removing…" />
            </form>
          </div>
        </>
        : full || notice.calendar === "limit"
          ? <div className="plan-dates-upgrade">
            <p>
              <LocalizedFill
                en={calendar.limit === 1 ? "Your calendar holds 1 Mission on the {plan} plan, and it is in use." : "Your calendar holds {limit} Missions on the {plan} plan, and they are in use."}
                values={{ limit: calendar.limit ?? 0, plan: calendar.plan === "plus" ? "Plus" : "Free" }} />
              {" "}<LocalizedText en="Plus holds 3. Pro and Scale hold every Mission." />
            </p>
            <div className="plan-dates-calendar-actions">
              <Link className="button" href="/pricing"><LocalizedText en="See the plans" /></Link>
              <Link className="button button-quiet" href="/app/calendar"><LocalizedText en="Choose which Missions" /></Link>
            </div>
          </div>
          : <>
            <p><LocalizedText en="See this Mission's dates in Google Calendar, Apple Calendar or Outlook, next to everything else in your week." /></p>
            <form action={addMissionToCalendar}>
              <input type="hidden" name="missionId" value={missionId} />
              <PendingSubmitButton label="Add to my calendar" pendingLabel="Adding…" />
            </form>
            {calendar.limit !== null && <p className="action-hint">
              <LocalizedFill en={calendar.limit === 1 ? "{count} of 1 Mission in your calendar" : "{count} of {limit} Missions in your calendar"} values={{ count: calendar.count, limit: calendar.limit }} />
            </p>}
          </>}
    </div>
  </section>;
}
