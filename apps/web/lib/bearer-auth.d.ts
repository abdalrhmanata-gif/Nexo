export type ParsedAuthorizationHeader =
  | { kind: "cookie" }
  | { kind: "bearer"; token: string }
  | { kind: "invalid" };

export function parseAuthorizationHeader(
  value: string | null,
): ParsedAuthorizationHeader;
