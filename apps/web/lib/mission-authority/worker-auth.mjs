import { timingSafeEqual } from "node:crypto";

const TOKEN_PATTERN = /^[A-Za-z0-9._~-]{32,512}$/;

export function isTrustedExecutionWorkerRequest(authorization, expectedToken) {
  if (typeof authorization !== "string" || typeof expectedToken !== "string") return false;
  if (!TOKEN_PATTERN.test(expectedToken)) return false;
  if (!authorization.startsWith("Bearer ")) return false;
  const suppliedToken = authorization.slice(7);
  if (!TOKEN_PATTERN.test(suppliedToken)) return false;
  const supplied = Buffer.from(suppliedToken, "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
