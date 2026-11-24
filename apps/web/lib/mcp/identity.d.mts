export type TokenOwner = { id: string };
export type TokenCheck = TokenOwner | null | "unavailable";

export declare const USERINFO_PATH: string;
export declare function userInfoUrl(supabaseUrl: string): string;
export declare function readUserInfo(
  status: number,
  body: unknown,
): { outcome: "user"; id: string } | { outcome: "rejected" } | { outcome: "unsupported" } | { outcome: "unavailable" };
export declare function checkAccessToken(input: {
  supabaseUrl: string;
  apiKey: string;
  token: string | null | undefined;
  fallback?: () => Promise<TokenOwner | null>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<TokenCheck>;
