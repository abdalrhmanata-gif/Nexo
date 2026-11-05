"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DICTIONARIES,
  LANGUAGE_COOKIE,
  LANGUAGE_STORAGE_KEY,
  isSupportedLanguage,
  translate,
  type AppLanguage,
} from "../lib/i18n";
export { fill } from "../lib/i18n";

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
  const candidate = saved || cookie || navigator.language.toLowerCase().split("-")[0];
  return isSupportedLanguage(candidate) ? candidate : "en";
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

export function LocalizedText({ en, nb, ar }: { en: string; nb?: string; ar?: string }) {
  const language = useLanguage();
  // nb and ar may still be supplied inline by older call sites; they take
  // precedence over the table for those two languages only.
  const inline = language === "nb" ? nb : language === "ar" ? ar : undefined;
  return <>{inline ?? DICTIONARIES[language][en] ?? en}</>;
}
