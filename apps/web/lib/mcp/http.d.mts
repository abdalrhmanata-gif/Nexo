export declare const MCP_PATH: string;
export declare const RESOURCE_METADATA_PATH: string;
export declare function authorizationServerFor(supabaseUrl: string): string;
export declare function protectedResourceMetadata(input: { origin: string; supabaseUrl: string }): Record<string, unknown>;
export declare function authChallenge(origin: string, error?: string): string;
export declare function bearerToken(header: string | null | undefined): string | null;
export declare const CORS_HEADERS: Readonly<Record<string, string>>;
