export declare const SITE_URL: string;
export declare const PROFILES: readonly string[];
export declare const FOUNDER: Readonly<{ name: string; profile: string }>;
export declare const PLAN_PRICES_USD: Readonly<{ Free: number; Plus: number; Pro: number; Scale: number }>;
export declare const SITE_DESCRIPTION: string;
export declare const FEATURES: readonly string[];
export declare function homeStructuredData(): Record<string, unknown>;
export declare function jsonLdScript(value: unknown): string;
