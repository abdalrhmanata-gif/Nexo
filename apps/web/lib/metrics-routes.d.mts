export declare const COUNTED_ROUTES: string[];

/** Reduce a pathname to one of the counted routes, or "other". */
export declare function normaliseRoute(pathname: string | null | undefined): string;

/** Reduce a referrer URL to a bare host, "internal", or "direct". */
export declare function normaliseReferrer(
  referrer: string | null | undefined,
  selfHost?: string | null,
): string;
