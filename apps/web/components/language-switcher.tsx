"use client";

import { useEffect, useState } from "react";

export type AppLanguage = "en" | "nb" | "ar" | "es" | "fr" | "de";

const STORAGE_KEY = "zavqera-language";
const COOKIE_KEY = "zavqera-language";
const SUPPORTED_LANGUAGES: AppLanguage[] = ["en", "nb", "ar", "es", "fr", "de"];
const LABELS: Record<AppLanguage, { language: string; english: string; norwegian: string; arabic: string; spanish: string; french: string; german: string }> = {
  en: { language: "Language", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
  nb: { language: "Språk", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
  ar: { language: "اللغة", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
};

function validLanguage(value: string | undefined): value is AppLanguage {
  return Boolean(value && SUPPORTED_LANGUAGES.includes(value as AppLanguage));
}

function detectLanguage(): AppLanguage {
  if (typeof navigator === "undefined") return "en";
  for (const candidate of navigator.languages ?? [navigator.language]) {
    const code = candidate.toLowerCase().split("-")[0];
    if (validLanguage(code)) return code;
  }
  return "en";
}

function readPreference(): AppLanguage {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (validLanguage(saved ?? undefined)) return saved as AppLanguage;
  } catch {
    // Continue with the cookie or browser language when storage is unavailable.
  }
  const cookie = document.cookie.split("; ").find((part) => part.startsWith(COOKIE_KEY + "="))?.split("=")[1];
  if (validLanguage(cookie)) return cookie;
  return detectLanguage();
}

function applyLanguage(language: AppLanguage) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
}

export function LanguageSwitcher() {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    const preferred = readPreference();
    setLanguage(preferred);
    applyLanguage(preferred);
  }, []);

  function changeLanguage(value: string) {
    if (!validLanguage(value)) return;
    setLanguage(value);
    applyLanguage(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Cookie still preserves the selection.
    }
    document.cookie = `${COOKIE_KEY}=${value}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    window.dispatchEvent(new CustomEvent("zavqera-language-change", { detail: value }));
  }

  const labels = LABELS[language];
  return (
    <label className="language-switcher">
      <span className="visually-hidden">{labels.language}</span>
      <select aria-label={labels.language} value={language} onChange={(event) => changeLanguage(event.target.value)}>
        <option value="en">{labels.english}</option>
        <option value="nb">{labels.norwegian}</option>
        <option value="ar">{labels.arabic}</option>
        <option value="es">{labels.spanish}</option>
        <option value="fr">{labels.french}</option>
        <option value="de">{labels.german}</option>
      </select>
    </label>
  );
}
