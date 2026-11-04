"use client";

import { useEffect, useState } from "react";
import { LocalizedText } from "./localized-text";

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
      title={ready && !goingDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <span aria-hidden="true" className="theme-switcher-icon">
        {ready && !goingDark ? (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
