import type { SupabaseClient } from "@supabase/supabase-js";

// Supabase Auth's OAuth 2.1 server, as the consent and connections pages use
// it. Typed here rather than taken from supabase-js, so the pages compile on
// any client version and fail softly (as "not available") if a method is
// missing at run time.

export type AuthorizationDetails = {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name?: string | null; uri?: string | null; logo_uri?: string | null };
  user?: { id: string; email?: string | null };
  scope: string;
};
export type AuthorizationRedirect = { redirect_url: string };
export type Grant = { client: { id: string; name?: string | null }; scopes?: string[]; granted_at: string };

type Result<T> = { data: T | null; error: unknown };
type OAuthServerApi = {
  getAuthorizationDetails(authorizationId: string): Promise<Result<AuthorizationDetails | AuthorizationRedirect>>;
  approveAuthorization(authorizationId: string, options?: { skipBrowserRedirect?: boolean }): Promise<Result<AuthorizationRedirect>>;
  denyAuthorization(authorizationId: string, options?: { skipBrowserRedirect?: boolean }): Promise<Result<AuthorizationRedirect>>;
  listGrants(): Promise<Result<Grant[]>>;
  revokeGrant(options: { clientId: string }): Promise<Result<unknown>>;
};

const UNAVAILABLE = { data: null, error: new Error("The OAuth server API is not available.") };

function api(supabase: SupabaseClient): Partial<OAuthServerApi> {
  return ((supabase.auth as unknown as { oauth?: Partial<OAuthServerApi> }).oauth) ?? {};
}

export async function authorizationDetails(supabase: SupabaseClient, id: string) {
  const oauth = api(supabase);
  return oauth.getAuthorizationDetails ? oauth.getAuthorizationDetails(id) : UNAVAILABLE;
}

export async function decide(supabase: SupabaseClient, id: string, approve: boolean) {
  const oauth = api(supabase);
  const call = approve ? oauth.approveAuthorization : oauth.denyAuthorization;
  return call ? call.call(oauth, id, { skipBrowserRedirect: true }) : UNAVAILABLE;
}

export async function grants(supabase: SupabaseClient) {
  const oauth = api(supabase);
  return oauth.listGrants ? oauth.listGrants() : UNAVAILABLE;
}

export async function revokeGrant(supabase: SupabaseClient, clientId: string) {
  const oauth = api(supabase);
  return oauth.revokeGrant ? oauth.revokeGrant({ clientId }) : UNAVAILABLE;
}
