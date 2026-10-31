export type UiLanguage = "en" | "nb" | "ar" | "es" | "fr" | "de";
export declare function translateUiText(language: UiLanguage, source: string): string;
export declare const UI_TRANSLATION_KEYS: readonly string[];
export declare const UI_TRANSLATIONS: Readonly<Record<Exclude<UiLanguage, "en">, Readonly<Record<string, string>>>>;
