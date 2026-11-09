"use client";

import { useEffect, useState } from "react";
import { LocalizedText, useTranslate } from "./localized-text";

export type AppTheme = "light" | "dark";

const STORAGE_KEY = "zavqera-theme";
const COOKIE_KEY = "zavqera-theme";

function validTheme(value: string | null | undefined): value is AppTheme {
  return value === "light" || value === "dark";
}

function readPreference(): AppTheme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (validTheme(saved)) return saved;
  } catch {
    // Continue with the cookie or the system setting when storage is unavailable.
  }
  const cookie = document.cookie.split("; ").find((part) => part.startsWith(COOKIE_KEY + "="))?.split("=")[1];
  if (validTheme(cookie)) return cookie;
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeSwitcher() {
  const t = useTranslate();
  const [theme, setTheme] = useState<AppTheme>("light");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const preferred = readPreference();
    setTheme(preferred);
    applyTheme(preferred);
    setReady(true);
  }, []);

  function toggleTheme() {
    const next: AppTheme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The cookie still preserves the selection.
    }
    document.cookie = `${COOKIE_KEY}=${next}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
  }

  const goingDark = theme !== "dark";

  return (
    <button
      type="button"
      className="theme-switcher"
      onClick={toggleTheme}
      aria-pressed={theme === "dark"}
      // Render a stable label until the stored preference is known, so the
      // button does not flip on hydration.
      suppressHydrationWarning
      title={ready && !goingDark ? t("Switch to light mode") : t("Switch to dark mode")}
    >
      <span aria-hidden="true" className="theme-switcher-icon">
        {ready && !goingDark ? (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
            <circle cx="12" cy="12" r="4.6" fill="currentColor" stroke="none" />
            <path d="M12 1.6v2.6M12 19.8v2.6M3.9 3.9l1.9 1.9M18.2 18.2l1.9 1.9M1.6 12h2.6M19.8 12h2.6M3.9 20.1l1.9-1.9M18.2 5.8l1.9-1.9" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
          </svg>
        )}
      </span>
      <span className="visually-hidden">
        {ready && !goingDark ? <LocalizedText en="Switch to light mode" /> : <LocalizedText en="Switch to dark mode" />}
      </span>
    </button>
  );
}
