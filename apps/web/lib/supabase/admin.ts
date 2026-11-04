import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

/** Server-only RPC client. W66 revokes direct service-role access to the execution ledger. */
export function createSupabaseAdminClient() {
  // Prefer the project-scoped server key documented in .env.example. Keep the
  // standard Supabase variable as a compatibility fallback for existing hosts.
  const serviceRoleKey = process.env.ZAVQERA_SERVER_DB_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("TRUSTED_EXECUTION_NOT_CONFIGURED");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
