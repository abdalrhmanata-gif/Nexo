"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { resolveLanguage } from "../lib/language-preference.mjs";

export type AppLanguage = "en" | "nb" | "ar" | "es" | "fr" | "de";

const STORAGE_KEY = "zavqera-language";
const COOKIE_KEY = "zavqera-language";
const SUPPORTED_LANGUAGES: AppLanguage[] = ["en", "nb", "ar", "es", "fr", "de"];
const LABELS: Record<AppLanguage, { language: string; english: string; norwegian: string; arabic: string; spanish: string; french: string; german: string }> = {
  en: { language: "Language", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
  nb: { language: "Språk", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
  ar: { language: "اللغة", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
  es: { language: "Idioma", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
  fr: { language: "Langue", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
  de: { language: "Sprache", english: "English", norwegian: "Norsk", arabic: "العربية", spanish: "Español", french: "Français", german: "Deutsch" },
};

function validLanguage(value: string | undefined): value is AppLanguage {
  return Boolean(value && SUPPORTED_LANGUAGES.includes(value as AppLanguage));
}

/** The choice the reader saved here, if storage holds one. */
function readSaved(): AppLanguage | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return validLanguage(saved ?? undefined) ? (saved as AppLanguage) : null;
  } catch {
    // Storage can be blocked; the cookie and the browser's languages still apply.
    return null;
  }
}

function readCookie(): string | undefined {
  return document.cookie.split("; ").find((part) => part.startsWith(COOKIE_KEY + "="))?.split("=")[1];
}

function writeCookie(value: AppLanguage) {
  document.cookie = `${COOKIE_KEY}=${value}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
}

function readPreference(): AppLanguage {
  return resolveLanguage({
    saved: readSaved(),
    cookie: readCookie(),
    browser: navigator.languages ?? [navigator.language],
  });
}

function applyLanguage(language: AppLanguage) {
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
}

export function LanguageSwitcher() {
  const [language, setLanguage] = useState<AppLanguage>("en");
  const router = useRouter();

  useEffect(() => {
    const preferred = readPreference();
    setLanguage(preferred);
    applyLanguage(preferred);
    // The server can only see the cookie. If the reader's saved choice is not
    // in it — the cookie expired, or was cleared while storage was kept — the
    // server has just rendered its half of the page in another language. Put
    // the choice back where the server can read it and ask for that half
    // again. Only a saved choice is written: a language merely detected from
    // the browser is not stored on the reader's device without their asking.
    const saved = readSaved();
    if (saved && readCookie() !== saved) {
      writeCookie(saved);
      router.refresh();
    }
  }, [router]);

  function changeLanguage(value: string) {
    if (!validLanguage(value)) return;
    setLanguage(value);
    applyLanguage(value);
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Cookie still preserves the selection.
    }
    writeCookie(value);
    window.dispatchEvent(new CustomEvent("zavqera-language-change", { detail: value }));
    // The event reaches the client components. The sentences the server
    // rendered — and the draft inside a template link — are still in the old
    // language until the server is asked again.
    router.refresh();
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
