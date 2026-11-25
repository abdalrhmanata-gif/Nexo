import { createServerClient } from "@supabase/ssr";
import { cache } from "react";
import { cookies } from "next/headers";
import { supabasePublishableKey, supabaseUrl } from "./config";

export async function createSupabaseServerClient() {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase is not configured. Copy .env.example to .env.local.");
  }

  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components cannot always mutate cookies; middleware refreshes them.
        }
      },
    },
  });
}

/**
 * The signed-in user, asked of Supabase Auth once per request. The header,
 * the page and the repositories it builds all need it; each separate
 * getUser() was a round trip to the auth server (seen 25 Nov: about a third
 * of a second each from the functions region to the database's region).
 */
export const getAuthenticatedUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

export type BillingOverview = { plan?: string; generations_used?: number; monthly_limit?: number };

/**
 * The signed-in person's plan and AI allowance, read once per request: the
 * account menu and the page both need it, and each read was a round trip.
 * Null when it cannot be read; callers keep their own defaults.
 */
export const readBillingOverview = cache(async (): Promise<BillingOverview | null> => {
  try {
    const supabase = await createSupabaseServerClient();
    const result = await supabase.rpc("billing_overview");
    if (result.error || !Array.isArray(result.data)) return null;
    return (result.data[0] as BillingOverview | undefined) ?? null;
  } catch {
    return null;
  }
});
