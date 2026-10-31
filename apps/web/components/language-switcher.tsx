"use client";

import { useEffect, useState } from "react";
import { APP_LANGUAGES, normalizeAppLanguage, resolveAppLanguagePreference, type AppLanguage } from "../lib/app-language.mjs";

const STORAGE_KEY = "zavqera-language";
const COOKIE_KEY = "zavqera-language";
const LABELS: Record<AppLanguage, { language: string; english: string; norwegian: string; arabic: string; spanish: string; french: string; german: string }> = {
  en: { language: "Language", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
  nb: { language: "Språk", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
  ar: { language: "اللغة", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
  es: { language: "Idioma", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
  fr: { language: "Langue", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
  de: { language: "Sprache", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
};

function readPreference(): AppLanguage {
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Continue with the cookie or browser language when storage is unavailable.
  }
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(COOKIE_KEY + "="))
    ?.slice(COOKIE_KEY.length + 1);
  const browserLanguages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return resolveAppLanguagePreference(saved, cookie, browserLanguages);
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
    const normalized = normalizeAppLanguage(value);
    if (!normalized) return;
    setLanguage(normalized);
    applyLanguage(normalized);
    try {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // Cookie still preserves the selection.
    }
    document.cookie = `${COOKIE_KEY}=${normalized}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    window.dispatchEvent(new CustomEvent("zavqera-language-change", { detail: normalized }));
  }

  const labels = LABELS[language];
  return (
    <label className="language-switcher">
      <span className="visually-hidden">{labels.language}</span>
      <select aria-label={labels.language} value={language} onChange={(event) => changeLanguage(event.target.value)}>
        {APP_LANGUAGES.map((value) => (
          <option key={value} value={value}>
            {labels[({ en: "english", nb: "norwegian", ar: "arabic", es: "spanish", fr: "french", de: "german" } as const)[value]]}
          </option>
        ))}
      </select>
    </label>
  );
}
