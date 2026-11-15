export type UmamiPayload = Record<string, unknown>;
export type UmamiContext = { pathname: string; referrer: string; hostname: string };

export declare const UMAMI_SCRIPT_URL: string;
export declare const UMAMI_WEBSITE_ID: string;
export declare const UMAMI_DOMAINS: string[];
export declare function isUmamiHost(hostname: unknown): boolean;
export declare function umamiPageFor(pathname: unknown): string | null;
export declare function umamiReferrerFor(referrer: unknown, selfHost: unknown): string;
export declare function umamiPageview(base: UmamiPayload, context: UmamiContext): UmamiPayload | null;
