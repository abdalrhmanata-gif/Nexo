import { cookies } from "next/headers";
import { isSupportedLanguage, translate, type AppLanguage } from "./i18n";

// Server components cannot use the client hook, but the switcher also writes the
// choice to a cookie, so the language is readable here. A server render falls
// back to English when no cookie is set; the client corrects it on hydration.
export async function getLanguage(): Promise<AppLanguage> {
  try {
    const store = await cookies();
    const value = store.get("zavqera-language")?.value;
    return isSupportedLanguage(value) ? value : "en";
  } catch {
    return "en";
  }
}

/** Translator for a server component: `const t = await getTranslate();` */
export async function getTranslate(): Promise<(en: string) => string> {
  const language = await getLanguage();
  return (en: string) => translate(en, language);
}
