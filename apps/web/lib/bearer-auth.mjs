export function parseAuthorizationHeader(value) {
  if (value === null) return { kind: "cookie" };

  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  if (!match) return { kind: "invalid" };

  return { kind: "bearer", token: match[1] };
}
