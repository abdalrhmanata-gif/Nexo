"use client";

import { useEffect, useState } from "react";
import { CopyLinkButton } from "./copy-link-button";
import { LocalizedDateTime, LocalizedFill, LocalizedText, useTranslate } from "./localized-text";
import { platformFromUserAgent } from "../lib/plan-dates.mjs";

type Links = { feed: string; webcal: string; google: string; outlook: string };
type Connection = { fetchedAt: string; client: "apple" | "google" | "outlook" | "other" } | null;
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
 * Apple's and Google's own screens are unfamiliar. Once a calendar app has
 * fetched the link it says so, with the time, so nobody wonders whether it
 * worked. Before the page knows the device (first render, on the server) it
 * shows every option.
 */
export function CalendarConnect({ links, connection, compact = false }: { links: Links; connection: Connection; compact?: boolean }) {
  const t = useTranslate();
  const [platform, setPlatform] = useState<Platform | null>(null);
  useEffect(() => {
    setPlatform(platformFromUserAgent(navigator.userAgent, navigator.maxTouchPoints));
  }, []);

  const everyOption = <div className="calendar-buttons">
    <a className="button" href={links.webcal}><LocalizedText en="Add to Apple Calendar" /></a>
    <a className="button" href={links.google} target="_blank" rel="noopener noreferrer"><LocalizedText en="Add to Google Calendar" /></a>
    <a className="button" href={links.outlook} target="_blank" rel="noopener noreferrer"><LocalizedText en="Add to Outlook" /></a>
  </div>;
  const copy = <CopyLinkButton value={links.feed} label={t("Copy the link")} copiedLabel={t("Link copied")} />;
  const others = <details className="calendar-other-ways">
    <summary><LocalizedText en="Another calendar or device" /></summary>
    {everyOption}
    <p className="action-hint"><LocalizedText en="Another calendar app? Copy the link and add it as a calendar subscription (“From URL”)." /></p>
    {copy}
  </details>;

  if (connection) {
    return <div className="calendar-connected" role="status">
      <p>
        <strong>✓ <LocalizedFill en="Connected to {app}" values={{ app: t(CLIENT_NAMES[connection.client] ?? CLIENT_NAMES.other) }} /></strong>
        {" · "}<LocalizedText en="last updated" /> <LocalizedDateTime value={connection.fetchedAt} />
      </p>
      {!compact && <p className="action-hint"><LocalizedText en="Nothing more to do: every Mission you add to your calendar appears there by itself." /></p>}
      {!compact && others}
    </div>;
  }

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

  return <div className="calendar-guide">
    {everyOption}
    {copy}
  </div>;
}
