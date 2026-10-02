"use client";

import { useEffect, useState } from "react";

export type AppLanguage = "en" | "nb" | "ar";

const STORAGE_KEY = "zavqera-language";
const SUPPORTED_LANGUAGES: AppLanguage[] = ["en", "nb", "ar"];
const LABELS: Record<AppLanguage, { language: string; english: string; norwegian: string; arabic: string }> = {
  en: { language: "Language", english: "English", norwegian: "Norsk", arabic: "العربية" },
  nb: { language: "Språk", english: "English", norwegian: "Norsk", arabic: "العربية" },
  ar: { language: "اللغة", english: "English", norwegian: "Norsk", arabic: "العربية" },
};

function detectLanguage(): AppLanguage {
  if (typeof navigator === "undefined") return "en";
  for (const candidate of navigator.languages ?? [navigator.language]) {
    const code = candidate.toLowerCase().split("-")[0];
    if (SUPPORTED_LANGUAGES.includes(code as AppLanguage)) return code as AppLanguage;
  }
  return "en";
}

function readPreference(): AppLanguage {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && SUPPORTED_LANGUAGES.includes(saved as AppLanguage)) return saved as AppLanguage;
  } catch {
    // Storage can be unavailable in private or restricted browsing contexts.
  }
  return detectLanguage();
}

export function LanguageSwitcher() {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    const preferred = readPreference();
    setLanguage(preferred);
    document.documentElement.lang = preferred;
    document.documentElement.dir = preferred === "ar" ? "rtl" : "ltr";
  }, []);

  function changeLanguage(value: string) {
    if (!SUPPORTED_LANGUAGES.includes(value as AppLanguage)) return;
    const next = value as AppLanguage;
    setLanguage(next);
    document.documentElement.lang = next;
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The selection remains active for this page even if storage is unavailable.
    }
  }

  const labels = LABELS[language];
  return (
    <label className="language-switcher">
      <span className="visually-hidden">{labels.language}</span>
      <select aria-label={labels.language} value={language} onChange={(event) => changeLanguage(event.target.value)}>
        <option value="en">{labels.english}</option>
        <option value="nb">{labels.norwegian}</option>
        <option value="ar">{labels.arabic}</option>
      </select>
    </label>
  );
}
