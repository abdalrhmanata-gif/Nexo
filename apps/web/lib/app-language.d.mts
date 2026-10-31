export type AppLanguage = "en" | "nb" | "ar" | "es" | "fr" | "de";

export declare const APP_LANGUAGES: readonly AppLanguage[];

export declare function normalizeAppLanguage(value: unknown): AppLanguage | null;

export declare function resolveAppLanguagePreference(
  storageValue: unknown,
  cookieValue: unknown,
  browserLanguages?: readonly unknown[]
): AppLanguage;
