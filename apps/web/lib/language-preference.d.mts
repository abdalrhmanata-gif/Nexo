import type { AppLanguage } from "./i18n";

export declare const SUPPORTED_LANGUAGE_CODES: readonly AppLanguage[];
export declare function supportedLanguageFromTag(tag: unknown): AppLanguage | null;
export declare function firstSupportedLanguage(tags: readonly string[] | null | undefined): AppLanguage | null;
export declare function languagesFromAcceptHeader(header: string | null | undefined): string[];
export declare function resolveLanguage(sources?: {
  saved?: string | null;
  cookie?: string | null;
  browser?: readonly string[] | null;
}): AppLanguage;
