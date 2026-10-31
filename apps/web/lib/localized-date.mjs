import { normalizeAppLanguage } from "./app-language.mjs";

const LOCALES = Object.freeze({
  en: "en-US",
  nb: "nb-NO",
  ar: "ar",
  es: "es-ES",
  fr: "fr-FR",
  de: "de-DE",
});

function localeFor(language) {
  return LOCALES[normalizeAppLanguage(language) ?? "en"];
}

export function formatUiRelativeDate(value, language) {
  if (typeof value !== "string") return "";
  const relative = value.trim().toLowerCase();
  let days;

  if (relative === "yesterday") days = -1;
  else if (relative === "today") days = 0;
  else if (relative === "tomorrow") days = 1;
  else {
    const ago = relative.match(/^(\d+) days? ago$/);
    const future = relative.match(/^in (\d+) days?$/);
    if (ago) days = -Number(ago[1]);
    else if (future) days = Number(future[1]);
    else return value;
  }

  return new Intl.RelativeTimeFormat(localeFor(language), { numeric: "auto" }).format(days, "day");
}

export function formatUiAbsoluteDate(value, language) {
  if (typeof value !== "string" || !value.trim()) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeFor(language), {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}


export function formatUiDateTime(value, language) {
  if (typeof value !== "string" || !value.trim()) return "";
  const relative = value.trim();
  const minutesAgo = relative.match(/^(\\d+)\\s*(?:min|mins|minutes?)\\s+ago$/i);
  if (minutesAgo) {
    return new Intl.RelativeTimeFormat(localeFor(language), { numeric: "auto" }).format(-Number(minutesAgo[1]), "minute");
  }
  const hoursAgo = relative.match(/^(\\d+)\\s*(?:hr|hrs|hours?)\\s+ago$/i);
  if (hoursAgo) {
    return new Intl.RelativeTimeFormat(localeFor(language), { numeric: "auto" }).format(-Number(hoursAgo[1]), "hour");
  }
  const relativeDate = formatUiRelativeDate(relative, language);
  if (relativeDate !== relative) return relativeDate;
  const date = new Date(relative);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
