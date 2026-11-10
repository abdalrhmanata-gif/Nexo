"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  translate,
  type AppLanguage,
} from "../lib/i18n";
export { fill } from "../lib/i18n";
import { fill as fillText } from "../lib/i18n";
import { resolveLanguage } from "../lib/language-preference.mjs";

// The tables live in lib/i18n so server components can translate as well.
// LocalizedText renders a text node; useLanguage and useTranslate give the same
// lookup as a plain string, for placeholder and aria-label attributes and for
// text produced inside JSX expressions — neither can hold a component.

function readPreferredLanguage(): AppLanguage {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    // Storage can be blocked; the cookie and the browser language still apply.
  }
  const cookie = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${LANGUAGE_COOKIE}=`))
    ?.split("=")[1];
  return resolveLanguage({ saved, cookie, browser: navigator.languages ?? [navigator.language] });
}

/** Current language, kept in step with the switcher's change event. */
export function useLanguage(): AppLanguage {
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(readPreferredLanguage());
    const onLanguageChange = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      setLanguage(isSupportedLanguage(value) ? value : "en");
    };
    window.addEventListener("zavqera-language-change", onLanguageChange);
    return () => window.removeEventListener("zavqera-language-change", onLanguageChange);
  }, []);
  return language;
}

/** Translator for strings that cannot be wrapped in a component. */
export function useTranslate(): (en: string) => string {
  const language = useLanguage();
  return useCallback((en: string) => translate(en, language), [language]);
}

// Inline nb/ar props used to be accepted here and took precedence over the
// table. They were a second source of truth covering two of the five
// languages, so a string written only inline was Norwegian and Arabic and
// silently English in Spanish, French and German — which is how the
// navigation bar came to be half-translated. The dictionary is now the only
// path, and a test fails if an inline prop comes back.
export function LocalizedText({ en }: { en: string }) {
  const language = useLanguage();
  return <>{translate(en, language)}</>;
}

/**
 * The same, for a sentence that carries values: <LocalizedFill en="{done} of
 * {total} actions complete" values={{ done, total }} />.
 *
 * A synchronous server component cannot await getTranslate(), and making it
 * async is not an option under this React version, so without this the only
 * way to write such a sentence there was to build it in English.
 */
export function LocalizedFill({ en, values }: { en: string; values: Record<string, string | number> }) {
  const language = useLanguage();
  return <>{fillText(translate(en, language), values)}</>;
}

/**
 * A timestamp in the reader's own language and time zone.
 *
 * The repository used to call toLocaleString() on the server, which formats
 * in the server's locale and the server's clock: a reader in Oslo with the
 * interface in Norwegian was shown "11/9/2026, 5:10:20 PM", month first and
 * hours off. The server now sends the instant and this renders it where the
 * language and the time zone are both known.
 *
 * A value that is not a date — the local mock repository says "8 min ago" —
 * is shown as it is rather than as "Invalid Date".
 */
export function LocalizedDateTime({ value }: { value: string }) {
  const language = useLanguage();
  // The first render happens twice — on the server and again in the browser
  // while React attaches — and the two must produce the same text. The
  // server's clock is UTC, so both use UTC until this has mounted. Silencing
  // the mismatch instead would have left the server's hour on the page: React
  // keeps the text it was sent.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return <>{value}</>;
  return (
    <time dateTime={date.toISOString()}>
      {date.toLocaleString(language, {
        dateStyle: "medium",
        timeStyle: "short",
        ...(mounted ? {} : { timeZone: "UTC" }),
      })}
    </time>
  );
}
