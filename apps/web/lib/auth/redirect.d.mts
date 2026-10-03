export declare const DEFAULT_POST_AUTH_PATH: string;
export declare function safeNextPath(value: string | null | undefined): string;
export declare function authErrorPath(reason: string): string;
export declare function resolveRequestOrigin(headers: Headers, fallbackUrl: string): string;
export declare function resolveAuthCallbackOrigin(configuredSiteUrl: string | undefined, headers: Headers, fallbackUrl: string): string;
