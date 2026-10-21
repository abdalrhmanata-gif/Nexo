import type { SupabaseClient, User } from "@supabase/supabase-js";

export function createAuthenticatedBearerContext(args: {
  accessToken: string;
  supabaseUrl: string | undefined;
  publishableKey: string | undefined;
  createClient: typeof import("@supabase/supabase-js").createClient;
}): Promise<{ user: User; supabase: SupabaseClient } | null>;
