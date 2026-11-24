// The HTTP edges of the MCP server: how an assistant finds out where to sign
// the person in (RFC 9728 protected resource metadata), the 401 challenge
// that starts sign-in, and the headers every answer carries. Pure.
//
// The authorization server is the project's Supabase Auth, acting as an
// OAuth 2.1 server with dynamic client registration: ChatGPT, Claude and
// Gemini register themselves there, the person approves on zavqera.com
// (/oauth/consent), and the token they receive is the person's own, so row
// level security applies to every tool exactly as on the website.

import { TOOL_SCOPES } from "./tools.mjs";

export const MCP_PATH = "/mcp";
export const RESOURCE_METADATA_PATH = "/.well-known/oauth-protected-resource/mcp";

/** The issuer of tokens, as Supabase Auth names itself: `<project URL>/auth/v1`. */
export function authorizationServerFor(supabaseUrl) {
  return `${String(supabaseUrl).replace(/\/+$/, "")}/auth/v1`;
}

export function protectedResourceMetadata({ origin, supabaseUrl }) {
  return {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [authorizationServerFor(supabaseUrl)],
    scopes_supported: [...TOOL_SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "ZAVQERA",
    resource_documentation: `${origin}/ai`,
    resource_policy_uri: `${origin}/privacy`,
    resource_tos_uri: `${origin}/terms`,
  };
}

const quote = (value) => String(value).replace(/["\\]/g, "");

/** The WWW-Authenticate value of a 401: where the metadata is, and why. */
export function authChallenge(origin, error) {
  const parts = [`resource_metadata="${origin}${RESOURCE_METADATA_PATH}"`, `scope="${TOOL_SCOPES.join(" ")}"`];
  if (error) {
    parts.push(`error="invalid_token"`, `error_description="${quote(error)}"`);
  }
  return `Bearer ${parts.join(", ")}`;
}

/** The token from `Authorization: Bearer …`, or null. Never from the URL. */
export function bearerToken(header) {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+([A-Za-z0-9._~+/=-]+)\s*$/i.exec(header.trim());
  return match ? match[1] : null;
}

/**
 * Cross-origin access for browser-based MCP clients (such as the MCP
 * Inspector). Safe to open to every origin: the server reads no cookies,
 * only a bearer token the client sends on purpose.
 */
export const CORS_HEADERS = Object.freeze({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
});
