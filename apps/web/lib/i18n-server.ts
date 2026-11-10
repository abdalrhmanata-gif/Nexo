import { cookies, headers } from "next/headers";
import { LANGUAGE_COOKIE, isSupportedLanguage, translate, type AppLanguage } from "./i18n";
import { firstSupportedLanguage, languagesFromAcceptHeader } from "./language-preference.mjs";

// Server components cannot use the client hook, but the switcher writes the
// choice to a cookie, so the language is readable here.
//
// Without a cookie this used to answer English, and the client then rendered
// in the browser's language: a first-time visitor from Norway got a page in
// two languages, and a template wrote an English draft from a Norwegian card.
// The browser states its languages on every request, so the server reads the
// same list the client would and arrives at the same answer.
export async function getLanguage(): Promise<AppLanguage> {
  try {
    const store = await cookies();
    const value = store.get(LANGUAGE_COOKIE)?.value;
    if (isSupportedLanguage(value)) return value;
    const requested = (await headers()).get("accept-language");
    return firstSupportedLanguage(languagesFromAcceptHeader(requested)) ?? "en";
  } catch {
    return "en";
  }
}

/** Translator for a server component: `const t = await getTranslate();` */
export async function getTranslate(): Promise<(en: string) => string> {
  const language = await getLanguage();
  return (en: string) => translate(en, language);
}
