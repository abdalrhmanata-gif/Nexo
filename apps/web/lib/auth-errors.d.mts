export const AUTH_ERROR_FALLBACK: string;
export const AUTH_ERROR_MESSAGES: Readonly<Record<string, string>>;
/** Our sentence for a provider error. Never the provider's own. */
export function authErrorMessage(error: unknown): string;
