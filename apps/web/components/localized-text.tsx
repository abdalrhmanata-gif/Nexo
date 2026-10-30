"use client";

import { useCallback, useEffect, useState } from "react";
import type { AppLanguage } from "./language-switcher";
import { translateUiText } from "../lib/ui-translations.mjs";

export function useUiLanguage(): AppLanguage {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    let saved: string | null = null;
    try { saved = window.localStorage.getItem("zavqera-language"); } catch { /* storage may be blocked */ }
    const cookie = document.cookie.split("; ").find((part) => part.startsWith("zavqera-language="))?.split("=")[1];
    const candidate = saved || cookie || navigator.language.toLowerCase().split("-")[0];
    const supported: AppLanguage[] = ["en", "nb", "ar", "es", "fr", "de"];
    setLanguage(supported.includes(candidate as AppLanguage) ? candidate as AppLanguage : "en");
    const onLanguageChange = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      setLanguage(supported.includes(value as AppLanguage) ? value as AppLanguage : "en");
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
