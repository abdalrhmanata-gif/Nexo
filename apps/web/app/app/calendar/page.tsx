import Link from "next/link";
import { LocalizedFill, LocalizedText } from "../../../components/localized-text";
import { PendingSubmitButton } from "../../../components/pending-submit-button";
import { CopyLinkButton } from "../../../components/copy-link-button";
import { getTranslate } from "../../../lib/i18n-server";
import { calendarLimit, subscribeLinks } from "../../../lib/plan-dates.mjs";
import { isSupabaseConfigured } from "../../../lib/supabase/config";
import { createSupabaseMissionRepository } from "../../../lib/supabase/mission-repository";
import { createPlanDatesRepository } from "../../../lib/supabase/plan-dates-repository";
import { readCurrentPlan } from "../../../lib/supabase/own-template-repository";
import { removeMissionFromCalendar, replaceCalendarLink } from "./actions";

// Per person and per request: the link and the list are the reader's own.
export const dynamic = "force-dynamic";

const STATUS: Record<string, { text: string; ok: boolean }> = {
  added: { text: "Added to your calendar.", ok: true },
  removed: { text: "Removed from your calendar.", ok: true },
  replaced: { text: "You have a new link. Calendars that used the old one now show nothing: connect them again with the buttons below.", ok: true },
  limit: { text: "Your calendar is full on your plan. Remove a Mission, or move to a plan that holds more.", ok: false },
  forbidden: { text: "That Mission cannot be added to your calendar.", ok: false },
  failed: { text: "That did not work just now. Please try again.", ok: false },
};

const PLAN_NAMES: Record<string, string> = { free: "Free", plus: "Plus", pro: "Pro", scale: "Scale" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const t = await getTranslate();
  const { status } = await searchParams;
  const message = status ? STATUS[status] ?? STATUS.failed : null;

  if (!isSupabaseConfigured()) {
    return <div className="container calendar-page"><h1 className="detail-title"><LocalizedText en="Your calendar" /></h1>
      <p className="detail-intent"><LocalizedText en="The calendar link needs the live workspace." /></p></div>;
  }

  const plan = await readCurrentPlan();
  const limit = calendarLimit(plan);
  let token: string | null = null;
  let chosen: string[] = [];
  let missions: { id: string; name: string }[] = [];
  let unreadable = false;
  try {
    const repository = await createPlanDatesRepository();
    [token, chosen] = await Promise.all([repository.feedToken(), repository.calendarMissionIds()]);
    const all = await (await createSupabaseMissionRepository()).listMissions();
    const byId = new Map(all.map((mission) => [mission.id, mission.name]));
    missions = chosen.filter((id) => byId.has(id)).map((id) => ({ id, name: byId.get(id)! }));
  } catch {
    unreadable = true;
  }
  const links = token ? subscribeLinks(`https://zavqera.com/api/calendar/${token}.ics`) : null;
  // Missions beyond the plan's limit stay chosen but pause, oldest first kept.
  const activeCount = limit === null ? missions.length : Math.min(missions.length, limit);

  return <div className="container calendar-page">
    <p className="eyebrow"><Link href="/app"><LocalizedText en="Workspace" /></Link> <LocalizedText en="/ Your calendar" /></p>
    <h1 className="detail-title"><LocalizedText en="Your plan, in your calendar" /></h1>
    <p className="detail-intent"><LocalizedText en="Connect once. The dated steps of the Missions you choose appear in your calendar, and change there when you change them here." /></p>

    {message && <p className={message.ok ? "success-state" : "field-error"} role={message.ok ? "status" : "alert"}><LocalizedText en={message.text} /></p>}
    {unreadable && <p className="field-error" role="alert"><LocalizedText en="Your calendar could not be loaded just now. Please refresh the page." /></p>}

    {links && <section className="card calendar-connect" aria-labelledby="calendar-connect-heading">
      <h2 id="calendar-connect-heading"><LocalizedText en="1. Connect your calendar" /></h2>
      <div className="calendar-buttons">
        <a className="button" href={links.google} target="_blank" rel="noopener noreferrer"><LocalizedText en="Add to Google Calendar" /></a>
        <a className="button" href={links.webcal}><LocalizedText en="Add to Apple Calendar" /></a>
        <a className="button" href={links.outlook} target="_blank" rel="noopener noreferrer"><LocalizedText en="Add to Outlook" /></a>
      </div>
      <p className="action-hint"><LocalizedText en="Another calendar app? Copy the link and add it as a calendar subscription (“From URL”)." /></p>
      <CopyLinkButton value={links.feed} label={t("Copy the link")} copiedLabel={t("Link copied")} />
      <ul className="calendar-notes">
        <li><strong><LocalizedText en="Google Calendar" /></strong> <LocalizedText en="checks the link about once a day, so a change made here can take up to a day to show there. To be reminded, open the calendar's settings in Google Calendar once and turn on notifications for it." /></li>
        <li><strong><LocalizedText en="Apple Calendar" /></strong> <LocalizedText en="reminds you at 9:00 the day before each date, as the link asks." /></li>
        <li><strong><LocalizedText en="Keep the link private." /></strong> <LocalizedText en="Anyone who has it can see these dates and step names. If it was shared by mistake, replace it below." /></li>
      </ul>
    </section>}

    <section className="card calendar-missions" aria-labelledby="calendar-missions-heading">
      <h2 id="calendar-missions-heading"><LocalizedText en="2. Choose the Missions" /></h2>
      <p className="action-hint">
        {limit === null
          ? <LocalizedFill en="On {plan}, your calendar holds every Mission." values={{ plan: PLAN_NAMES[plan] ?? plan }} />
          : <LocalizedFill en={limit === 1 ? "On {plan}, your calendar holds 1 Mission ({count} in use)." : "On {plan}, your calendar holds {limit} Missions ({count} in use)."} values={{ plan: PLAN_NAMES[plan] ?? "Free", limit, count: activeCount }} />}
        {limit !== null && <> <Link href="/pricing"><LocalizedText en="Plus holds 3. Pro and Scale hold every Mission." /></Link></>}
      </p>
      {missions.length === 0
        ? <p><LocalizedText en="No Mission yet. Open a Mission, set its dates, and press “Add to my calendar”." /></p>
        : <ul className="list calendar-mission-list">
          {missions.map((mission, index) => {
            const paused = limit !== null && index >= limit;
            return <li key={mission.id} className={paused ? "calendar-mission-paused" : undefined}>
              <div className="card-heading">
                <div>
                  <Link className="action-title" href={`/app/missions/${mission.id}#plan-dates`}><bdi>{mission.name}</bdi></Link>
                  {paused && <small className="action-hint"><LocalizedText en="Paused: beyond your plan's limit. It returns when you remove another or move to a bigger plan." /></small>}
                </div>
                <form action={removeMissionFromCalendar}>
                  <input type="hidden" name="missionId" value={mission.id} />
                  <input type="hidden" name="from" value="calendar" />
                  <PendingSubmitButton className="button button-quiet button-small" label="Remove" pendingLabel="Removing…" />
                </form>
              </div>
            </li>;
          })}
        </ul>}
      <Link className="button button-quiet" href="/app"><LocalizedText en="Go to your Missions" /></Link>
    </section>

    {links && <section className="card calendar-replace">
      <h2><LocalizedText en="Replace the link" /></h2>
      <p><LocalizedText en="Makes a new private link. Every calendar connected to the old one stops showing your dates at once." /></p>
      <form action={replaceCalendarLink}>
        <PendingSubmitButton className="button button-quiet" label="Replace the link" pendingLabel="Replacing…" />
      </form>
    </section>}
  </div>;
}
