const SUPPORTED_LANGUAGES = new Set(["en", "nb", "ar", "es", "fr", "de"]);

export const APP_LANGUAGES = Object.freeze(["en", "nb", "ar", "es", "fr", "de"]);

export function normalizeAppLanguage(value) {
  if (typeof value !== "string") return null;
  const language = value.trim().replace(/_/g, "-").toLowerCase().split("-")[0];
  if (language === "no") return "nb";
  return SUPPORTED_LANGUAGES.has(language) ? language : null;
}

export function resolveAppLanguagePreference(storageValue, cookieValue, browserLanguages = []) {
  const stored = normalizeAppLanguage(storageValue);
  if (stored) return stored;

  const cookie = normalizeAppLanguage(cookieValue);
  if (cookie) return cookie;

  for (const candidate of browserLanguages) {
    const detected = normalizeAppLanguage(candidate);
    if (detected) return detected;
  }
  return "en";
}
