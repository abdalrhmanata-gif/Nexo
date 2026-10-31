"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeAppLanguage, resolveAppLanguagePreference, type AppLanguage } from "../lib/app-language.mjs";
import { translateUiText } from "../lib/ui-translations.mjs";

function readPreferredUiLanguage(): AppLanguage {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem("zavqera-language");
  } catch {
    // Continue with the cookie or browser language when storage is unavailable.
  }
  const cookieName = "zavqera-language";
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(cookieName + "="))
    ?.slice(cookieName.length + 1);
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return resolveAppLanguagePreference(saved, cookie, browserLanguages);
}

export function useUiLanguage(): AppLanguage {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(readPreferredUiLanguage());
    const onLanguageChange = (event: Event) => {
      const value = normalizeAppLanguage((event as CustomEvent<unknown>).detail);
      if (value) setLanguage(value);
    };
    window.addEventListener("zavqera-language-change", onLanguageChange);
    return () => window.removeEventListener("zavqera-language-change", onLanguageChange);
  }, []);

  return language;
}

export function useUiTranslation() {
  const language = useUiLanguage();
  return useCallback((source: string) => translateUiText(language, source), [language]);
}

export function LocalizedText({ en, nb, ar }: { en: string; nb?: string; ar?: string }) {
  const language = useUiLanguage();
  const explicit = language === "nb" ? nb : language === "ar" ? ar : undefined;
  return <>{language === "en" ? en : explicit && explicit !== en ? explicit : translateUiText(language, en)}</>;
}
