export async function createAuthenticatedBearerContext({
  accessToken,
  supabaseUrl,
  publishableKey,
  createClient,
}) {
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Supabase is not configured.");
  }
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new Error("A bearer access token is required.");
  }

  // Keep all quota RPCs on the authenticated user's own PostgREST context.
  const supabase = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    accessToken: async () => accessToken,
  });

  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) return null;
  return { user: data.user, supabase };
}
