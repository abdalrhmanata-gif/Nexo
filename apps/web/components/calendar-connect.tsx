"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CopyLinkButton } from "./copy-link-button";
import { LocalizedDateTime, LocalizedFill, LocalizedText, useTranslate } from "./localized-text";
import { hasFetchedSince, platformFromUserAgent, type CalendarConnections } from "../lib/plan-dates.mjs";

type Links = { feed: string; webcal: string; google: string; outlook: string };
type Platform = "ios" | "android" | "mac" | "desktop";

const CLIENT_NAMES: Record<string, string> = {
  apple: "Apple Calendar",
  google: "Google Calendar",
  outlook: "Outlook",
  other: "your calendar app",
};

/**
 * Connecting a calendar, shown for the device in hand: the button that works
 * there first, and the two or three things the person will see next, because
 * Apple's and Google's own screens are unfamiliar.
 *
 * The connection belongs to the person's calendar link, not to one Mission,
 * and each app that fetches the link is listed with its own last update: an
 * app that updated in the last three days is connected, one that went quiet
 * is listed as stopped (no app reports that its calendar was deleted). Once
 * connected, another calendar can still be added. On a Mission page,
 * `addedAt` says whether each app has picked that Mission up yet.
 *
 * Before the page knows the device (first render, on the server) it shows
 * every option.
 */
export function CalendarConnect({ links, connections, addedAt = null, compact = false }: {
  links: Links;
  connections: CalendarConnections;
  addedAt?: string | null;
  compact?: boolean;
}) {
  const t = useTranslate();
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => {
    setPlatform(platformFromUserAgent(navigator.userAgent, navigator.maxTouchPoints));
  }, []);
  const appName = (client: string) => t(CLIENT_NAMES[client] ?? CLIENT_NAMES.other);

  const everyOption = <div className="calendar-buttons">
    <a className="button" href={links.webcal}><LocalizedText en="Add to Apple Calendar" /></a>
    <a className="button" href={links.google} target="_blank" rel="noopener noreferrer"><LocalizedText en="Add to Google Calendar" /></a>
    <a className="button" href={links.outlook} target="_blank" rel="noopener noreferrer"><LocalizedText en="Add to Outlook" /></a>
  </div>;
  const copy = <CopyLinkButton value={links.feed} label={t("Copy the link")} copiedLabel={t("Link copied")} />;
  const fromUrl = <p className="action-hint"><LocalizedText en="Another calendar app? Copy the link and add it as a calendar subscription (“From URL”)." /></p>;
  const others = <details className="calendar-other-ways">
    <summary><LocalizedText en="Another calendar or device" /></summary>
    {everyOption}
    {fromUrl}
    {copy}
  </details>;

  const stopped = connections.stopped.length > 0 && <div className="calendar-stopped">
    <ul>
      {connections.stopped.map((connection) => <li key={connection.client}>
        <strong>{appName(connection.client)}</strong>
        {" · "}<LocalizedText en="stopped updating; last update" /> <LocalizedDateTime value={connection.fetchedAt} />
      </li>)}
    </ul>
    {!compact && <p className="action-hint"><LocalizedText en="Calendar apps do not tell us when a calendar is removed, so one that has not updated for 3 days is listed as stopped. Removed it on purpose? Nothing to do. To use it again, connect it once more." /></p>}
  </div>;

  if (connections.active.length > 0) {
    return <div className="calendar-connected">
      <ul role="status">
        {connections.active.map((connection) => <li key={connection.client}>
          <strong>✓ <LocalizedFill en="Connected to {app}" values={{ app: appName(connection.client) }} /></strong>
          {" · "}<LocalizedText en="last updated" /> <LocalizedDateTime value={connection.fetchedAt} />
          {addedAt && !hasFetchedSince(connection.fetchedAt, addedAt) && <span className="calendar-pending"> · <LocalizedText en="this Mission appears there at its next update" /></span>}
        </li>)}
      </ul>
      {!compact && <p className="action-hint"><LocalizedText en="Nothing more to do: every Mission you add to your calendar appears there by itself." /></p>}
      {!compact && stopped}
      <details className="calendar-other-ways">
        <summary><LocalizedText en="Connect another calendar" /></summary>
        {everyOption}
        <p className="action-hint"><LocalizedText en="Google Calendar on a phone: if the page does not ask to add the calendar, choose “Desktop site” in the browser menu and tap again. On Android, then turn on “Sync” for ZAVQERA in the app's settings." /></p>
        {fromUrl}
        {copy}
      </details>
    </div>;
  }

  const guide = guideFor(platform, links, others) ?? <div className="calendar-guide">
    {everyOption}
    {copy}
  </div>;
  return <>
    {stopped}
    {guide}
  </>;
}

function guideFor(platform: Platform | null, links: Links, others: ReactNode) {
  if (platform === "ios") {
    return <div className="calendar-guide">
      <a className="button calendar-primary" href={links.webcal}><LocalizedText en="Add to iPhone Calendar" /></a>
      <ol className="calendar-steps">
        <li><LocalizedText en="Tap the button. Your iPhone opens a screen with the link already filled in." /></li>
        <li><LocalizedText en="Tap the button under the link (“Find” in English; its name follows your iPhone's language)." /></li>
        <li><LocalizedText en="Tap “Add” at the top. Leave “Remove alerts” off to be reminded the day before." /></li>
      </ol>
      <p className="action-hint"><LocalizedText en="You do this once. Every Mission you add later appears by itself." /></p>
      {others}
    </div>;
  }

  // Google adds a calendar link only on its website, not in the Android app;
  // a phone browser works (owner's test, 24 Nov), then the app needs the
  // calendar's sync turned on once.
  if (platform === "android") {
    return <div className="calendar-guide">
      <a className="button calendar-primary" href={links.google} target="_blank" rel="noopener noreferrer"><LocalizedText en="Add to Google Calendar" /></a>
      <ol className="calendar-steps">
        <li><LocalizedText en="Tap the button. Google Calendar opens in your browser and asks to add the calendar: tap “Add”." /></li>
        <li><LocalizedText en="If you see only the small phone version without that question, open the browser menu, choose “Desktop site” and tap the button again." /></li>
        <li><LocalizedText en="In the Google Calendar app: Menu ☰ → Settings → ZAVQERA → turn on “Sync”. Your dates then appear on the phone." /></li>
      </ol>
      <p className="action-hint"><LocalizedText en="You do this once. Google checks the link about once a day, so the first dates can take a few hours to appear." /></p>
      {others}
    </div>;
  }

  if (platform === "mac") {
    return <div className="calendar-guide">
      <a className="button calendar-primary" href={links.webcal}><LocalizedText en="Add to Apple Calendar" /></a>
      <ol className="calendar-steps">
        <li><LocalizedText en="Click the button. The Calendar app opens with the link filled in." /></li>
        <li><LocalizedText en="Click “Subscribe”, then “OK”. Leave alerts on to be reminded the day before." /></li>
      </ol>
      {others}
    </div>;
  }

  if (platform === "desktop") {
    return <div className="calendar-guide">
      <a className="button calendar-primary" href={links.google} target="_blank" rel="noopener noreferrer"><LocalizedText en="Add to Google Calendar" /></a>
      <ol className="calendar-steps">
        <li><LocalizedText en="Click the button. Google Calendar opens and asks to add the calendar." /></li>
        <li><LocalizedText en="Click “Add”. It also appears on your phone if it uses the same Google account." /></li>
      </ol>
      {others}
    </div>;
  }

  return null;
}
