// One rule for "which language is this reader's", used by the server and by
// both client readers.
//
// There used to be three. The server read the cookie and otherwise said
// English. The text components read storage, the cookie, then only the first
// browser language. The switcher read the same but walked the whole browser
// list. A visitor who had never touched the switcher therefore got a page in
// two languages at once: Norwegian wherever a client component rendered, and
// English wherever the server did — including the draft a template writes
// into the new-mission form.

export const SUPPORTED_LANGUAGE_CODES = Object.freeze(["en", "nb", "ar", "es", "fr", "de"]);

// Norwegian browsers announce themselves three ways. Bokmål is the one this
// product is written in, and a Nynorsk reader is better served by it than by
// English.
const ALIASES = Object.freeze({ no: "nb", nn: "nb" });

/** "nb-NO" → "nb", "no" → "nb", "sv" → null. */
export function supportedLanguageFromTag(tag) {
  if (typeof tag !== "string") return null;
  const primary = tag.trim().toLowerCase().split(/[-_]/)[0];
  if (!primary) return null;
  const code = Object.hasOwn(ALIASES, primary) ? ALIASES[primary] : primary;
  return SUPPORTED_LANGUAGE_CODES.includes(code) ? code : null;
}

/** The first tag in the list this product is written in, or null. */
export function firstSupportedLanguage(tags) {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    const code = supportedLanguageFromTag(tag);
    if (code) return code;
  }
  return null;
}

/**
 * The tags of an Accept-Language header, most preferred first — the order a
 * browser reports in navigator.languages, so the server and the client reach
 * the same answer from the same reader.
 *
 * The header is the visitor's to write, so it is bounded before it is parsed.
 */
export function languagesFromAcceptHeader(header) {
  if (typeof header !== "string" || !header) return [];
  const entries = [];
  for (const [index, part] of header.slice(0, 400).split(",").slice(0, 20).entries()) {
    const [tag, ...parameters] = part.split(";");
    const name = tag.trim();
    if (!/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/.test(name)) continue;
    let quality = 1;
    for (const parameter of parameters) {
      const match = /^\s*q\s*=\s*([01](?:\.\d{0,3})?)\s*$/.exec(parameter);
      if (match) quality = Number(match[1]);
    }
    if (!(quality > 0)) continue;
    entries.push({ name, quality, index });
  }
  entries.sort((a, b) => b.quality - a.quality || a.index - b.index);
  return entries.map((entry) => entry.name);
}

/**
 * A choice the reader made outranks anything detected: what they saved, then
 * the cookie that carries it to the server, then their browser's list.
 */
export function resolveLanguage({ saved, cookie, browser } = {}) {
  for (const explicit of [saved, cookie]) {
    if (typeof explicit === "string" && SUPPORTED_LANGUAGE_CODES.includes(explicit)) return explicit;
  }
  return firstSupportedLanguage(browser) ?? "en";
}
